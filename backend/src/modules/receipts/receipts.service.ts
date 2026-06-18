import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/events/event-bus.service';
import {
  incrementInventory,
} from '../stock/stock-atomic.util';
import {
  CreateReceiptDto,
  AddReceiptItemDto,
  ImportReceiptsDto,
  BulkReceiptItemDto,
} from './receipts.dto';
import { GoodsReceiptStatus, MovementType, ReceiptSource } from '@prisma/client';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Scan barcode - kiểm tra sản phẩm tồn tại chưa
   * Trả về: exists=true nếu sản phẩm đã có → suggest cộng dồn
   * Trả về: exists=false nếu sản phẩm mới → suggest tạo mới
   */
  async scanBarcode(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      return { exists: false, action: 'create-new' as const, suggestedCode: '' };
    }

    // Ưu tiên variant
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        OR: [{ productCode: trimmed }, { sku: trimmed }],
        product: { deletedAt: null },
      },
      include: {
        product: { include: { images: { take: 1, where: { isPrimary: true } } } },
        inventory: true,
      },
    });

    if (variant) {
      return {
        exists: true,
        action: 'add-quantity' as const,
        product: {
          id: variant.productId,
          productCode: variant.productCode ?? variant.sku,
          sku: variant.sku,
          name: variant.product.name + (variant.name ? ` - ${variant.name}` : ''),
          variantId: variant.id,
          variantName: variant.name ?? undefined,
          quantity: variant.inventory?.quantity ?? 0,
          imageUrl: variant.product.images[0]?.url,
        },
        suggestedCode: variant.productCode ?? variant.sku,
      };
    }

    // Product cha
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ productCode: trimmed }, { sku: trimmed }, { supplierCode: trimmed }],
        deletedAt: null,
      },
      include: { images: { take: 1, where: { isPrimary: true } }, inventory: true },
    });

    if (product) {
      return {
        exists: true,
        action: 'add-quantity' as const,
        product: {
          id: product.id,
          productCode: product.productCode,
          sku: product.sku,
          name: product.name,
          variantId: null,
          quantity: product.inventory?.quantity ?? 0,
          imageUrl: product.images[0]?.url,
        },
        suggestedCode: product.productCode,
      };
    }

    // Không tìm thấy → gợi ý tạo mới
    return {
      exists: false,
      action: 'create-new' as const,
      suggestedCode: trimmed,
    };
  }

  /**
   * Tạo nhanh sản phẩm mới từ barcode scan
   * Auto-assign category "Uncategorized" nếu có
   */
  async createQuickProduct(userId: string, productCode: string, name?: string) {
    const trimmed = productCode.trim().toUpperCase();

    // Kiểm tra đã tồn tại chưa
    const existing = await this.prisma.product.findFirst({
      where: {
        OR: [{ productCode: trimmed }, { sku: trimmed }],
        deletedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException(`Sản phẩm với mã "${trimmed}" đã tồn tại`);
    }

    // Tìm category "Uncategorized" hoặc tạo mới
    let category = await this.prisma.category.findFirst({
      where: { name: { equals: 'Uncategorized', mode: 'insensitive' } },
    });
    if (!category) {
      category = await this.prisma.category.findFirst({ where: {} }); // Lấy category đầu tiên
    }
    if (!category) {
      throw new BadRequestException('Không tìm thấy category nào trong hệ thống');
    }

    // Tạo sản phẩm mới (đã được phân loại)
    const product = await this.prisma.product.create({
      data: {
        id: crypto.randomUUID(),
        sku: trimmed,
        productCode: trimmed,
        slug: `${trimmed.toLowerCase()}-${Date.now()}`,
        name: name?.trim() || `Sản phẩm ${trimmed}`,
        categoryId: category.id,
        basePrice: 0,
        visibility: 'WHOLESALE',
        trackInventory: true,
        isClassified: true, // Đánh dấu là đã phân loại để hiện trong order search
      },
    });

    // Tạo inventory record
    await this.prisma.inventory.create({
      data: {
        productId: product.id,
        quantity: 0,
        reservedQty: 0,
        webListedQty: 0,
        webSoldQty: 0,
        webReservedQty: 0,
        lowStockThreshold: 0,
      },
    });

    this.logger.log(`Quick product created: ${product.productCode} by user ${userId}`);

    return {
      id: product.id,
      productCode: product.productCode,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      quantity: 0,
    };
  }

  /**
   * Tạo phiếu nhập mới (DRAFT)
   */
  async createReceipt(userId: string, dto: CreateReceiptDto) {
    // Lấy warehouseId từ staff nếu không truyền
    const staff = await this.prisma.warehouseStaff.findUnique({
      where: { userId },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên kho');

    const warehouseId = dto.warehouseId ?? staff.warehouseId;
    const receiptNumber = await this.generateReceiptNumber();

    return this.prisma.goodsReceipt.create({
      data: {
        receiptNumber,
        warehouseId,
        supplierId: dto.supplierId,
        receivedById: staff.id,
        status: GoodsReceiptStatus.DRAFT,
        source: dto.source ?? ReceiptSource.MANUAL,
        note: dto.note,
      },
    });
  }

  /**
   * Helper: lấy staffId từ userId
   */
  private async getStaffId(userId: string): Promise<string> {
    const staff = await this.prisma.warehouseStaff.findUnique({
      where: { userId },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên kho');
    return staff.id;
  }

  /**
   * Thêm 1 sản phẩm vào phiếu (DRAFT).
   * Tra cứu product theo productCode/SKU.
   * Nếu là variant → tăng reserved ở variant; nếu không thì parent.
   */
  async addItem(userId: string, dto: AddReceiptItemDto) {
    const staffId = await this.getStaffId(userId);
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: dto.receiptId },
    });
    if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new BadRequestException('Phiếu đã xác nhận, không thể thêm');
    }
    if (receipt.receivedById !== staffId) {
      throw new BadRequestException('Bạn không có quyền sửa phiếu này');
    }

    // Tra cứu sản phẩm
    const product = await this.findProductByCode(dto.productCode);
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm với mã "${dto.productCode}"`);
    }

    return this.prisma.goodsReceiptItem.create({
      data: {
        receiptId: receipt.id,
        productId: product.productId,
        variantId: product.variantId,
        productCode: product.productCode,
        productName: product.name,
        sku: product.sku,
        expectedQuantity: 0,
        receivedQuantity: dto.receivedQuantity,
        unitCost: dto.unitCost,
        lotNumber: dto.lotNumber,
        note: dto.note,
      },
    });
  }

  /**
   * Xác nhận phiếu nhập → cập nhật tồn kho + ghi movement
   */
  async confirmReceipt(userId: string, receiptId: string) {
    const staffId = await this.getStaffId(userId);
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id: receiptId },
        include: { items: true },
      });
      if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
      if (receipt.status !== GoodsReceiptStatus.DRAFT) {
        throw new BadRequestException('Phiếu đã được xử lý');
      }
      if (receipt.items.length === 0) {
        throw new BadRequestException('Phiếu chưa có sản phẩm nào');
      }
      if (receipt.receivedById !== staffId) {
        throw new BadRequestException('Bạn không có quyền xác nhận phiếu này');
      }

      let totalQty = 0;

      for (const item of receipt.items) {
        if (item.receivedQuantity <= 0) continue;

        // Cộng dồn inventory (atomic)
        await incrementInventory(
          tx,
          item.variantId
            ? { productId: item.productId!, variantId: item.variantId }
            : { productId: item.productId! },
          item.receivedQuantity,
        );

        // Ghi movement
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            type: MovementType.GOODS_RECEIPT,
            quantity: item.receivedQuantity,
            reference: receipt.receiptNumber,
            note: item.note ?? `Nhập từ phiếu ${receipt.receiptNumber}`,
            warehouseStaffId: staffId,
          },
        });

        totalQty += item.receivedQuantity;
      }

      // Cập nhật trạng thái
      const updated = await tx.goodsReceipt.update({
        where: { id: receiptId },
        data: {
          status: GoodsReceiptStatus.CONFIRMED,
          completedAt: new Date(),
          totalQuantity: totalQty,
          totalSku: receipt.items.length,
        },
        include: { items: true },
      });

      // Sau khi commit, publish event
      setImmediate(() => {
        this.eventBus.publish('stock.changed', {
          receiptNumber: updated.receiptNumber,
          warehouseId: updated.warehouseId,
          items: updated.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            productCode: it.productCode,
            quantity: it.receivedQuantity,
          })),
        }, updated.warehouseId);
      });

      return updated;
    });
  }

  /**
   * Hủy phiếu
   */
  async cancelReceipt(userId: string, receiptId: string) {
    const staffId = await this.getStaffId(userId);
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
    });
    if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
    if (receipt.status === GoodsReceiptStatus.CONFIRMED) {
      throw new BadRequestException('Phiếu đã xác nhận, không thể hủy');
    }
    if (receipt.receivedById !== staffId) {
      throw new BadRequestException('Bạn không có quyền hủy phiếu này');
    }
    return this.prisma.goodsReceipt.update({
      where: { id: receiptId },
      data: { status: GoodsReceiptStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  /**
   * Import từ CSV/Excel - tạo phiếu + items cùng lúc
   */
  async importFromBulk(userId: string, dto: ImportReceiptsDto) {
    if (dto.items.length === 0) {
      throw new BadRequestException('Danh sách sản phẩm trống');
    }

    // Tạo phiếu
    const receipt = await this.createReceipt(userId, {
      warehouseId: dto.warehouseId,
      supplierId: dto.supplierId,
      note: dto.note,
      source: ReceiptSource.FILE,
    });

    // Tạo items
    const errors: Array<{ row: number; code: string; message: string }> = [];
    const validItems: Array<{ idx: number; item: BulkReceiptItemDto; product: any }> = [];

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      const product = await this.findProductByCode(item.productCode);
      if (!product) {
        errors.push({ row: i + 1, code: item.productCode, message: 'Không tìm thấy sản phẩm' });
        continue;
      }
      validItems.push({ idx: i, item, product });
    }

    if (validItems.length === 0) {
      await this.prisma.goodsReceipt.delete({ where: { id: receipt.id } });
      throw new BadRequestException({
        message: 'Không có sản phẩm hợp lệ nào',
        errors,
      });
    }

    await this.prisma.goodsReceiptItem.createMany({
      data: validItems.map(({ item, product }) => ({
        receiptId: receipt.id,
        productId: product.productId,
        variantId: product.variantId,
        productCode: product.productCode,
        productName: item.productName ?? product.name,
        sku: product.sku,
        expectedQuantity: 0,
        receivedQuantity: item.receivedQuantity,
        unitCost: item.unitCost,
      })),
    });

    return {
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      totalItems: validItems.length,
      totalErrors: errors.length,
      errors,
    };
  }

  /**
   * Lấy danh sách phiếu nhập
   */
  async listReceipts(params: {
    warehouseId?: string;
    status?: GoodsReceiptStatus;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { warehouseId, status, fromDate, toDate, page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const [items, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          warehouse: { select: { code: true, name: true } },
          receivedBy: {
            select: {
              employeeCode: true,
              user: { select: { name: true, email: true } },
            },
          },
          supplier: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        warehouse: r.warehouse,
        supplier: r.supplier,
        receivedBy: r.receivedBy,
        status: r.status,
        source: r.source,
        note: r.note,
        totalQuantity: r.totalQuantity,
        totalSku: r.totalSku,
        itemCount: r._count.items,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Chi tiết phiếu nhập
   */
  async getReceipt(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        warehouse: true,
        supplier: true,
        receivedBy: {
          include: { user: { select: { email: true, name: true } } },
        },
        items: {
          include: {
            product: { select: { name: true, images: { take: 1 } } },
            variant: { select: { name: true, attributes: true, images: { take: 1 } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Không tìm thấy phiếu nhập');
    return receipt;
  }

  /**
   * Xóa 1 item khỏi phiếu (chỉ khi DRAFT)
   */
  async removeItem(userId: string, itemId: string) {
    const staffId = await this.getStaffId(userId);
    const item = await this.prisma.goodsReceiptItem.findUnique({
      where: { id: itemId },
      include: { receipt: true },
    });
    if (!item) throw new NotFoundException('Không tìm thấy item');
    if (item.receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new BadRequestException('Phiếu đã xác nhận, không thể xóa');
    }
    if (item.receipt.receivedById !== staffId) {
      throw new BadRequestException('Bạn không có quyền sửa phiếu này');
    }
    await this.prisma.goodsReceiptItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  /**
   * Tạo mã phiếu nhập tự động: GR-YYYYMMDD-XXXX
   */
  private async generateReceiptNumber(): Promise<string> {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `GR-${yyyymmdd}-`;

    // Đếm số phiếu trong ngày
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const count = await this.prisma.goodsReceipt.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });

    const next = String(count + 1).padStart(4, '0');
    return `${prefix}${next}`;
  }

  /**
   * Tìm sản phẩm theo productCode/SKU (hỗ trợ cả variant)
   */
  private async findProductByCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return null;

    // Ưu tiên variant
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        OR: [
          { productCode: trimmed },
          { sku: trimmed },
        ],
        product: { deletedAt: null },
      },
      include: { product: true },
    });

    if (variant) {
      return {
        productId: variant.productId,
        variantId: variant.id,
        productCode: variant.productCode ?? variant.sku,
        sku: variant.sku,
        name: variant.product.name + (variant.name ? ' - ' + variant.name : ''),
      };
    }

    // Product cha
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { productCode: trimmed },
          { sku: trimmed },
          { supplierCode: trimmed },
        ],
        deletedAt: null,
      },
    });

    if (product) {
      return {
        productId: product.id,
        variantId: null,
        productCode: product.productCode,
        sku: product.sku,
        name: product.name,
      };
    }

    return null;
  }
}

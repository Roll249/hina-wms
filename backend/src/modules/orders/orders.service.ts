import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/events/event-bus.service';
import { CreateOrderDto } from './orders.dto';
import { OrderStatus, PaymentMethod, OrderStatus as PrismaOrderStatus } from '@prisma/client';

/**
 * Quản lý đơn hàng tạo thủ công từ WMS (kho).
 * - Dùng khi khách mua offline hoặc đặt qua điện thoại.
 * - Đơn lưu vào bảng Order chung, đánh dấu isGuestOrder=true.
 * - Tự động tạo OutboundShipment PENDING để kho pick.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Tạo đơn hàng từ WMS (khách offline / đặt qua điện thoại).
   * Flow:
   *  1. Validate sản phẩm tồn tại + còn tồn kho
   *  2. Tạo Order với snapshot giá/tên
   *  3. Tự động tạo OutboundShipment PENDING để warehouse pick
   */
  async createOrderFromWms(userId: string, dto: CreateOrderDto) {
    // Lấy system user (GUEST) để gán customer - vì đơn WMS không có userId thật
    const guestUser = await this.getOrCreateGuestUser();
    const warehouseId = await this.getDefaultWarehouseId();

    // Validate sản phẩm + snapshot giá
    const itemsData: Array<{
      productId: string;
      variantId: string | null;
      productName: string;
      variantName: string | null;
      productCode: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const item of dto.items) {
      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: true },
        });
        if (!variant) {
          throw new NotFoundException(`Không tìm thấy variant ${item.variantId}`);
        }
        const price = Number(variant.basePrice ?? variant.product.basePrice);
        itemsData.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.product.name,
          variantName: variant.name,
          productCode: variant.product.productCode,
          sku: variant.sku,
          quantity: item.quantity,
          unitPrice: price,
          totalPrice: price * item.quantity,
        });
      } else {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new NotFoundException(`Không tìm thấy sản phẩm ${item.productId}`);
        }
        const price = Number(product.basePrice);
        itemsData.push({
          productId: product.id,
          variantId: null,
          productName: product.name,
          variantName: null,
          productCode: product.productCode,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice: price,
          totalPrice: price * item.quantity,
        });
      }
    }

    const subtotal = itemsData.reduce((sum, it) => sum + it.totalPrice, 0);
    const total = subtotal; // chưa tính ship/tax cho đơn offline

    const orderNumber = await this.generateOrderNumber();

    // Tạo đơn + shipment trong 1 transaction
    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId: guestUser.id,
          isGuestOrder: true,
          shippingAddress: {
            name: dto.customerName,
            phone: dto.customerPhone,
            address: dto.shippingAddress,
          } as any,
          subtotal,
          total,
          status: OrderStatus.CONFIRMED,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: 'PENDING' as any,
          customerNote: dto.customerNote,
          items: {
            create: itemsData.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              productName: it.productName,
              variantName: it.variantName,
              productCode: it.productCode,
              sku: it.sku,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
            })),
          },
        },
      });

      // Lấy lại order có items để tạo shipment
      const fullOrder = await tx.order.findUnique({
        where: { id: newOrder.id },
        include: { items: true },
      });
      if (!fullOrder) {
        throw new Error('Không thể tạo đơn hàng');
      }

      // Auto tạo shipment PENDING
      const shipmentNumber = await this.generateShipmentNumber(tx);
      await tx.outboundShipment.create({
        data: {
          shipmentNumber,
          orderId: fullOrder.id,
          orderNumber: fullOrder.orderNumber,
          warehouseId,
          status: 'PENDING' as any,
          items: {
            create: fullOrder.items.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              productCode: it.productCode,
              productName: it.variantName
                ? `${it.productName} - ${it.variantName}`
                : it.productName,
              sku: it.sku,
              orderQuantity: it.quantity,
              pickedQuantity: 0,
              packedQuantity: 0,
            })),
          },
        },
      });

      // Log status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: fullOrder.id,
          status: OrderStatus.CONFIRMED,
          note: `Tạo từ WMS bởi nhân viên kho. Khách: ${dto.customerName} (${dto.customerPhone})`,
          changedBy: userId,
        },
      });

      return fullOrder;
    });

    // Publish event
    setImmediate(() => {
      this.eventBus.publish('order.wms_created' as any, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        source: 'WMS',
      }, warehouseId);
    });

    return order;
  }

  /**
   * Tìm sản phẩm để thêm vào đơn (search by code, sku, name).
   * Trả về tối đa 20 kết quả.
   */
  async searchProductsForOrder(query: string) {
    if (!query || query.length < 1) return [];

    const products = await this.prisma.product.findMany({
      where: {
        isClassified: true,
        deletedAt: null,
        OR: [
          { productCode: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      include: {
        variants: {
          where: { id: { not: undefined } },
          take: 5,
        },
        inventory: { select: { quantity: true, reservedQty: true } },
        images: { take: 1, where: { isPrimary: true } },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      productCode: p.productCode,
      sku: p.sku,
      name: p.name,
      basePrice: Number(p.basePrice),
      available: (p.inventory?.quantity ?? 0) - (p.inventory?.reservedQty ?? 0),
      imageUrl: p.images[0]?.url ?? null,
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        basePrice: Number(v.basePrice ?? p.basePrice),
        attributes: v.attributes,
      })),
    }));
  }

  /**
   * Stats cho dashboard: tổng quan kho + đơn hàng hôm nay.
   */
  async getDashboardStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const [
      totalSkus,
      totalInventory,
      lowStockCount,
      pendingShipments,
      ordersToday,
      receiptsToday,
      shipmentsToday,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { deletedAt: null, isClassified: true },
      }),
      this.prisma.inventory.aggregate({
        _sum: { quantity: true },
      }),
      this.prisma.inventory.count({
        where: {
          quantity: { lte: 10 },
          product: { deletedAt: null, isClassified: true },
        },
      }),
      this.prisma.outboundShipment.count({
        where: { status: 'PENDING' as any },
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          isGuestOrder: true,
        },
      }),
      this.prisma.goodsReceipt.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      }),
      this.prisma.outboundShipment.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      }),
    ]);

    return {
      totalSkus,
      totalInventory: totalInventory._sum.quantity ?? 0,
      lowStockCount,
      pendingShipments,
      ordersToday,
      receiptsToday,
      shipmentsToday,
    };
  }

  // ----- helpers -----

  private async getOrCreateGuestUser() {
    // Tìm user hệ thống (email cố định) - dùng làm customer cho đơn WMS
    const SYSTEM_EMAIL = 'wms-guest@system.local';
    let user = await this.prisma.user.findUnique({
      where: { email: SYSTEM_EMAIL },
    });

    if (!user) {
      this.logger.warn(`Guest user chưa tồn tại, đang tạo mới (${SYSTEM_EMAIL})`);
      user = await this.prisma.user.create({
        data: {
          email: SYSTEM_EMAIL,
          name: 'WMS Guest (Offline Order)',
          password: '', // Không login được
          role: 'GUEST' as any,
          isActive: false,
        },
      });
    }

    return user;
  }

  private async getDefaultWarehouseId(): Promise<string> {
    const wh = await this.prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!wh) {
      throw new BadRequestException('Chưa cấu hình kho mặc định');
    }
    return wh.id;
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `WB-${yyyymmdd}-`;

    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const count = await this.prisma.order.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });

    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  private async generateShipmentNumber(tx: any): Promise<string> {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `SH-${yyyymmdd}-`;

    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const count = await tx.outboundShipment.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });

    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }
}

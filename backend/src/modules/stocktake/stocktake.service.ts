import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/events/event-bus.service';
import {
  StocktakeStatus,
  AdjustmentType,
  CreateStocktakeDto,
  StocktakeItemDto,
  AddStocktakeItemsDto,
  UpdateCountedQtyDto,
  ApplyStocktakeDto,
} from './stocktake.dto';
import { MovementType } from '@prisma/client';

@Injectable()
export class StocktakeService {
  private readonly logger = new Logger(StocktakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Tạo phiếu kiểm kê mới (DRAFT)
   */
  async createStocktake(userId: string, dto: CreateStocktakeDto) {
    // Generate stocktake number
    const count = await this.prisma.stocktake.count();
    const stocktakeNumber = `STK-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const stocktake = await this.prisma.stocktake.create({
      data: {
        stocktakeNumber,
        name: dto.name,
        note: dto.note,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        status: StocktakeStatus.DRAFT,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    this.logger.log(`Created stocktake ${stocktakeNumber} by user ${userId}`);
    return stocktake;
  }

  /**
   * Thêm items vào phiếu kiểm kê
   */
  async addItems(stocktakeId: string, dto: AddStocktakeItemsDto) {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id: stocktakeId },
    });
    if (!stocktake) {
      throw new NotFoundException('Phiếu kiểm kê không tồn tại');
    }
    if (stocktake.status !== StocktakeStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể thêm items khi phiếu ở trạng thái DRAFT');
    }

    const results = [];
    for (const item of dto.items) {
      // Get current inventory
      const inventory = await this.prisma.inventory.findFirst({
        where: {
          productId: item.productId,
          variantId: item.variantId || null,
        },
      });

      const expectedQty = inventory?.quantity ?? 0;

      const stocktakeItem = await this.prisma.stocktakeItem.create({
        data: {
          stocktakeId,
          productId: item.productId,
          variantId: item.variantId || null,
          expectedQty,
          countedQty: item.countedQty ?? expectedQty, // Default = expected if not specified
          note: item.note,
          adjustmentType: item.adjustmentType,
        },
      });
      results.push(stocktakeItem);
    }

    return results;
  }

  /**
   * Cập nhật số lượng đếm được
   */
  async updateCountedQty(
    stocktakeItemId: string,
    dto: UpdateCountedQtyDto,
    userId: string,
  ) {
    const item = await this.prisma.stocktakeItem.findUnique({
      where: { id: stocktakeItemId },
      include: { stocktake: true },
    });
    if (!item) {
      throw new NotFoundException('Item không tồn tại');
    }
    if (item.stocktake.status === StocktakeStatus.COMPLETED) {
      throw new BadRequestException('Phiếu đã hoàn thành, không thể sửa');
    }

    return this.prisma.stocktakeItem.update({
      where: { id: stocktakeItemId },
      data: {
        countedQty: dto.countedQty,
        note: dto.note ?? item.note,
        adjustmentType: dto.adjustmentType ?? item.adjustmentType,
        countedById: userId,
        countedAt: new Date(),
      },
    });
  }

  /**
   * Bắt đầu kiểm kê (chuyển sang IN_PROGRESS)
   */
  async startStocktake(stocktakeId: string, userId: string) {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id: stocktakeId },
      include: { items: true },
    });
    if (!stocktake) {
      throw new NotFoundException('Phiếu kiểm kê không tồn tại');
    }
    if (stocktake.status !== StocktakeStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể bắt đầu khi ở trạng thái DRAFT');
    }

    return this.prisma.stocktake.update({
      where: { id: stocktakeId },
      data: {
        status: StocktakeStatus.IN_PROGRESS,
        startedAt: new Date(),
        startedById: userId,
      },
    });
  }

  /**
   * Áp dụng điều chỉnh tồn kho (COMPLETED)
   */
  async applyStocktake(stocktakeId: string, dto: ApplyStocktakeDto, userId: string) {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id: stocktakeId },
      include: { items: true },
    });
    if (!stocktake) {
      throw new NotFoundException('Phiếu kiểm kê không tồn tại');
    }
    if (stocktake.status === StocktakeStatus.COMPLETED) {
      throw new BadRequestException('Phiếu đã được áp dụng');
    }
    if (stocktake.status === StocktakeStatus.CANCELLED) {
      throw new BadRequestException('Phiếu đã bị hủy');
    }

    // Calculate summary
    let adjustedCount = 0;
    let totalDifference = 0;

    // Apply adjustments in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      for (const item of stocktake.items) {
        const diff = item.countedQty - item.expectedQty;
        if (diff === 0) continue;

        adjustedCount++;
        totalDifference += diff;

        // Update inventory
        await tx.inventory.update({
          where: {
            productId_variantId: {
              productId: item.productId,
              variantId: item.variantId,
            },
          },
          data: {
            quantity: { increment: diff },
          },
        });

        // Create inventory movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: (await tx.inventory.findFirst({
              where: { productId: item.productId, variantId: item.variantId },
            }))?.id,
            productId: item.productId,
            variantId: item.variantId,
            type: MovementType.STOCKTAKE_ADJUST,
            quantity: diff,
            reference: stocktake.stocktakeNumber,
            note: item.note || dto.note || `Kiểm kê: ${item.expectedQty} → ${item.countedQty}`,
            createdBy: userId,
          },
        });
      }

      // Update stocktake status
      return tx.stocktake.update({
        where: { id: stocktakeId },
        data: {
          status: StocktakeStatus.COMPLETED,
          completedAt: new Date(),
          completedById: userId,
          adjustmentCount: adjustedCount,
          totalDifference,
        },
        include: { items: true },
      });
    });

    // Publish stock changed event
    for (const item of stocktake.items) {
      const diff = item.countedQty - item.expectedQty;
      if (diff !== 0) {
        const inventory = await this.prisma.inventory.findFirst({
          where: { productId: item.productId, variantId: item.variantId },
        });
        await this.eventBus.publish('stock.changed' as any, {
          inventoryId: inventory?.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: inventory?.quantity ?? 0,
          delta: diff,
          reference: stocktake.stocktakeNumber,
        });
      }
    }

    this.logger.log(
      `Applied stocktake ${stocktake.stocktakeNumber}: ${adjustedCount} items adjusted, total diff: ${totalDifference}`,
    );

    return result;
  }

  /**
   * Hủy phiếu kiểm kê
   */
  async cancelStocktake(stocktakeId: string, userId: string, reason?: string) {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id: stocktakeId },
    });
    if (!stocktake) {
      throw new NotFoundException('Phiếu kiểm kê không tồn tại');
    }
    if (stocktake.status === StocktakeStatus.COMPLETED) {
      throw new BadRequestException('Không thể hủy phiếu đã hoàn thành');
    }

    return this.prisma.stocktake.update({
      where: { id: stocktakeId },
      data: {
        status: StocktakeStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
        note: stocktake.note ? `${stocktake.note}\n\nHủy: ${reason}` : `Hủy: ${reason}`,
      },
    });
  }

  /**
   * Lấy chi tiết phiếu kiểm kê
   */
  async getStocktake(stocktakeId: string) {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id: stocktakeId },
      include: {
        items: {
          include: {
            product: { select: { name: true, productCode: true, sku: true, images: { take: 1 } } },
            variant: { select: { name: true, productCode: true, sku: true } },
            countedBy: { select: { name: true, email: true } },
          },
        },
        createdBy: { select: { name: true, email: true } },
        startedBy: { select: { name: true, email: true } },
        completedBy: { select: { name: true, email: true } },
        cancelledBy: { select: { name: true, email: true } },
      },
    });
    if (!stocktake) {
      throw new NotFoundException('Phiếu kiểm kê không tồn tại');
    }
    return stocktake;
  }

  /**
   * Danh sách phiếu kiểm kê với filter
   */
  async listStocktakes(params: {
    page?: number;
    pageSize?: number;
    status?: StocktakeStatus;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }) {
    const { page = 1, pageSize = 20, status, fromDate, toDate, search } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { stocktakeNumber: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.stocktake.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.stocktake.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        ...s,
        itemCount: s._count.items,
        _count: undefined,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Xóa item khỏi phiếu kiểm kê (chỉ DRAFT)
   */
  async removeItem(stocktakeItemId: string) {
    const item = await this.prisma.stocktakeItem.findUnique({
      where: { id: stocktakeItemId },
      include: { stocktake: true },
    });
    if (!item) {
      throw new NotFoundException('Item không tồn tại');
    }
    if (item.stocktake.status !== StocktakeStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể xóa items khi phiếu ở trạng thái DRAFT');
    }

    await this.prisma.stocktakeItem.delete({ where: { id: stocktakeItemId } });
    return { ok: true };
  }

  /**
   * Xóa phiếu kiểm kê (chỉ DRAFT)
   */
  async deleteStocktake(stocktakeId: string) {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id: stocktakeId },
    });
    if (!stocktake) {
      throw new NotFoundException('Phiếu kiểm kê không tồn tại');
    }
    if (stocktake.status !== StocktakeStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể xóa phiếu ở trạng thái DRAFT');
    }

    await this.prisma.stocktake.delete({ where: { id: stocktakeId } });
    return { ok: true };
  }
}

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/events/event-bus.service';
import { SetWebStockDto, BulkSyncFromWebDto } from './web-stock.dto';
import { MovementType } from '@prisma/client';

/**
 * Quản lý "web stock" - số lượng tối đa được phép bán trên web.
 *
 * Mô hình:
 *  - quantity      : tổng tồn kho thực tế (do kho nhập)
 *  - webListedQty  : số lượng tối đa đẩy lên web bán (do admin set)
 *  - webSoldQty    : số lượng web đã bán (đồng bộ từ webhook)
 *  - webReservedQty: số lượng web đang reserve trong cart
 *
 * Số lượng khả dụng trên web = webListedQty - webSoldQty - webReservedQty
 * Phải thỏa: webListedQty + webSoldQty + webReservedQty <= quantity
 */
@Injectable()
export class WebStockService {
  private readonly logger = new Logger(WebStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Set số lượng web cho 1 sản phẩm (variant hoặc product).
   * Tự động chọn Inventory theo variantId (nếu có) hoặc productId.
   */
  async setWebStock(dto: SetWebStockDto) {
    // Xác định target
    let productId: string | null = null;
    let variantId: string | null = null;

    if (dto.targetId.startsWith('v-')) {
      variantId = dto.targetId.slice(2);
    } else {
      productId = dto.targetId;
    }

    // Tìm inventory
    const where = variantId
      ? { variantId }
      : { productId, variantId: null };
    const inv = await this.prisma.inventory.findFirst({ where });
    if (!inv) {
      throw new NotFoundException('Không tìm thấy inventory');
    }

    // Validate: webListedQty <= quantity (tổng tồn)
    if (dto.webListedQty > inv.quantity) {
      throw new BadRequestException(
        `Số lượng web (${dto.webListedQty}) không được vượt quá tổng tồn kho (${inv.quantity})`,
      );
    }

    // Validate: webListedQty >= webSoldQty + webReservedQty (không âm)
    const committed = inv.webSoldQty + inv.webReservedQty;
    if (dto.webListedQty < committed) {
      throw new BadRequestException(
        `Số lượng web (${dto.webListedQty}) phải >= đã bán + đang reserve (${committed})`,
      );
    }

    const updated = await this.prisma.inventory.update({
      where: { id: inv.id },
      data: { webListedQty: dto.webListedQty },
    });

    // Log movement
    await this.prisma.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        productId: inv.productId,
        variantId: inv.variantId,
        type: MovementType.STOCK_SET_MANUAL,
        quantity: 0, // no quantity change
        reference: `web_listed_qty=${dto.webListedQty}`,
        note: `Cập nhật webListedQty: ${inv.webListedQty} → ${dto.webListedQty}`,
      },
    });

    setImmediate(() => {
      this.eventBus.publish('web_stock.changed' as any, {
        inventoryId: inv.id,
        productId: inv.productId,
        variantId: inv.variantId,
        webListedQty: dto.webListedQty,
      });
    });

    return this.toDto(updated);
  }

  /**
   * Đồng bộ delta từ web e-comm (khi có đơn tạo/hủy).
   * Tăng/giảm webSoldQty theo delta.
   */
  async syncFromWeb(dto: BulkSyncFromWebDto) {
    const results: any[] = [];
    for (const item of dto.items) {
      const targetId = item.variantId ?? item.productId;
      if (!targetId) continue;

      const where = item.variantId
        ? { variantId: item.variantId }
        : { productId: item.productId, variantId: null };
      const inv = await this.prisma.inventory.findFirst({ where });
      if (!inv) {
        this.logger.warn(`No inventory for ${targetId}`);
        continue;
      }

      const newSold = inv.webSoldQty + item.deltaSold;
      if (newSold < 0) {
        this.logger.warn(
          `webSoldQty would go negative for ${targetId}: ${inv.webSoldQty} + ${item.deltaSold}`,
        );
        continue;
      }
      if (newSold > inv.webListedQty + inv.webReservedQty) {
        this.logger.warn(
          `webSoldQty (${newSold}) > listedQty (${inv.webListedQty}) for ${targetId}`,
        );
        continue;
      }

      await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { webSoldQty: newSold },
      });

      results.push({
        inventoryId: inv.id,
        productId: inv.productId,
        variantId: inv.variantId,
        newWebSoldQty: newSold,
        webAvailableQty: inv.webListedQty - newSold - inv.webReservedQty,
      });
    }

    setImmediate(() => {
      this.eventBus.publish('web_stock.synced' as any, { results });
    });

    return { synced: results.length, results };
  }

  /**
   * Lấy tổng quan web stock: số sản phẩm có đẩy lên web, tổng webListedQty, ...
   */
  async getSummary() {
    const [total, listed, webSold, available] = await Promise.all([
      this.prisma.inventory.count({ where: { product: { deletedAt: null } } }),
      this.prisma.inventory.aggregate({ _sum: { webListedQty: true } }),
      this.prisma.inventory.aggregate({ _sum: { webSoldQty: true } }),
      // available = listed - sold - reserved (per item)
      this.prisma.inventory.aggregate({
        _sum: { webReservedQty: true },
      }),
    ]);

    return {
      totalProducts: total,
      totalWebListed: listed._sum.webListedQty ?? 0,
      totalWebSold: webSold._sum.webSoldQty ?? 0,
      totalWebReserved: available._sum.webReservedQty ?? 0,
      totalWebAvailable:
        (listed._sum.webListedQty ?? 0) -
        (webSold._sum.webSoldQty ?? 0) -
        (available._sum.webReservedQty ?? 0),
    };
  }

  /**
   * Lấy chi tiết web stock cho 1 sản phẩm.
   */
  async getByProduct(productId: string) {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      include: { inventory: true },
    });
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { inventory: true },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    return {
      product: {
        id: product.id,
        name: product.name,
        productCode: product.productCode,
        inventory: product.inventory ? this.toDto(product.inventory) : null,
      },
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        inventory: v.inventory ? this.toDto(v.inventory) : null,
      })),
    };
  }

  private toDto(inv: any) {
    return {
      id: inv.id,
      productId: inv.productId,
      variantId: inv.variantId,
      quantity: inv.quantity, // tổng tồn kho
      webListedQty: inv.webListedQty,
      webSoldQty: inv.webSoldQty,
      webReservedQty: inv.webReservedQty,
      webAvailableQty:
        inv.webListedQty - inv.webSoldQty - inv.webReservedQty,
    };
  }
}

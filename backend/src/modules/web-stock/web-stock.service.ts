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
   * Set số lượng đẩy lên web (admin).
   * - webListedQty = số lượng tối đa cho phép bán trên web (admin chỉnh)
   * - webAvailable = webListedQty - webSoldQty - webReservedQty
   * Validate: webListedQty <= quantity (tổng tồn kho)
   */
  async setWebStock(dto: SetWebStockDto) {
    const { inventory, productId, variantId } = await this.findInventory(
      dto.targetId,
    );

    // Validate: webListedQty <= quantity (tổng tồn)
    if (dto.webListedQty > inventory.quantity) {
      throw new BadRequestException(
        `Số lượng web (${dto.webListedQty}) không được vượt quá tổng tồn kho (${inventory.quantity})`,
      );
    }

    // Validate: webListedQty >= webSoldQty + webReservedQty
    const committed = inventory.webSoldQty + inventory.webReservedQty;
    if (dto.webListedQty < committed) {
      throw new BadRequestException(
        `Số lượng web (${dto.webListedQty}) phải ≥ đã bán + đang reserve (${committed})`,
      );
    }

    const updated = await this.prisma.inventory.update({
      where: { id: inventory.id },
      data: { webListedQty: dto.webListedQty },
    });

    await this.prisma.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: productId,
        variantId: variantId,
        type: MovementType.STOCK_SET_MANUAL,
        quantity: 0,
        reference: `web_listed_qty=${dto.webListedQty}`,
        note: `Set webListedQty: ${inventory.webListedQty} → ${dto.webListedQty}`,
      },
    });

    setImmediate(() => {
      this.eventBus.publish('web_stock.changed' as any, {
        inventoryId: inventory.id,
        productId,
        variantId,
        webListedQty: dto.webListedQty,
        webAvailableQty:
          dto.webListedQty - updated.webSoldQty - updated.webReservedQty,
      });
    });

    return this.toDto(updated);
  }

  /**
   * Đồng bộ từ web e-comm (khi có đơn tạo/hủy).
   * Tăng/giảm webSoldQty theo delta.
   * Đồng thời: webAvailable = webListedQty - webSoldQty luôn tự co lại.
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
      // Không cho webSoldQty vượt tổng tồn
      if (newSold > inv.quantity) {
        this.logger.warn(
          `webSoldQty (${newSold}) > total qty (${inv.quantity}) for ${targetId}`,
        );
        continue;
      }

      const updated = await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { webSoldQty: newSold },
      });

      results.push({
        inventoryId: inv.id,
        productId: inv.productId,
        variantId: inv.variantId,
        newWebSoldQty: newSold,
        webListedQty: updated.webListedQty,
        webAvailableQty:
          updated.webListedQty - newSold - updated.webReservedQty,
      });
    }

    setImmediate(() => {
      this.eventBus.publish('web_stock.synced' as any, { results });
    });

    return { synced: results.length, results };
  }

  private async findInventory(targetId: string) {
    let productId: string | null = null;
    let variantId: string | null = null;

    if (targetId.startsWith('v-')) {
      variantId = targetId.slice(2);
    } else {
      productId = targetId;
    }

    const where = variantId
      ? { variantId }
      : { productId, variantId: null };
    const inventory = await this.prisma.inventory.findFirst({ where });
    if (!inventory) {
      throw new NotFoundException('Không tìm thấy inventory');
    }
    return { inventory, productId: inventory.productId, variantId: inventory.variantId };
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

import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { EventBusService, WmsEvent } from '../../common/events/event-bus.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { WebStockService } from '../web-stock/web-stock.service';
import { Public } from '../../common/decorators/auth.decorators';

interface HinaWebhookPayload {
  type: string;
  data: any;
  emittedAt: string;
}

/**
 * Webhook nhận events từ hina-e-comm.
 * Là backup channel khi Redis pub/sub không khả dụng.
 *
 * Xác thực bằng HMAC-SHA256 với shared secret.
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventBusService,
    private readonly shipments: ShipmentsService,
    private readonly webStock: WebStockService,
  ) {}

  @Public()
  @Post('hina')
  async handleHina(
    @Body() payload: HinaWebhookPayload,
    @Headers('x-hina-signature') signature: string,
  ) {
    this.verifySignature(JSON.stringify(payload), signature);

    this.logger.log(`Received webhook: ${payload.type}`);

    switch (payload.type) {
      case 'order.confirmed':
      case 'order.paid':
        await this.handleOrderConfirmed(payload.data);
        break;

      case 'order.cancelled':
        await this.handleOrderCancelled(payload.data);
        break;

      case 'order.item_sold':
        await this.handleOrderItemSold(payload.data);
        break;

      case 'product.changed':
      case 'category.changed':
      case 'price.changed':
        // Forward cho EventBus để clients SSE nhận
        await this.eventBus.publish(
          payload.type as any,
          payload.data,
          payload.data?.warehouseId,
        );
        break;

      default:
        this.logger.warn(`Unknown event type: ${payload.type}`);
    }

    return { ok: true };
  }

  private async handleOrderConfirmed(data: any) {
    if (!data?.orderId) {
      throw new BadRequestException('Missing orderId');
    }
    try {
      await this.shipments.createFromOrder({
        orderId: data.orderId,
        warehouseId: data.warehouseId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to create shipment for order ${data.orderId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Đơn bị hủy: giảm webSoldQty (hoàn lại "đã bán").
   * data: { orderId, items: [{ productId, variantId, quantity }] }
   */
  private async handleOrderCancelled(data: any) {
    if (!data?.orderId || !data?.items?.length) {
      this.logger.log(`Order cancelled (no items): ${data?.orderId}`);
      return;
    }
    try {
      await this.webStock.syncFromWeb({
        items: data.items.map((it: any) => ({
          productId: it.productId,
          variantId: it.variantId,
          deltaSold: -Number(it.quantity || 0), // trừ lại
        })),
      });
    } catch (err) {
      this.logger.error(
        `Failed to sync cancel for order ${data.orderId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Đơn có item mới (CONFIRMED): tăng webSoldQty.
   * data: { orderId, items: [{ productId, variantId, quantity }] }
   */
  private async handleOrderItemSold(data: any) {
    if (!data?.items?.length) return;
    try {
      await this.webStock.syncFromWeb({
        items: data.items.map((it: any) => ({
          productId: it.productId,
          variantId: it.variantId,
          deltaSold: Number(it.quantity || 0),
        })),
      });
    } catch (err) {
      this.logger.error(
        `Failed to sync sold: ${(err as Error).message}`,
      );
    }
  }

  private verifySignature(body: string, signature: string) {
    if (!signature) {
      throw new UnauthorizedException('Missing signature');
    }
    const secret = this.config.getOrThrow<string>('WEBHOOK_SECRET');
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid signature');
    }
  }
}

/**
 * HinaWmsSync - Helper module để tích hợp với hina-e-comm
 *
 * Cách dùng trong hina-e-comm:
 *   1. Copy file này vào `backend/src/common/hina-wms-sync/`
 *   2. Trong các service (products, orders, inventory), gọi
 *      `HinaWmsSync.publishEvent('product.changed', {...})` sau khi CRUD
 *   3. Đảm bảo REDIS_URL được cấu hình giống WMS
 *
 * Lưu ý: File này NẰM TRONG project hina-e-comm, không thuộc WMS.
 * WMS đã có subscriber tương ứng (EventBusService trong WMS).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type HinaWmsEventType =
  | 'product.changed'
  | 'product.deleted'
  | 'category.changed'
  | 'price.changed'
  | 'stock.changed'
  | 'order.confirmed'
  | 'order.cancelled';

export interface HinaWmsEvent<T = any> {
  type: HinaWmsEventType;
  data: T;
  emittedAt: string;
  source: 'hina-e-comm';
  warehouseId?: string;
}

const CHANNEL_PREFIX = 'wms:event:';

@Injectable()
export class HinaWmsSyncService {
  private readonly logger = new Logger(HinaWmsSyncService.name);
  private redis: Redis | null = null;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, { lazyConnect: true });
      this.redis.connect().catch((err) => {
        this.logger.error(`Failed to connect to Redis: ${err.message}`);
      });
    } else {
      this.logger.warn('REDIS_URL not set, WMS sync disabled');
    }
  }

  /**
   * Publish event lên Redis. WMS sẽ subscribe và xử lý.
   */
  async publishEvent<T>(type: HinaWmsEventType, data: T, warehouseId?: string): Promise<void> {
    if (!this.redis) return;
    try {
      const event: HinaWmsEvent<T> = {
        type,
        data,
        emittedAt: new Date().toISOString(),
        source: 'hina-e-comm',
        warehouseId,
      };
      const channel = `${CHANNEL_PREFIX}${type}`;
      await this.redis.publish(channel, JSON.stringify(event));
      this.logger.debug(`Published ${type} to ${channel}`);
    } catch (err) {
      this.logger.error(`Failed to publish event ${type}: ${(err as Error).message}`);
    }
  }

  /**
   * Helper gọi webhook sang WMS (backup channel nếu Redis down)
   */
  async callWebhook(payload: any): Promise<void> {
    const wmsUrl = this.config.get<string>('WMS_WEBHOOK_URL');
    const secret = this.config.get<string>('WMS_WEBHOOK_SECRET');
    if (!wmsUrl || !secret) return;

    try {
      const crypto = await import('crypto');
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      await fetch(`${wmsUrl}/webhook/hina`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hina-signature': signature,
        },
        body,
      });
    } catch (err) {
      this.logger.error(`Webhook call failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }
}

/**
 * Ví dụ tích hợp trong products.service.ts của hina-e-comm:
 *
 * ```typescript
 * // Sau khi tạo/sửa product
 * await this.hinaWmsSync.publishEvent('product.changed', {
 *   productId: product.id,
 *   productCode: product.productCode,
 *   name: product.name,
 *   basePrice: product.basePrice,
 *   visibility: product.visibility,
 * });
 * ```
 *
 * ```typescript
 * // Sau khi admin điều chỉnh kho
 * await this.hinaWmsSync.publishEvent('stock.changed', {
 *   productId: inv.productId,
 *   variantId: inv.variantId,
 *   oldQuantity: oldQ,
 *   newQuantity: inv.quantity,
 * });
 * ```
 *
 * ```typescript
 * // Khi order chuyển sang CONFIRMED
 * await this.hinaWmsSync.publishEvent('order.confirmed', {
 *   orderId: order.id,
 *   orderNumber: order.orderNumber,
 * });
 * ```
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type WmsEventType =
  | 'product.changed'
  | 'product.deleted'
  | 'category.changed'
  | 'price.changed'
  | 'stock.changed'
  | 'stock.low'
  | 'order.confirmed'
  | 'order.cancelled'
  | 'order.paid'
  | 'order.item_sold'
  | 'shipment.created'
  | 'shipment.handed_over';

export interface WmsEvent<T = unknown> {
  type: WmsEventType;
  warehouseId?: string;
  data: T;
  emittedAt: string;
  source: 'hina-wms' | 'hina-e-comm';
}

const WMS_CHANNEL_PREFIX = 'wms:event:';
const ALL_CHANNELS = `${WMS_CHANNEL_PREFIX}*`;

/**
 * EventBus - dùng Redis pub/sub.
 * - WMS publish khi có thay đổi tồn kho/đơn hàng → hina-e-comm subscribe
 * - hina-e-comm publish khi có thay đổi product/category → WMS subscribe
 */
@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private publisher!: Redis;
  private subscriber!: Redis;
  private subscribers = new Set<(event: WmsEvent) => void>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.config.getOrThrow<string>('REDIS_URL');
    this.publisher = new Redis(redisUrl, { lazyConnect: true });
    this.subscriber = new Redis(redisUrl, { lazyConnect: true });

    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    this.logger.log('EventBus connected to Redis');

    // Subscribe toàn bộ channel wms:event:*
    await this.subscriber.psubscribe(ALL_CHANNELS);
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const event: WmsEvent = JSON.parse(message);
        // Chỉ xử lý events từ hina-e-comm, bỏ qua events do chính WMS publish
        if (event.source === 'hina-e-comm') {
          this.logger.debug(`Received event ${event.type} from hina-e-comm`);
          for (const cb of this.subscribers) {
            try {
              cb(event);
            } catch (err) {
              this.logger.error(`Subscriber error: ${(err as Error).message}`);
            }
          }
        }
      } catch (err) {
        this.logger.error(`Failed to parse event: ${(err as Error).message}`);
      }
    });
  }

  async onModuleDestroy() {
    await this.publisher?.quit();
    await this.subscriber?.quit();
  }

  /**
   * Publish event lên Redis. Channel sẽ là `wms:event:<type>`
   */
  async publish<T>(type: WmsEventType, data: T, warehouseId?: string): Promise<void> {
    const event: WmsEvent<T> = {
      type,
      data,
      warehouseId,
      emittedAt: new Date().toISOString(),
      source: 'hina-wms',
    };
    const channel = `${WMS_CHANNEL_PREFIX}${type}`;
    await this.publisher.publish(channel, JSON.stringify(event));
    this.logger.debug(`Published ${type} to ${channel}`);
  }

  /**
   * Subscribe nhận events từ hina-e-comm.
   * Trả về hàm unsubscribe.
   */
  onEvent(callback: (event: WmsEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}

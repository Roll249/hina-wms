import { Controller, Get, Sse, MessageEvent } from '@nestjs/common';
import { Observable, interval, merge, map } from 'rxjs';
import { EventBusService, WmsEvent } from '../../common/events/event-bus.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';

/**
 * SSE endpoint - push real-time updates tới UI.
 *
 * Workflow:
 *  1. Client mở EventSource('/sse/stream')
 *  2. Subscribe các events từ EventBus (Redis pub/sub)
 *  3. Forward mỗi event thành SSE message
 *  4. Gửi heartbeat mỗi 25s để giữ connection
 */
@Controller('sse')
export class SseController {
  private readonly heartbeatMs: number;

  constructor(
    private readonly eventBus: EventBusService,
    private readonly config: ConfigService,
  ) {
    this.heartbeatMs = this.config.get<number>('SSE_HEARTBEAT_INTERVAL_MS', 25000);
  }

  @Sse('stream')
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    // Heartbeat
    const heartbeat$ = interval(this.heartbeatMs).pipe(
      map((seq) => ({
        type: 'heartbeat',
        data: { seq, ts: Date.now() },
      })),
    );

    // Events từ EventBus
    const events$ = new Observable<MessageEvent>((subscriber) => {
      const off = this.eventBus.onEvent((event: WmsEvent) => {
        // Filter theo warehouseId của user (nếu có)
        if (user.warehouseId && event.warehouseId && event.warehouseId !== user.warehouseId) {
          return;
        }
        subscriber.next({
          type: event.type,
          data: event,
        });
      });
      return () => off();
    });

    return merge(heartbeat$, events$).pipe(
      map((msg) => ({
        ...msg,
        id: String(Date.now()),
      })),
    );
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { EventBusModule } from './common/events/event-bus.module';
import { AuthGuardModule } from './common/guards/auth-guard.module';
import { AuthModule } from './modules/auth/auth.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { StockModule } from './modules/stock/stock.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { SseModule } from './modules/sse/sse.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventBusModule,
    AuthGuardModule,
    AuthModule,
    WarehouseModule,
    StockModule,
    ReceiptsModule,
    ShipmentsModule,
    WebhookModule,
    SseModule,
    HealthModule,
  ],
})
export class AppModule {}

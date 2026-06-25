import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { EventBusModule } from './common/events/event-bus.module';
import { AuthGuardModule } from './common/guards/auth-guard.module';
import { AuthModule } from './modules/auth/auth.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { StockModule } from './modules/stock/stock.module';
import { CategoryModule } from './modules/category/category.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AdminOrdersModule } from './modules/admin-orders/admin-orders.module';
import { WebStockModule } from './modules/web-stock/web-stock.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { SseModule } from './modules/sse/sse.module';
import { HealthModule } from './modules/health/health.module';
import { StocktakeModule } from './modules/stocktake/stocktake.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ImportExportModule } from './modules/import-export/import-export.module';
import { BarcodeModule } from './modules/barcode/barcode.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventBusModule,
    AuthGuardModule,
    AuthModule,
    WarehouseModule,
    StockModule,
    CategoryModule,
    ReceiptsModule,
    ShipmentsModule,
    OrdersModule,
    CustomersModule,
    AdminOrdersModule,
    WebStockModule,
    WebhookModule,
    SseModule,
    HealthModule,
    StocktakeModule,
    ReportsModule,
    ImportExportModule,
    BarcodeModule,
  ],
})
export class AppModule {}

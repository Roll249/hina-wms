import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { ShipmentsModule } from '../shipments/shipments.module';
import { WebStockModule } from '../web-stock/web-stock.module';

@Module({
  imports: [ShipmentsModule, WebStockModule],
  controllers: [WebhookController],
})
export class WebhookModule {}

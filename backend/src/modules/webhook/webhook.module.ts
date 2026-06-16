import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { ShipmentsModule } from '../shipments/shipments.module';

@Module({
  imports: [ShipmentsModule],
  controllers: [WebhookController],
})
export class WebhookModule {}

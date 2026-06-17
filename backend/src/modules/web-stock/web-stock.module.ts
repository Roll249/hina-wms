import { Module } from '@nestjs/common';
import { WebStockService } from './web-stock.service';
import { WebStockController } from './web-stock.controller';

@Module({
  providers: [WebStockService],
  controllers: [WebStockController],
  exports: [WebStockService],
})
export class WebStockModule {}

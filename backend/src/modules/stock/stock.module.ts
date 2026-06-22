import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { StockBulkService } from './stock-bulk.service';
import { StockBulkController } from './stock-bulk.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  providers: [StockService, StockBulkService],
  controllers: [StockController, StockBulkController],
  exports: [StockService, StockBulkService],
})
export class StockModule {}

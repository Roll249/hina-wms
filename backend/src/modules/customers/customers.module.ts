import { Module } from '@nestjs/common';
import { WmsCustomersService } from './wms-customers.service';
import { CustomersController } from './customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [WmsCustomersService],
  exports: [WmsCustomersService],
})
export class CustomersModule {}

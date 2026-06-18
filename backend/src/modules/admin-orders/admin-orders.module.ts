import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [OrdersModule, CustomersModule],
  controllers: [AdminOrdersController],
})
export class AdminOrdersModule {}

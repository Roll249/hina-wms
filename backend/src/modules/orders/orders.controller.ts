import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './orders.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/auth.decorators';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('orders')
@Roles('ADMIN', 'MANAGE')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Tạo đơn hàng thủ công từ WMS (khách offline / đặt qua điện thoại).
   * Tự động tạo OutboundShipment PENDING để warehouse pick.
   */
  @Post('wms')
  createFromWms(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.createOrderFromWms(user.sub, dto);
  }

  /**
   * Tìm sản phẩm để thêm vào đơn (search by code, sku, name).
   * GET /orders/search-products?q=abc
   */
  @Get('search-products')
  searchProducts(@Query('q') q: string) {
    return this.orders.searchProductsForOrder(q ?? '');
  }

  /**
   * Stats cho dashboard: tổng quan kho + đơn hàng hôm nay.
   */
  @Get('dashboard-stats')
  dashboardStats() {
    return this.orders.getDashboardStats();
  }
}

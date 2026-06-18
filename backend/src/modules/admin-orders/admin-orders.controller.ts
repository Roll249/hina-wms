import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { OrderStatus } from '@prisma/client';
import { CreateOrderDto } from '../orders/orders.dto';
import { IsEnum, IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class ListOrdersQueryDto {
  @IsOptional()
  @IsIn(['WEB', 'WMS', 'ADMIN_WEB'])
  source?: 'WEB' | 'WMS' | 'ADMIN_WEB';

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * WMS Admin Orders API (bê từ ecom admin/orders)
 * - GET  /admin/orders                 List (filter theo source/status/date)
 * - GET  /admin/orders/:id             Detail
 * - POST /admin/orders                 Tạo đơn mới (manual từ kho)
 * - PATCH /admin/orders/:id/status     Update status
 * - GET  /admin/orders/search-products Tìm sản phẩm
 */
@Controller('admin/orders')
@Roles('ADMIN', 'MANAGE')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersQueryDto) {
    return this.orders.listOrders(query);
  }

  @Get('search-products')
  searchProducts(@Query('q') q: string) {
    return this.orders.searchProductsForOrder(q ?? '');
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.orders.getOrderById(id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.createOrderFromWms(user.sub, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.updateOrderStatus(id, dto.status, user.sub, dto.note);
  }
}

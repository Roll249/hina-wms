import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { WmsCustomersService } from './wms-customers.service';
import { CreateManualOrderCustomerDto, ListCustomersQueryDto } from './dto/wms-customers.dto';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

/**
 * WMS Customers API
 * - GET  /customers             Search khách hàng
 * - GET  /customers/:id         Chi tiết khách hàng
 * - POST /customers             Tạo manual customer (cho admin WMS)
 */
@Controller('customers')
@Roles('ADMIN', 'MANAGE')
export class CustomersController {
  constructor(private readonly customers: WmsCustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.searchCustomers(query.search ?? '', query.limit);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.customers.getCustomerById(id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateManualOrderCustomerDto,
  ) {
    return this.customers.createManualCustomer(user.sub, dto);
  }
}

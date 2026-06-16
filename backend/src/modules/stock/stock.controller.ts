import { Controller, Get, Query, Param } from '@nestjs/common';
import { StockService } from './stock.service';
import { Roles } from '../../common/decorators/auth.decorators';
import { Role } from '@prisma/client';

@Controller('stock')
@Roles(Role.ADMIN, Role.MANAGE)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'quantity' | 'name' | 'updatedAt',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.stock.listStock({
      search,
      warehouseId,
      lowStockOnly: lowStockOnly === 'true',
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      sortBy,
      sortDir,
    });
  }

  /**
   * Tra cứu nhanh theo mã (UPC/SKU/barcode) - dùng cho quét mã vạch
   */
  @Get('lookup/:code')
  lookup(@Param('code') code: string) {
    return this.stock.lookupByCode(code);
  }

  @Get('movements')
  movements(
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
    @Query('inventoryId') inventoryId?: string,
    @Query('type') type?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stock.listMovements({
      productId,
      variantId,
      inventoryId,
      type,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 30,
    });
  }

  @Get('alerts/low-stock')
  lowStockAlerts(@Query('threshold') threshold?: string) {
    return this.stock.lowStockAlerts(threshold ? Number(threshold) : undefined);
  }
}

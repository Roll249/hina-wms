import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/auth.decorators';

@Controller('reports')
@Roles('ADMIN', 'MANAGE')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Báo cáo tổng quan kho
   */
  @Get('inventory-summary')
  getInventorySummary() {
    return this.reports.getInventorySummary();
  }

  /**
   * Báo cáo biến động tồn kho
   */
  @Get('movements')
  getMovementReport(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
  ) {
    return this.reports.getMovementReport({ fromDate, toDate, groupBy });
  }

  /**
   * Báo cáo đơn hàng theo ngày
   */
  @Get('orders')
  getOrdersReport(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('source') source?: 'WEB' | 'WMS' | 'ADMIN_WEB',
  ) {
    return this.reports.getOrdersReport({ fromDate, toDate, source });
  }

  /**
   * Top sản phẩm bán chạy
   */
  @Get('top-products')
  getTopSellingProducts(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('limit') limit?: string,
  ) {
    return this.reports.getTopSellingProducts({
      fromDate,
      toDate,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  /**
   * Báo cáo hàng tồn kho chi tiết
   */
  @Get('inventory')
  getInventoryReport(
    @Query('categoryId') categoryId?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Query('outOfStockOnly') outOfStockOnly?: string,
    @Query('sortBy') sortBy?: 'quantity' | 'value' | 'name',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.reports.getInventoryReport({
      categoryId,
      lowStockOnly: lowStockOnly === 'true',
      outOfStockOnly: outOfStockOnly === 'true',
      sortBy,
      sortDir,
    });
  }

  /**
   * Báo cáo stocktake
   */
  @Get('stocktake')
  getStocktakeReport(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.reports.getStocktakeReport({ fromDate, toDate });
  }
}

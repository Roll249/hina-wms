import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { StockService } from './stock.service';
import { Roles } from '../../common/decorators/auth.decorators';
import { Role } from '@prisma/client';

interface AuthedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

@Controller('stock')
@Roles(Role.ADMIN, Role.MANAGE)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Query('isClassified') isClassified?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'quantity' | 'name' | 'updatedAt',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.stock.listStock({
      search,
      warehouseId,
      lowStockOnly: lowStockOnly === 'true',
      isClassified: isClassified === undefined ? undefined : isClassified === 'true',
      categoryId,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      sortBy,
      sortDir,
    });
  }

  /**
   * Lấy danh sách categories kèm productCount
   */
  @Get('categories')
  categories() {
    return this.stock.listCategories();
  }

  /**
   * Counts cho 2 tab phân loại
   */
  @Get('classification-counts')
  classificationCounts() {
    return this.stock.getClassificationCounts();
  }

  /**
   * Phân loại 1 sản phẩm vào category cụ thể.
   * Body: { productId, categoryId }
   */
  @Post('classify')
  classify(
    @Body() body: { productId: string; categoryId: string },
    @Req() req: AuthedRequest,
  ) {
    return this.stock.classifyProduct({
      productId: body.productId,
      categoryId: body.categoryId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      ipAddress: req.ip,
    });
  }

  /**
   * Chi tiết 1 sản phẩm (cho edit form prefill)
   */
  @Get('product/:id')
  productDetail(@Param('id') id: string) {
    return this.stock.getProductDetail(id);
  }

  /**
   * Sửa thông tin sản phẩm.
   * Có confirm ở frontend trước khi gọi.
   * Ghi AuditLog tự động.
   */
  @Patch('product/:id')
  editProduct(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: AuthedRequest,
  ) {
    return this.stock.editProduct({
      productId: id,
      patch: body,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      ipAddress: req.ip,
    });
  }

  /**
   * Lịch sử sửa sản phẩm (từ AuditLog)
   */
  @Get('product/:id/history')
  productHistory(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.stock.getProductHistory(id, limit ? Number(limit) : 30);
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

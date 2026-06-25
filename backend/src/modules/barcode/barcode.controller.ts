import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BarcodeService } from './barcode.service';
import { Roles } from '../../common/decorators/auth.decorators';

@Controller('barcode')
export class BarcodeController {
  constructor(private readonly barcode: BarcodeService) {}

  /**
   * Tra cứu barcode đơn lẻ
   */
  @Get('lookup/:code')
  lookup(@Param('code') code: string) {
    return this.barcode.lookup(code);
  }

  /**
   * Batch lookup - tra cứu nhiều barcodes
   */
  @Post('batch-lookup')
  batchLookup(@Body() body: { barcodes: string[] }) {
    return this.barcode.batchLookup(body.barcodes);
  }

  /**
   * Search by barcode (partial match)
   */
  @Get('search')
  search(@Query('q') query: string) {
    return this.barcode.searchByBarcode(query);
  }

  /**
   * Validate barcode format
   */
  @Post('validate')
  validate(@Body() body: { barcode: string }) {
    return this.barcode.validateBarcode(body.barcode);
  }

  /**
   * Get products without barcode
   */
  @Get('without-barcode')
  @Roles('ADMIN', 'MANAGE')
  getWithoutBarcode() {
    return this.barcode.getProductsWithoutBarcode();
  }

  /**
   * Update supplier code
   */
  @Post('products/:productId/supplier-code')
  @Roles('ADMIN', 'MANAGE')
  updateSupplierCode(
    @Param('productId') productId: string,
    @Body() body: { supplierCode: string },
  ) {
    return this.barcode.updateSupplierCode(productId, body.supplierCode);
  }
}

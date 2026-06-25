import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ImportExportService } from './import-export.service';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('import-export')
@Roles('ADMIN', 'MANAGE')
export class ImportExportController {
  constructor(private readonly service: ImportExportService) {}

  /**
   * Export inventory (trả về JSON, FE tự convert sang Excel)
   */
  @Get('inventory')
  async exportInventory(
    @Query('categoryId') categoryId?: string,
    @Query('includeOutOfStock') includeOutOfStock?: string,
  ) {
    return this.service.exportInventory({
      categoryId,
      includeOutOfStock: includeOutOfStock !== 'false',
    });
  }

  /**
   * Export products
   */
  @Get('products')
  async exportProducts(
    @Query('categoryId') categoryId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.exportProducts({
      categoryId,
      includeInactive: includeInactive === 'true',
    });
  }

  /**
   * Get stock template
   */
  @Get('template/stock')
  getStockTemplate() {
    return this.service.getStockTemplate();
  }

  /**
   * Get products template
   */
  @Get('template/products')
  getProductsTemplate() {
    return this.service.getProductsTemplate();
  }

  /**
   * Import products from JSON
   */
  @Post('products')
  async importProducts(
    @Body() body: any[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.importProducts(body, user.sub);
  }

  /**
   * Import receipt from JSON
   */
  @Post('receipt')
  async importReceipt(
    @Body() body: { items: any[]; note?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createReceiptFromImport(body.items, user.sub, body.note);
  }

  /**
   * Bulk adjust stock
   */
  @Post('stock-adjust')
  async bulkAdjustStock(
    @Body() body: any[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.bulkAdjustStock(body, user.sub);
  }
}

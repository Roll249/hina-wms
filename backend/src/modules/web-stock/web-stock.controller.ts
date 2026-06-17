import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
} from '@nestjs/common';
import { WebStockService } from './web-stock.service';
import { SetWebStockDto, BulkSyncFromWebDto } from './web-stock.dto';
import { Public } from '../../common/decorators/auth.decorators';

/**
 * API quản lý web stock + đồng bộ từ web e-comm.
 *
 * Auth:
 *  - /web-stock/admin/*     : cần ADMIN/MANAGE (set số lượng)
 *  - /web-stock/sync-from-web : @Public (web e-comm gọi vào, dùng HMAC ở tầng trên)
 */
@Controller('web-stock')
export class WebStockController {
  constructor(private readonly webStock: WebStockService) {}

  /**
   * Tổng quan web stock (admin dashboard).
   */
  @Get('summary')
  summary() {
    return this.webStock.getSummary();
  }

  /**
   * Chi tiết web stock cho 1 sản phẩm.
   */
  @Get('product/:productId')
  productDetail(@Param('productId') productId: string) {
    return this.webStock.getByProduct(productId);
  }

  /**
   * Set số lượng đẩy lên web cho 1 sản phẩm (admin).
   * Body: { targetId, webListedQty }
   */
  @Patch('admin/set')
  setStock(@Body() dto: SetWebStockDto) {
    return this.webStock.setWebStock(dto);
  }

  /**
   * Webhook từ web e-comm: cập nhật webSoldQty khi có đơn mới/hủy.
   * Body: { items: [{ productId/variantId, deltaSold }] }
   */
  @Public()
  @Post('sync-from-web')
  syncFromWeb(@Body() dto: BulkSyncFromWebDto) {
    return this.webStock.syncFromWeb(dto);
  }
}

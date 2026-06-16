import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Delete,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import {
  CreateReceiptDto,
  AddReceiptItemDto,
  ImportReceiptsDto,
} from './receipts.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/auth.decorators';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { GoodsReceiptStatus } from '@prisma/client';

@Controller('receipts')
@Roles('ADMIN', 'MANAGE')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /**
   * Tạo phiếu nhập mới
   */
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.receipts.createReceipt(user.sub, dto);
  }

  /**
   * Thêm 1 sản phẩm vào phiếu (mode BARCODE/MANUAL)
   */
  @Post('items')
  addItem(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddReceiptItemDto,
  ) {
    return this.receipts.addItem(user.sub, dto);
  }

  /**
   * Import hàng loạt từ CSV (mode FILE)
   */
  @Post('import')
  importBulk(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportReceiptsDto,
  ) {
    return this.receipts.importFromBulk(user.sub, dto);
  }

  /**
   * Xác nhận phiếu nhập - áp dụng tồn kho
   */
  @Patch(':id/confirm')
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.receipts.confirmReceipt(user.sub, id);
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.receipts.cancelReceipt(user.sub, id);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
  ) {
    return this.receipts.removeItem(user.sub, itemId);
  }

  @Get()
  list(
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.receipts.listReceipts({
      warehouseId,
      status: status as GoodsReceiptStatus | undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.receipts.getReceipt(id);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { StocktakeService } from './stocktake.service';
import {
  CreateStocktakeDto,
  AddStocktakeItemsDto,
  UpdateCountedQtyDto,
  ApplyStocktakeDto,
  ListStocktakesQueryDto,
} from './stocktake.dto';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { Request } from 'express';

interface AuthedRequest extends Request {
  user: JwtPayload;
}

@Controller('stocktake')
@Roles('ADMIN', 'MANAGE')
export class StocktakeController {
  constructor(private readonly stocktake: StocktakeService) {}

  /**
   * Tạo phiếu kiểm kê mới
   */
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStocktakeDto,
  ) {
    return this.stocktake.createStocktake(user.sub, dto);
  }

  /**
   * Thêm items vào phiếu kiểm kê
   */
  @Post(':id/items')
  addItems(
    @Param('id') id: string,
    @Body() dto: AddStocktakeItemsDto,
  ) {
    return this.stocktake.addItems(id, dto);
  }

  /**
   * Cập nhật số lượng đếm được
   */
  @Patch('items/:itemId')
  updateCountedQty(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCountedQtyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stocktake.updateCountedQty(itemId, dto, user.sub);
  }

  /**
   * Xóa item khỏi phiếu (chỉ DRAFT)
   */
  @Delete('items/:itemId')
  removeItem(@Param('itemId') itemId: string) {
    return this.stocktake.removeItem(itemId);
  }

  /**
   * Bắt đầu kiểm kê
   */
  @Post(':id/start')
  start(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stocktake.startStocktake(id, user.sub);
  }

  /**
   * Áp dụng điều chỉnh
   */
  @Post(':id/apply')
  apply(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApplyStocktakeDto,
  ) {
    return this.stocktake.applyStocktake(id, dto, user.sub);
  }

  /**
   * Hủy phiếu kiểm kê
   */
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason?: string },
  ) {
    return this.stocktake.cancelStocktake(id, user.sub, body.reason);
  }

  /**
   * Xóa phiếu kiểm kê (chỉ DRAFT)
   */
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.stocktake.deleteStocktake(id);
  }

  /**
   * Chi tiết phiếu kiểm kê
   */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.stocktake.getStocktake(id);
  }

  /**
   * Danh sách phiếu kiểm kê
   */
  @Get()
  list(@Query() query: ListStocktakesQueryDto) {
    return this.stocktake.listStocktakes({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      fromDate: query.fromDate,
      toDate: query.toDate,
      search: query.search,
    });
  }
}

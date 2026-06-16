import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import {
  CreateShipmentFromOrderDto,
  PickItemDto,
  HandoverShipmentDto,
  CancelShipmentDto,
} from './shipments.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/auth.decorators';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ShipmentStatus } from '@prisma/client';

@Controller('shipments')
@Roles('ADMIN', 'MANAGE')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  /**
   * Tạo phiếu xuất từ đơn hàng (thường được trigger bởi webhook,
   * nhưng admin có thể gọi thủ công)
   */
  @Post('from-order')
  createFromOrder(@Body() dto: CreateShipmentFromOrderDto) {
    return this.shipments.createFromOrder(dto);
  }

  @Post(':id/start')
  startPick(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.shipments.startPick(user.sub, id);
  }

  @Post(':id/pick')
  pickItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') shipmentId: string,
    @Body() dto: PickItemDto,
  ) {
    return this.shipments.pickItem(user.sub, { ...dto, itemId: dto.itemId });
  }

  @Patch(':id/complete-pick')
  completePick(@Param('id') id: string) {
    return this.shipments.completePick(id);
  }

  @Post('handover')
  handover(@Body() dto: HandoverShipmentDto) {
    return this.shipments.handover(dto);
  }

  @Post('cancel')
  cancel(@Body() dto: CancelShipmentDto) {
    return this.shipments.cancel(dto);
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
    return this.shipments.listShipments({
      warehouseId,
      status: status as ShipmentStatus | undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.shipments.getShipment(id);
  }
}

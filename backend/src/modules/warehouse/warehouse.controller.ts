import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateSupplierDto,
  CreateWarehouseStaffDto,
  UpdateStaffPinDto,
} from './warehouse.dto';
import { Roles, Public } from '../../common/decorators/auth.decorators';
import { Role } from '@prisma/client';

@Controller('warehouse')
@Roles(Role.ADMIN, Role.MANAGE)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  // ============== KHO ==============

  @Get()
  list() {
    return this.warehouse.listWarehouses();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.warehouse.getWarehouse(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouse.createWarehouse(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouse.updateWarehouse(id, dto);
  }

  // ============== NHÀ CUNG CẤP ==============

  @Get('suppliers/all')
  listSuppliers(@Query('search') search?: string) {
    return this.warehouse.listSuppliers(search);
  }

  @Post('suppliers')
  @Roles(Role.ADMIN)
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.warehouse.createSupplier(dto);
  }

  // ============== NHÂN VIÊN KHO ==============

  @Get('staff/all')
  listStaff(@Query('warehouseId') warehouseId?: string) {
    return this.warehouse.listStaff(warehouseId);
  }

  @Post('staff')
  @Roles(Role.ADMIN)
  createStaff(@Body() dto: CreateWarehouseStaffDto) {
    return this.warehouse.createStaff(dto);
  }

  @Patch('staff/:employeeCode/pin')
  @Roles(Role.ADMIN)
  setPin(@Param('employeeCode') employeeCode: string, @Body() dto: UpdateStaffPinDto) {
    return this.warehouse.setStaffPin(employeeCode, dto);
  }

  @Patch('staff/:id/deactivate')
  @Roles(Role.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.warehouse.deactivateStaff(id);
  }
}

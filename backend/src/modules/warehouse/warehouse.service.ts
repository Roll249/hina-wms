import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateSupplierDto,
  CreateWarehouseStaffDto,
  UpdateStaffPinDto,
} from './warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  // ============== WAREHOUSE ==============

  async listWarehouses() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getWarehouse(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        staff: { where: { isActive: true }, include: { user: { select: { email: true, name: true } } } },
        _count: { select: { receipts: true, shipments: true } },
      },
    });
    if (!warehouse) throw new NotFoundException('Không tìm thấy kho');
    return warehouse;
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    const exists = await this.prisma.warehouse.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Mã kho "${dto.code}" đã tồn tại`);

    // Nếu set isDefault, bỏ default của kho khác
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.warehouse.create({ data: dto });
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto) {
    return this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  // ============== SUPPLIER ==============

  async listSuppliers(search?: string) {
    return this.prisma.supplier.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(dto: CreateSupplierDto) {
    if (dto.code) {
      const exists = await this.prisma.supplier.findUnique({ where: { code: dto.code } });
      if (exists) throw new ConflictException(`Mã NCC "${dto.code}" đã tồn tại`);
    }
    return this.prisma.supplier.create({ data: dto });
  }

  // ============== STAFF ==============

  async listStaff(warehouseId?: string) {
    return this.prisma.warehouseStaff.findMany({
      where: {
        isActive: true,
        ...(warehouseId && { warehouseId }),
      },
      include: {
        user: { select: { email: true, name: true, isActive: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { employeeCode: 'asc' },
    });
  }

  async createStaff(dto: CreateWarehouseStaffDto) {
    // Verify user tồn tại
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('User không tồn tại');

    // Kiểm tra đã là staff chưa
    const exists = await this.prisma.warehouseStaff.findUnique({ where: { userId: dto.userId } });
    if (exists) throw new ConflictException('User đã là nhân viên kho');

    // Kiểm tra employeeCode unique
    const codeExists = await this.prisma.warehouseStaff.findUnique({
      where: { employeeCode: dto.employeeCode },
    });
    if (codeExists) throw new ConflictException(`Mã NV "${dto.employeeCode}" đã tồn tại`);

    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : null;

    return this.prisma.warehouseStaff.create({
      data: {
        userId: dto.userId,
        employeeCode: dto.employeeCode,
        warehouseId: dto.warehouseId,
        pinHash,
      },
      include: {
        user: { select: { email: true, name: true } },
        warehouse: { select: { code: true, name: true } },
      },
    });
  }

  async setStaffPin(employeeCode: string, dto: UpdateStaffPinDto) {
    const staff = await this.prisma.warehouseStaff.findUnique({
      where: { employeeCode },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên');

    const pinHash = await bcrypt.hash(String(dto.pin), 10);
    await this.prisma.warehouseStaff.update({
      where: { id: staff.id },
      data: { pinHash },
    });
    return { ok: true };
  }

  async deactivateStaff(id: string) {
    return this.prisma.warehouseStaff.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

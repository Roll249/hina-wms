import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Roles } from '../../common/decorators/auth.decorators';
import { Role } from '@prisma/client';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: Role };
}

@Controller('categories')
@Roles(Role.ADMIN, Role.MANAGE)
export class CategoryController {
  constructor(private readonly svc: CategoryService) {}

  /**
   * Lấy category tree (parent → children) cho UI.
   */
  @Get('tree')
  getTree() {
    return this.svc.getTree();
  }

  /**
   * Lấy flat list (kèm cả soft-deleted) cho admin quản lý.
   */
  @Get()
  getFlat() {
    return this.svc.getFlat();
  }

  /**
   * Thống kê sync: tổng / active / mapped / unmapped.
   * Giúp admin biết tình trạng đồng bộ với web.
   */
  @Get('sync-stats')
  getSyncStats() {
    return this.svc.getSyncStats();
  }

  /**
   * Tạo category mới.
   * Vì WMS và e-comm share DB nên INSERT vào Category sẽ tự động xuất hiện trên web.
   */
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.svc.create(dto);
  }

  /**
   * Cập nhật category.
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.svc.update(id, dto);
  }

  /**
   * Soft-delete category.
   * Sẽ từ chối nếu còn product hoặc child đang dùng.
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.svc.softDelete(id);
    return { ok: true, id, deletedBy: req.user.email };
  }
}

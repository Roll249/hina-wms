import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { StockService } from './stock.service';
import { StockBulkService } from './stock-bulk.service';
import { Roles } from '../../common/decorators/auth.decorators';
import { Role } from '@prisma/client';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: Role };
}

@Controller('stock-bulk')
@Roles(Role.ADMIN, Role.MANAGE)
export class StockBulkController {
  constructor(
    private readonly bulk: StockBulkService,
  ) {}

  /**
   * Export stock sang CSV (tải file .csv trực tiếp)
   * Query: search, isClassified, categoryId, lowStockOnly
   */
  @Get('export-csv')
  async exportCsv(
    @Query('search') search?: string,
    @Query('isClassified') isClassified?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Res() res?: Response,
  ) {
    const csv = await this.bulk.exportToCsv({
      search,
      isClassified: isClassified === undefined ? undefined : isClassified === 'true',
      categoryId,
      lowStockOnly: lowStockOnly === 'true',
    });

    const filename = `ton-kho-${new Date().toISOString().slice(0, 10)}.csv`;
    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res!.send(csv);
  }

  /**
   * Bulk edit nhiều sản phẩm cùng lúc.
   * Body:
   * {
   *   productIds: string[],
   *   operations: [{ field, mode, value }]
   * }
   */
  @Post('edit')
  bulkEdit(
    @Body() body: {
      productIds: string[];
      operations: Array<{
        field: string;
        mode: 'set' | 'increase' | 'decrease';
        value: number | string | boolean;
      }>;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.bulk.bulkEdit({
      productIds: body.productIds,
      operations: body.operations as any,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      ipAddress: req.ip,
    });
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  async cleanDb() {
    if (process.env.NODE_ENV === 'production') return;
    // Dọn dẹp chỉ các bảng WMS (không động vào dữ liệu hina-e-comm)
    const tablenames = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename IN (
        'OutboundShipmentItem', 'OutboundShipment',
        'GoodsReceiptItem', 'GoodsReceipt',
        'WarehouseStaff', 'Supplier', 'Warehouse'
      )
    `;
    const tables = tablenames
      .map(({ tablename }) => tablename)
      .map((name) => `"${name}"`)
      .join(', ');
    if (tables.length > 0) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  }
}

import { Module, Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Public } from '../../common/decorators/auth.decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {}

    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}

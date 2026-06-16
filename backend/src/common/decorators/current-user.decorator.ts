import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../modules/auth/jwt-payload.interface';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

export const CurrentWarehouseId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    // Ưu tiên: query param > header > user.warehouseId (từ token)
    const fromQuery = request.query?.warehouseId as string | undefined;
    if (fromQuery) return fromQuery;
    const fromHeader = request.headers['x-warehouse-id'] as string | undefined;
    if (fromHeader) return fromHeader;
    return request.user?.warehouseId;
  },
);

export { Role };

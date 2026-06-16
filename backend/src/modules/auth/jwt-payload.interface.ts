import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;             // userId
  email: string;
  role: Role;
  warehouseId?: string;    // optional - dành cho warehouse staff
  employeeCode?: string;   // optional - mã nhân viên
  iat?: number;
  exp?: number;
}

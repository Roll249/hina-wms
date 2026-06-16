import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtPayload } from './jwt-payload.interface';
import { LoginDto, PinLoginDto, RefreshTokenDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login bằng email + password - dành cho admin/manager
   * Tự động liên kết WarehouseStaff nếu user có role MANAGE/ADMIN
   *
   * Chỉ chấp nhận role ADMIN, MANAGE. Các role khác (RETAIL, WHOLESALE, CTV)
   * phải dùng e-comm làm hệ thống đăng nhập chính.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        warehouseStaff: {
          include: { warehouse: true },
        },
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    // WMS chỉ dành cho nhân viên kho/admin/manager.
    // RETAIL/WHOLESALE/CTV thuộc về e-comm, không thể login WMS.
    if (!['ADMIN', 'MANAGE'].includes(user.role)) {
      throw new UnauthorizedException(
        'Tài khoản không có quyền truy cập WMS. Vui lòng dùng trang đăng nhập e-comm.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    return this.generateTokens(user.id, user.email, user.role, {
      warehouseId: user.warehouseStaff?.warehouseId,
      employeeCode: user.warehouseStaff?.employeeCode,
    });
  }

  /**
   * Login nhanh bằng PIN - dành cho thiết bị kho chia sẻ
   * Tìm WarehouseStaff theo employeeCode hoặc danh sách active
   */
  async pinLogin(dto: PinLoginDto) {
    if (!dto.employeeCode) {
      throw new BadRequestException('Cần nhập mã nhân viên');
    }

    const staff = await this.prisma.warehouseStaff.findUnique({
      where: { employeeCode: dto.employeeCode },
      include: { user: true, warehouse: true },
    });

    if (!staff || !staff.isActive || !staff.pinHash) {
      throw new UnauthorizedException('Mã nhân viên không hợp lệ');
    }

    if (!staff.user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    const pinValid = await bcrypt.compare(dto.pin, staff.pinHash);
    if (!pinValid) {
      throw new UnauthorizedException('PIN không đúng');
    }

    return this.generateTokens(staff.userId, staff.user.email, staff.user.role, {
      warehouseId: staff.warehouseId,
      employeeCode: staff.employeeCode,
    });
  }

  /**
   * Refresh access token
   */
  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      // Tra cứu WarehouseStaff theo userId
      const staff = await this.prisma.warehouseStaff.findUnique({
        where: { userId: payload.sub },
      });

      return this.generateTokens(payload.sub, payload.email, payload.role, {
        warehouseId: staff?.warehouseId,
        employeeCode: staff?.employeeCode,
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: any,
    extra: { warehouseId?: string; employeeCode?: string },
  ) {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      warehouseId: extra.warehouseId,
      employeeCode: extra.employeeCode,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      { expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d') },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email,
        role,
        warehouseId: extra.warehouseId,
        employeeCode: extra.employeeCode,
      },
    };
  }

  /**
   * Tạo PIN hash - helper cho admin
   */
  async setPin(employeeCode: string, pin: string) {
    const staff = await this.prisma.warehouseStaff.findUnique({
      where: { employeeCode },
    });
    if (!staff) throw new BadRequestException('Không tìm thấy nhân viên');

    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.warehouseStaff.update({
      where: { id: staff.id },
      data: { pinHash },
    });
    return { ok: true };
  }
}

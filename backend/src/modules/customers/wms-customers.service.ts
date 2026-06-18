import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, AddressType, Role, AuditAction } from '@prisma/client';
import { CreateManualOrderCustomerDto, ManualCustomerAddressDto } from './dto/wms-customers.dto';

/**
 * WMS Customers Service
 *
 * Quản lý khách hàng cho đơn tạo từ WMS (offline/phone).
 *
 * Khác biệt so với ecom:
 * - Ecom admin/orders/customers tạo User với email ngẫu nhiên mỗi lần → luôn tạo mới
 * - WMS dùng PHONE làm khóa chính: tìm user manual theo phone trước, nếu có thì dùng lại
 *   (vd: khách quay lại mua offline nhiều lần → cùng 1 record, lịch sử mua gộp lại)
 *
 * Manual customer email format: manual-customer+phone:{phone}@wms.internal
 *   → Dễ debug, tìm kiếm bằng email prefix
 */
@Injectable()
export class WmsCustomersService {
  private readonly logger = new Logger(WmsCustomersService.name);
  private readonly MANUAL_EMAIL_PREFIX = 'manual-customer+phone:';
  private readonly MANUAL_EMAIL_DOMAIN = 'wms.internal';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tìm hoặc tạo manual customer theo SĐT.
   * - Nếu đã có user manual với phone này → trả về user đó (idempotent)
   * - Nếu chưa có → tạo mới với email format: manual-customer+phone:{phone}@wms.internal
   *
   * @returns { userId, wholesaleCustomerId, deliveryAddressId, isNew }
   */
  async createOrFindByPhone(
    actorUserId: string,
    name: string,
    phone: string,
    shippingAddress: string,
  ): Promise<{
    userId: string;
    wholesaleCustomerId: string;
    deliveryAddressId: string;
    isNew: boolean;
  }> {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = shippingAddress.trim();

    if (!trimmedName) throw new BadRequestException('Tên khách hàng là bắt buộc');
    if (!trimmedPhone) throw new BadRequestException('Số điện thoại là bắt buộc');
    if (!trimmedAddress) throw new BadRequestException('Địa chỉ giao hàng là bắt buộc');

    // Bước 1: Tìm user manual theo phone (qua email pattern manual-customer+phone:{phone}@wms.internal)
    const existingEmail = this.buildManualEmailByPhone(trimmedPhone);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: existingEmail },
      include: {
        wholesaleCustomer: true,
        address: { take: 5, orderBy: { isDefault: 'desc' } },
      },
    });

    if (existingUser && existingUser.wholesaleCustomer) {
      const wc = existingUser.wholesaleCustomer;

      // Update name nếu khác
      if (existingUser.name !== trimmedName || wc.businessName !== trimmedName) {
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: existingUser.id },
            data: { name: trimmedName },
          }),
          this.prisma.wholesaleCustomer.update({
            where: { id: wc.id },
            data: { businessName: trimmedName },
          }),
        ]);
      }

      // Luôn tạo address mới cho đơn này (lưu lịch sử địa chỉ)
      const newAddress = await this.prisma.address.create({
        data: {
          userId: existingUser.id,
          type: AddressType.DELIVERY,
          name: trimmedName,
          phone: trimmedPhone,
          street: trimmedAddress,
          city: '',
          province: '',
          country: 'Vietnam',
          isDefault: false,
        },
      });

      this.logger.log(
        `Reuse manual customer: ${existingEmail} (wholesaleCustomerId=${wc.id})`,
      );

      return {
        userId: existingUser.id,
        wholesaleCustomerId: wc.id,
        deliveryAddressId: newAddress.id,
        isNew: false,
      };
    }

    // Bước 2: Chưa có → tạo mới
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: existingEmail,
          password: `__wms_manual__${trimmedPhone}_${Date.now()}`,
          role: Role.WHOLESALE,
          isActive: true,
          approvedAt: now,
          approvedBy: actorUserId,
          name: trimmedName,
        },
      });

      const wholesaleCustomer = await tx.wholesaleCustomer.create({
        data: {
          userId: user.id,
          businessName: trimmedName,
          approvedAt: now,
          approvedBy: actorUserId,
        },
      });

      const address = await tx.address.create({
        data: {
          userId: user.id,
          type: AddressType.DELIVERY,
          name: trimmedName,
          phone: trimmedPhone,
          street: trimmedAddress,
          city: '',
          province: '',
          country: 'Vietnam',
          isDefault: true,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'WmsManualCustomer',
          entityId: wholesaleCustomer.id,
          action: AuditAction.CREATE,
          userId: actorUserId,
          changes: {
            name: trimmedName,
            phone: trimmedPhone,
            address: trimmedAddress,
            source: 'WMS',
          },
        },
      });

      return {
        userId: user.id,
        wholesaleCustomerId: wholesaleCustomer.id,
        deliveryAddressId: address.id,
      };
    });

    this.logger.log(
      `Created new manual customer: ${existingEmail} (wholesaleCustomerId=${result.wholesaleCustomerId})`,
    );

    return { ...result, isNew: true };
  }

  /**
   * Search khách hàng (wholesale + manual) theo tên, SĐT, email, địa chỉ.
   */
  async searchCustomers(query: string, limit = 10) {
    const trimmed = query?.trim();
    const safeLimit = Math.min(limit, 20);

    if (!trimmed) {
      const customers = await this.prisma.wholesaleCustomer.findMany({
        where: {
          user: {
            role: { in: [Role.WHOLESALE, Role.RETAIL] },
            isActive: true,
            deletedAt: null,
          },
        },
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        include: this.customerInclude(),
      });
      return customers.map((c) => this.toCustomerDto(c));
    }

    const customers = await this.prisma.wholesaleCustomer.findMany({
      where: {
        user: {
          role: { in: [Role.WHOLESALE, Role.RETAIL] },
          isActive: true,
          deletedAt: null,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
            { wholesaleCustomer: { businessName: { contains: trimmed, mode: 'insensitive' } } },
            { wholesaleCustomer: { ico: { contains: trimmed, mode: 'insensitive' } } },
            { address: { some: { phone: { contains: trimmed } } } },
            { address: { some: { name: { contains: trimmed, mode: 'insensitive' } } } },
            { address: { some: { street: { contains: trimmed, mode: 'insensitive' } } } },
          ],
        },
      },
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: this.customerInclude(),
    });

    return customers.map((c) => this.toCustomerDto(c));
  }

  /**
   * Tạo customer manual đầy đủ (giống ecom createManualOrderCustomer).
   * Dùng khi admin WMS tạo customer trước rồi mới tạo đơn.
   */
  async createManualCustomer(actorUserId: string, dto: CreateManualOrderCustomerDto) {
    const name = dto.name.trim();
    const deliveryAddress = dto.deliveryAddress;
    const companyAddress = dto.companyAddress;
    const businessId = dto.businessId?.trim() || null;
    const taxId = dto.taxId?.trim() || null;
    const dic = dto.dic?.trim() || null;

    if (!name) throw new BadRequestException('Tên khách hàng là bắt buộc');
    if (!deliveryAddress.street.trim()) {
      throw new BadRequestException('Địa chỉ giao hàng là bắt buộc');
    }

    const phone = deliveryAddress.phone.trim();
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: this.buildManualEmailByPhone(phone),
          password: `__wms_manual__${phone}_${Date.now()}`,
          role: Role.WHOLESALE,
          isActive: true,
          approvedAt: now,
          approvedBy: actorUserId,
          name,
          ico: businessId,
          dic,
        },
      });

      const wholesaleCustomer = await tx.wholesaleCustomer.create({
        data: {
          userId: user.id,
          businessName: name,
          taxId,
          ico: businessId,
          dic,
          approvedAt: now,
          approvedBy: actorUserId,
        },
      });

      const deliveryAddr = await tx.address.create({
        data: this.toAddressCreateInput(user.id, deliveryAddress, AddressType.DELIVERY, true),
      });

      const companyAddr = companyAddress
        ? await tx.address.create({
            data: this.toAddressCreateInput(user.id, companyAddress, AddressType.COMPANY_OFFICE, false),
          })
        : null;

      await tx.auditLog.create({
        data: {
          entityType: 'WmsManualCustomer',
          entityId: wholesaleCustomer.id,
          action: AuditAction.CREATE,
          userId: actorUserId,
          changes: { name, businessId, taxId, dic, source: 'WMS' },
        },
      });

      return {
        userId: user.id,
        wholesaleCustomerId: wholesaleCustomer.id,
        deliveryAddressId: deliveryAddr.id,
        companyAddressId: companyAddr?.id,
      };
    });

    // Fetch lại customer đầy đủ để trả về
    return this.getCustomerById(result.wholesaleCustomerId);
  }

  /**
   * Lấy chi tiết 1 customer.
   */
  async getCustomerById(wholesaleCustomerId: string) {
    const wc = await this.prisma.wholesaleCustomer.findUnique({
      where: { id: wholesaleCustomerId },
      include: this.customerInclude(),
    });
    if (!wc) throw new NotFoundException('Không tìm thấy khách hàng');
    return this.toCustomerDto(wc);
  }

  // ----- private helpers -----

  private buildManualEmailByPhone(phone: string): string {
    // Normalize phone (bỏ space, dash, paren, +) để cùng 1 SĐT nhiều format → cùng email
    const normalized = phone.replace(/[\s\-\(\)\+]/g, '');
    return `${this.MANUAL_EMAIL_PREFIX}${normalized}@${this.MANUAL_EMAIL_DOMAIN}`;
  }

  private customerInclude() {
    return {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          address: {
            take: 5,
            orderBy: { isDefault: 'desc' as const },
          },
        },
      },
    } satisfies Prisma.WholesaleCustomerInclude;
  }

  private toAddressCreateInput(
    userId: string,
    addr: ManualCustomerAddressDto,
    type: AddressType,
    isDefault: boolean,
  ): Prisma.AddressUncheckedCreateInput {
    return {
      userId,
      type,
      label: addr.label?.trim() || null,
      name: addr.name.trim(),
      phone: addr.phone.trim(),
      street: addr.street.trim(),
      ward: addr.ward?.trim() || null,
      district: addr.district?.trim() || null,
      city: addr.city.trim(),
      province: addr.province.trim(),
      country: addr.country?.trim() || 'Vietnam',
      postalCode: addr.postalCode?.trim() || null,
      isDefault,
    };
  }

  private toCustomerDto(wc: any) {
    const addresses = wc.user?.address ?? [];
    const defaultDelivery = addresses.find((a: any) => a.type === 'DELIVERY' && a.isDefault)
      || addresses.find((a: any) => a.type === 'DELIVERY');
    const defaultCompany = addresses.find((a: any) => a.type === 'COMPANY_OFFICE' && a.isDefault)
      || addresses.find((a: any) => a.type === 'COMPANY_OFFICE');

    return {
      id: wc.id,
      wholesaleCustomerId: wc.id,
      userId: wc.user?.id,
      displayName: wc.businessName || wc.user?.name || wc.user?.email,
      email: wc.user?.email ?? null,
      phone: defaultDelivery?.phone ?? null,
      businessName: wc.businessName,
      ico: wc.ico,
      dic: wc.dic,
      taxId: wc.taxId,
      isManualOrderCustomer: wc.user?.email?.startsWith(this.MANUAL_EMAIL_PREFIX) ?? false,
      defaultDeliveryAddressId: defaultDelivery?.id ?? null,
      defaultCompanyAddressId: defaultCompany?.id ?? null,
      addresses: addresses.map((a: any) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        phone: a.phone,
        street: a.street,
        ward: a.ward,
        district: a.district,
        city: a.city,
        province: a.province,
        isDefault: a.isDefault,
      })),
    };
  }
}

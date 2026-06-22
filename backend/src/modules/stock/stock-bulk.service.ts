import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface BulkEditOperation {
  field: 'categoryId' | 'isClassified' | 'basePrice' | 'taxRate' | 'visibility' | 'showPriceToGuest' | 'showPriceToRetail' | 'showPriceToWholesale';
  mode: 'set' | 'increase' | 'decrease'; // 'set'=replace, 'increase'/'decrease'=value/percentage
  value: number | string | boolean;
}

export interface BulkEditParams {
  productIds: string[];
  operations: BulkEditOperation[];
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  ipAddress?: string;
}

export interface StockExportFilters {
  search?: string;
  isClassified?: boolean;
  categoryId?: string;
  lowStockOnly?: boolean;
}

@Injectable()
export class StockBulkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export tất cả hàng hóa ra CSV với filters hiện tại.
   * Stream từ DB (findMany không phân trang) → build CSV string.
   */
  async exportToCsv(filters: StockExportFilters): Promise<string> {
    // Build where tương tự listStock
    const where: any = {
      product: { deletedAt: null },
    };
    if (filters.isClassified !== undefined) {
      where.product.isClassified = filters.isClassified;
    }
    if (filters.categoryId) {
      where.product.categoryId = filters.categoryId;
    }
    if (filters.search) {
      where.product = {
        ...where.product,
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { productCode: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            productCode: true,
            name: true,
            basePrice: true,
            taxRate: true,
            visibility: true,
            supplierCode: true,
            weight: true,
            isClassified: true,
            categoryId: true,
            category: { select: { name: true } },
            showPriceToGuest: true,
            showPriceToRetail: true,
            showPriceToWholesale: true,
          },
        },
        variant: {
          select: {
            id: true, sku: true, productCode: true, name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50000, // giới hạn an toàn
    });

    // Low stock filter (sau khi fetch)
    let filtered = items;
    if (filters.lowStockOnly) {
      filtered = items.filter((it) => it.quantity <= it.lowStockThreshold);
    }

    // Build CSV
    const headers = [
      'productId',
      'variantId',
      'productCode',
      'sku',
      'ten',
      'variantName',
      'categoryName',
      'tonKho',
      'datTruoc',
      'available',
      'lowStockThreshold',
      'isLowStock',
      'isClassified',
      'giaBan',
      'thueVAT',
      'visibility',
      'maNCC',
      'khoiLuong',
      'showPriceToGuest',
      'showPriceToRetail',
      'showPriceToWholesale',
      'capNhat',
    ];

    const escape = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows: string[] = [headers.join(',')];
    for (const it of filtered) {
      const p = it.product;
      if (!p) continue;
      const available = it.quantity - it.reservedQty;
      const isLow = it.quantity <= it.lowStockThreshold;
      rows.push([
        p.id,
        it.variantId ?? '',
        p.productCode,
        p.sku,
        it.variant?.name ?? p.name,
        it.variant?.name ?? '',
        p.category?.name ?? '',
        it.quantity,
        it.reservedQty,
        available,
        it.lowStockThreshold,
        isLow ? 'CO' : '',
        p.isClassified ? 'CO' : '',
        Number(p.basePrice),
        p.taxRate ? Number(p.taxRate) : '',
        p.visibility,
        p.supplierCode ?? '',
        p.weight ? Number(p.weight) : '',
        p.showPriceToGuest ? 'CO' : '',
        p.showPriceToRetail ? 'CO' : '',
        p.showPriceToWholesale ? 'CO' : '',
        it.updatedAt.toISOString(),
      ].map(escape).join(','));
    }

    // BOM UTF-8 để Excel hiển thị tiếng Việt đúng
    return '\ufeff' + rows.join('\n');
  }

  /**
   * Bulk edit nhiều sản phẩm cùng lúc.
   * Hỗ trợ:
   * - set: gán giá trị mới
   * - increase/decrease: tăng/giảm số (value là số dương)
   *   Nếu value < 1, coi là phần trăm (vd: 0.1 = tăng 10%)
   *   Nếu value >= 1, coi là số tuyệt đối
   */
  async bulkEdit(params: BulkEditParams) {
    const { productIds, operations, actorUserId, actorEmail, actorRole, ipAddress } = params;

    if (!productIds?.length) {
      throw new BadRequestException('Cần ít nhất 1 sản phẩm');
    }
    if (!operations?.length) {
      throw new BadRequestException('Cần ít nhất 1 thao tác');
    }
    if (productIds.length > 500) {
      throw new BadRequestException('Tối đa 500 sản phẩm/lần');
    }

    // Validate operations
    const allowedFields = new Set([
      'categoryId', 'isClassified', 'basePrice', 'taxRate',
      'visibility', 'showPriceToGuest', 'showPriceToRetail', 'showPriceToWholesale',
    ]);
    for (const op of operations) {
      if (!allowedFields.has(op.field)) {
        throw new BadRequestException(`Field không hợp lệ: ${op.field}`);
      }
      if (!['set', 'increase', 'decrease'].includes(op.mode)) {
        throw new BadRequestException(`Mode không hợp lệ: ${op.mode}`);
      }
    }

    // Lấy sản phẩm hiện tại
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
    });

    if (products.length === 0) {
      throw new BadRequestException('Không tìm thấy sản phẩm nào');
    }

    // Nếu có op categoryId → validate category tồn tại
    const categoryOps = operations.filter((o) => o.field === 'categoryId');
    for (const op of categoryOps) {
      const cat = await this.prisma.category.findUnique({ where: { id: String(op.value) } });
      if (!cat) {
        throw new BadRequestException(`Category không tồn tại: ${op.value}`);
      }
    }

    // Build update data cho từng product
    const updatedRecords: Array<{
      productId: string;
      productCode: string;
      productName: string;
      changes: Record<string, [any, any]>;
    }> = [];

    for (const product of products) {
      const data: any = {};
      const changes: Record<string, [any, any]> = {};

      for (const op of operations) {
        const oldVal = (product as any)[op.field];
        let newVal: any;

        if (op.mode === 'set') {
          newVal = op.value;
        } else if (op.field === 'categoryId' || op.field === 'visibility') {
          // string fields chỉ hỗ trợ set
          newVal = op.value;
        } else if (op.field === 'isClassified' || op.field.startsWith('showPriceTo')) {
          // boolean fields - increase/decrease không hợp lệ, fallback to set
          newVal = Boolean(op.value);
        } else {
          // number fields: basePrice, taxRate
          const numVal = Number(op.value);
          const oldNum = oldVal ? Number(oldVal) : 0;
          if (op.mode === 'increase') {
            // value < 1 = phần trăm, value >= 1 = số tuyệt đối
            newVal = Math.abs(numVal) < 1 ? oldNum * (1 + numVal) : oldNum + numVal;
          } else if (op.mode === 'decrease') {
            newVal = Math.abs(numVal) < 1 ? oldNum * (1 - numVal) : oldNum - numVal;
          }
          newVal = Math.max(0, newVal);
          // Round basePrice to 2 decimals
          if (op.field === 'basePrice') {
            newVal = Math.round(newVal * 100) / 100;
          }
        }

        // So sánh
        const same = String(oldVal ?? '') === String(newVal ?? '');
        if (!same) {
          data[op.field] = newVal;
          changes[op.field] = [oldVal, newVal];
        }
      }

      if (Object.keys(changes).length > 0) {
        await this.prisma.product.update({
          where: { id: product.id },
          data,
        });
        updatedRecords.push({
          productId: product.id,
          productCode: product.productCode,
          productName: product.name,
          changes,
        });
      }
    }

    // Ghi 1 audit log tổng cho cả batch
    if (updatedRecords.length > 0) {
      await this.prisma.auditLog.create({
        data: {
          entityType: 'Product',
          entityId: 'BULK_EDIT',
          action: 'UPDATE',
          changes: {
            productCount: updatedRecords.length,
            operations: operations as any,
            records: updatedRecords.slice(0, 50), // lưu tối đa 50 records chi tiết
            note: `[BULK_EDIT] Sửa ${updatedRecords.length} sản phẩm (${operations.length} thao tác)`,
          },
          userId: actorUserId,
          userEmail: actorEmail,
          userRole: actorRole,
          ipAddress,
        },
      });
    }

    return {
      total: products.length,
      changed: updatedRecords.length,
      records: updatedRecords,
    };
  }
}

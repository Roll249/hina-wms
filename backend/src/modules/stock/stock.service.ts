import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tra cứu tồn kho tổng quan (kèm reserved qty).
   * Lấy trực tiếp từ Inventory model của hina-e-comm.
   */
  async listStock(params: {
    search?: string;
    warehouseId?: string;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const { search, lowStockOnly, page = 1, pageSize = 50 } = params;
    const skip = (page - 1) * pageSize;

    // Tìm theo productCode hoặc product name
    const where: any = { product: { deletedAt: null } };
    if (lowStockOnly) {
      where.OR = [
        { quantity: { lte: 0 } },
        { quantity: { lte: { } } }, // sẽ filter sau
      ];
    }

    // Build từ product filter
    if (search) {
      where.product = {
        ...where.product,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { productCode: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { variants: { some: { OR: [
            { productCode: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ] } } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          product: {
            select: {
              id: true, sku: true, productCode: true, name: true,
              basePrice: true,
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          variant: {
            select: {
              id: true, sku: true, productCode: true, name: true,
              attributes: true,
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
        orderBy: { quantity: 'asc' },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    // Lọc low stock sau khi fetch (vì cần so sánh quantity với lowStockThreshold)
    let filteredItems = items;
    if (lowStockOnly) {
      filteredItems = items.filter(
        (it) => it.quantity <= it.lowStockThreshold,
      );
    }

    return {
      items: filteredItems.map((it) => ({
        inventoryId: it.id,
        productId: it.productId,
        variantId: it.variantId,
        productCode: it.variant?.productCode ?? it.product?.productCode,
        sku: it.variant?.sku ?? it.product?.sku,
        name: it.variant?.name ?? it.product?.name,
        variantName: it.variant?.name,
        attributes: it.variant?.attributes,
        imageUrl: it.variant?.images?.[0]?.url ?? it.product?.images?.[0]?.url,
        quantity: it.quantity,
        reservedQty: it.reservedQty,
        available: it.quantity - it.reservedQty,
        lowStockThreshold: it.lowStockThreshold,
        isLowStock: it.quantity <= it.lowStockThreshold,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Chi tiết tồn kho của 1 sản phẩm (kèm reservedQty, available).
   * Tìm theo productCode / SKU (barcode / UPC).
   */
  async lookupByCode(code: string) {
    if (!code) throw new NotFoundException('Cần nhập mã sản phẩm');

    const trimmed = code.trim();

    // Ưu tiên variant
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        OR: [
          { productCode: trimmed },
          { sku: trimmed },
        ],
      },
      include: {
        product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
        inventory: true,
        images: { take: 1, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (variant) {
      return {
        type: 'variant' as const,
        productId: variant.productId,
        variantId: variant.id,
        productCode: variant.productCode,
        sku: variant.sku,
        name: variant.product.name + ' - ' + variant.name,
        attributes: variant.attributes as Record<string, string>,
        imageUrl: variant.images?.[0]?.url ?? variant.product.images?.[0]?.url,
        quantity: variant.inventory?.quantity ?? 0,
        reservedQty: variant.inventory?.reservedQty ?? 0,
        available: (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQty ?? 0),
        lowStockThreshold: variant.inventory?.lowStockThreshold ?? 10,
      };
    }

    // Tìm product cha
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { productCode: trimmed },
          { sku: trimmed },
          { supplierCode: trimmed },
        ],
        deletedAt: null,
      },
      include: {
        inventory: true,
        images: { take: 1, orderBy: { sortOrder: 'asc' } },
        variants: {
          include: { inventory: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (product) {
      return {
        type: 'product' as const,
        productId: product.id,
        variantId: null,
        productCode: product.productCode,
        sku: product.sku,
        name: product.name,
        attributes: product.attributes as Record<string, string> | null,
        imageUrl: product.images?.[0]?.url,
        quantity: product.inventory?.quantity ?? 0,
        reservedQty: product.inventory?.reservedQty ?? 0,
        available: (product.inventory?.quantity ?? 0) - (product.inventory?.reservedQty ?? 0),
        lowStockThreshold: product.inventory?.lowStockThreshold ?? 10,
        variants: product.variants.map((v) => ({
          variantId: v.id,
          productCode: v.productCode,
          sku: v.sku,
          name: v.name,
          attributes: v.attributes,
          imageUrl: v.images?.[0]?.url,
          quantity: v.inventory?.quantity ?? 0,
          reservedQty: v.inventory?.reservedQty ?? 0,
        })),
      };
    }

    throw new NotFoundException(`Không tìm thấy sản phẩm với mã "${code}"`);
  }

  /**
   * Lấy lịch sử biến động tồn kho
   */
  async listMovements(params: {
    productId?: string;
    variantId?: string;
    inventoryId?: string;
    type?: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { productId, variantId, inventoryId, type, fromDate, toDate, page = 1, pageSize = 30 } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (productId) where.productId = productId;
    if (variantId) where.variantId = variantId;
    if (inventoryId) where.inventoryId = inventoryId;
    if (type) where.type = type;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          product: { select: { name: true, productCode: true } },
          variant: { select: { name: true, productCode: true } },
          warehouseStaff: { select: { employeeCode: true, user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      items: items.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        productName: m.variant?.name ?? m.product?.name,
        productCode: m.variant?.productCode ?? m.product?.productCode,
        reference: m.reference,
        note: m.note,
        staff: m.warehouseStaff
          ? {
              employeeCode: m.warehouseStaff.employeeCode,
              fullName: m.warehouseStaff.user.name,
            }
          : null,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Cảnh báo tồn thấp
   */
  async lowStockAlerts(threshold?: number) {
    const where: any = { product: { deletedAt: null } };
    if (threshold !== undefined) {
      where.lowStockThreshold = { gte: threshold };
    }

    const items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true, name: true, productCode: true, sku: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        variant: {
          select: {
            id: true, name: true, productCode: true, sku: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      take: 200,
    });

    return items
      .filter((it) => it.quantity <= it.lowStockThreshold)
      .map((it) => ({
        inventoryId: it.id,
        productId: it.productId,
        variantId: it.variantId,
        productCode: it.variant?.productCode ?? it.product?.productCode,
        sku: it.variant?.sku ?? it.product?.sku,
        name: it.variant?.name ?? it.product?.name,
        imageUrl: it.variant?.images?.[0]?.url ?? it.product?.images?.[0]?.url,
        quantity: it.quantity,
        reservedQty: it.reservedQty,
        available: it.quantity - it.reservedQty,
        lowStockThreshold: it.lowStockThreshold,
      }))
      .sort((a, b) => a.available - b.available);
  }
}

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/events/event-bus.service';
import { MovementType } from '@prisma/client';

interface ProductImportRow {
  sku?: string;
  productCode?: string;
  name: string;
  categoryName?: string;
  basePrice?: number;
  quantity?: number;
  supplierCode?: string;
  description?: string;
  weight?: number;
}

interface ReceiptImportRow {
  receiptNumber?: string;
  productCode: string;
  quantity: number;
  unitCost?: number;
  note?: string;
}

interface StockAdjustRow {
  productCode: string;
  newQuantity: number;
  reason?: string;
}

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Export inventory to JSON (for Excel conversion)
   */
  async exportInventory(params: {
    categoryId?: string;
    includeOutOfStock?: boolean;
  }) {
    const { categoryId, includeOutOfStock = true } = params;

    const where: any = { product: { deletedAt: null } };
    if (categoryId) where.product.categoryId = categoryId;

    let items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            sku: true,
            productCode: true,
            name: true,
            category: { select: { name: true } },
            basePrice: true,
            supplierCode: true,
          },
        },
        variant: {
          select: {
            sku: true,
            productCode: true,
            name: true,
          },
        },
      },
    });

    if (!includeOutOfStock) {
      items = items.filter((i) => i.quantity > 0);
    }

    return items.map((item) => ({
      SKU: item.variant?.sku ?? item.product?.sku,
      'Mã sản phẩm': item.variant?.productCode ?? item.product?.productCode,
      'Tên sản phẩm': item.variant
        ? `${item.product?.name} - ${item.variant.name}`
        : item.product?.name,
      'Danh mục': item.product?.category?.name,
      'Giá cơ bản': item.product?.basePrice,
      'Tồn kho': item.quantity,
      'Đã bán (web)': item.webSoldQty,
      'Còn lại (web)': item.webListedQty - item.webSoldQty - item.webReservedQty,
      'Mã nhà cung cấp': item.product?.supplierCode,
    }));
  }

  /**
   * Export products to JSON
   */
  async exportProducts(params: {
    categoryId?: string;
    includeInactive?: boolean;
  }) {
    const { categoryId, includeInactive = false } = params;

    const where: any = {};
    if (!includeInactive) where.deletedAt = null;
    if (categoryId) where.categoryId = categoryId;

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        variants: { select: { sku: true, productCode: true, name: true, basePrice: true } },
        images: { select: { url: true, isPrimary: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      SKU: p.sku,
      'Mã sản phẩm': p.productCode,
      'Tên sản phẩm': p.name,
      'Danh mục': p.category.name,
      'Giá cơ bản': p.basePrice,
      'Mô tả': p.description,
      'Trọng lượng (g)': p.weight,
      'Mã nhà cung cấp': p.supplierCode,
      'Biến thể': p.variants.length,
      'Ảnh chính': p.images.find((i) => i.isPrimary)?.url ?? p.images[0]?.url,
    }));
  }

  /**
   * Import products from JSON array
   */
  async importProducts(rows: ProductImportRow[], userId: string) {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const row of rows) {
      try {
        // Find category
        let category = null;
        if (row.categoryName) {
          category = await this.prisma.category.findFirst({
            where: { name: { equals: row.categoryName, mode: 'insensitive' } } as any },
          });
        }

        const data = {
          name: row.name,
          categoryId: category?.id,
          basePrice: row.basePrice ?? 0,
          description: row.description,
          weight: row.weight,
          supplierCode: row.supplierCode,
        };

        // Check if exists by sku or productCode
        const existing = await this.prisma.product.findFirst({
          where: {
            OR: [
              { sku: row.sku },
              { productCode: row.productCode },
            ].filter(Boolean) as any,
          },
        });

        if (existing) {
          await this.prisma.product.update({
            where: { id: existing.id },
            data,
          });
          results.updated++;
        } else {
          await this.prisma.product.create({
            data: {
              ...data,
              sku: row.sku ?? `SKU-${Date.now()}`,
              productCode: row.productCode ?? `PC-${Date.now()}`,
              slug: row.name.toLowerCase().replace(/\s+/g, '-'),
            },
          });
          results.created++;
        }
      } catch (err) {
        results.errors.push(`Row "${row.name}": ${(err as Error).message}`);
      }
    }

    return results;
  }

  /**
   * Create receipt from import data
   */
  async createReceiptFromImport(rows: ReceiptImportRow[], userId: string, note?: string) {
    const warehouseId = await this.getDefaultWarehouseId();
    
    // Get or create warehouse staff
    const staff = await this.prisma.warehouseStaff.findFirst({
      where: { userId },
    });

    if (!staff) {
      throw new BadRequestException('User chưa được gán làm nhân viên kho');
    }

    // Generate receipt number
    const count = await this.prisma.goodsReceipt.count();
    const receiptNumber = `RCV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Create receipt with items
    const receipt = await this.prisma.$transaction(async (tx) => {
      const newReceipt = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          warehouseId,
          receivedById: staff.id,
          source: 'FILE' as any,
          note,
        },
      });

      for (const row of rows) {
        // Find product by code
        const product = await tx.product.findFirst({
          where: {
            OR: [
              { productCode: row.productCode },
              { sku: row.productCode },
            ],
          },
        });

        if (!product) {
          this.logger.warn(`Product not found: ${row.productCode}`);
          continue;
        }

        await tx.goodsReceiptItem.create({
          data: {
            receiptId: newReceipt.id,
            productId: product.id,
            productCode: row.productCode,
            productName: product.name,
            sku: product.sku,
            expectedQuantity: 0,
            receivedQuantity: row.quantity,
            unitCost: row.unitCost,
            note: row.note,
          },
        });

        // Update inventory
        await tx.inventory.upsert({
          where: { productId_variantId: { productId: product.id, variantId: null } },
          create: {
            productId: product.id,
            quantity: row.quantity,
          },
          update: {
            quantity: { increment: row.quantity },
          },
        });

        // Create movement
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            type: MovementType.GOODS_RECEIPT,
            quantity: row.quantity,
            reference: receiptNumber,
            note: `Nhập từ file: ${row.note ?? ''}`,
            createdBy: userId,
          },
        });
      }

      return newReceipt;
    });

    // Publish event
    await this.eventBus.publish('stock.changed' as any, {
      warehouseId,
      reference: receiptNumber,
    });

    return receipt;
  }

  /**
   * Bulk adjust stock from import
   */
  async bulkAdjustStock(rows: StockAdjustRow[], userId: string) {
    const results = {
      adjusted: 0,
      errors: [] as string[],
    };

    for (const row of rows) {
      try {
        const product = await this.prisma.product.findFirst({
          where: {
            OR: [
              { productCode: row.productCode },
              { sku: row.productCode },
            ],
          },
        });

        if (!product) {
          results.errors.push(`Không tìm thấy sản phẩm: ${row.productCode}`);
          continue;
        }

        const inventory = await this.prisma.inventory.findFirst({
          where: { productId: product.id },
        });

        if (!inventory) {
          results.errors.push(`Không có inventory cho: ${row.productCode}`);
          continue;
        }

        const oldQty = inventory.quantity;
        const diff = row.newQuantity - oldQty;

        await this.prisma.$transaction([
          this.prisma.inventory.update({
            where: { id: inventory.id },
            data: { quantity: row.newQuantity },
          }),
          this.prisma.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              productId: product.id,
              type: MovementType.STOCK_SET_MANUAL,
              quantity: diff,
              reference: `BULK-${Date.now()}`,
              note: row.reason ?? `Điều chỉnh từ import: ${oldQty} → ${row.newQuantity}`,
              createdBy: userId,
            },
          }),
        ]);

        results.adjusted++;

        // Publish event
        await this.eventBus.publish('stock.changed' as any, {
          inventoryId: inventory.id,
          productId: product.id,
          quantity: row.newQuantity,
          delta: diff,
          reference: `BULK-${Date.now()}`,
        });
      } catch (err) {
        results.errors.push(`${row.productCode}: ${(err as Error).message}`);
      }
    }

    return results;
  }

  /**
   * Generate stock template
   */
  async getStockTemplate() {
    return [
      {
        productCode: 'VD: SP001',
        newQuantity: 'VD: 100',
        reason: 'VD: Điều chỉnh tồn kho',
      },
    ];
  }

  /**
   * Generate products template
   */
  async getProductsTemplate() {
    return [
      {
        sku: 'VD: SKU001',
        productCode: 'VD: PC001',
        name: 'VD: Tên sản phẩm',
        categoryName: 'VD: Tên danh mục',
        basePrice: 'VD: 100000',
        quantity: 'VD: 50',
        description: 'VD: Mô tả sản phẩm',
        weight: 'VD: 100',
        supplierCode: 'VD: SUP001',
      },
    ];
  }

  private async getDefaultWarehouseId(): Promise<string> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
    return warehouse?.id ?? '';
  }
}

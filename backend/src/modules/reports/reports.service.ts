import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MovementType } from '@prisma/client';

export interface InventoryReport {
  totalProducts: number;
  totalVariants: number;
  totalQuantity: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  topProducts: Array<{
    productId: string;
    name: string;
    quantity: number;
    value: number;
  }>;
}

export interface MovementReport {
  date: string;
  received: number;
  shipped: number;
  adjusted: number;
}

export interface SalesReport {
  date: string;
  ordersCount: number;
  itemsCount: number;
  totalValue: number;
  avgOrderValue: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Báo cáo tổng quan kho
   */
  async getInventorySummary() {
    const [
      totalProducts,
      totalVariants,
      inventoryStats,
      lowStockCount,
      outOfStockCount,
    ] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.productVariant.count(),
      this.prisma.inventory.aggregate({
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.inventory.count({
        where: {
          quantity: { gt: 0 },
          lowStockThreshold: { gt: 0 },
        },
      }),
      this.prisma.inventory.count({
        where: { quantity: 0 },
      }),
    ]);

    // Count low stock (quantity <= threshold)
    const lowStock = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: { select: { name: true, basePrice: true } } },
    });
    const lowStockActual = lowStock.filter(
      (i) => i.quantity <= i.lowStockThreshold
    ).length;

    // Top products by quantity
    const topProducts = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 }, product: { deletedAt: null } },
      orderBy: { quantity: 'desc' },
      take: 10,
      include: { product: { select: { name: true, basePrice: true } } },
    });

    return {
      totalProducts,
      totalVariants,
      totalQuantity: inventoryStats._sum.quantity ?? 0,
      inventoryCount: inventoryStats._count,
      lowStockCount: lowStockActual,
      outOfStockCount,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.product?.name,
        quantity: p.quantity,
        value: p.quantity * Number(p.product?.basePrice ?? 0),
      })),
    };
  }

  /**
   * Báo cáo biến động tồn kho theo ngày
   */
  async getMovementReport(params: {
    fromDate: string;
    toDate: string;
    groupBy?: 'day' | 'week' | 'month';
  }) {
    const { fromDate, toDate, groupBy = 'day' } = params;
    const start = new Date(fromDate);
    const end = new Date(toDate);

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const grouped = new Map<string, { received: number; shipped: number; adjusted: number }>();

    for (const m of movements) {
      const date = new Date(m.createdAt);
      let key: string;

      if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'week') {
        const week = Math.ceil(date.getDate() / 7);
        key = `${date.getFullYear()}-W${week}`;
      } else {
        key = date.toISOString().split('T')[0];
      }

      const existing = grouped.get(key) ?? { received: 0, shipped: 0, adjusted: 0 };

      if (m.quantity > 0) {
        if (m.type === 'GOODS_RECEIPT' || m.type === 'STOCK_INITIALIZED' || m.type === 'RETURN') {
          existing.received += m.quantity;
        } else if (m.type === 'STOCK_ADJUSTED_MANUAL' || m.type === 'STOCKTAKE_ADJUST') {
          existing.adjusted += m.quantity;
        }
      } else {
        existing.shipped += Math.abs(m.quantity);
      }

      grouped.set(key, existing);
    }

    return Array.from(grouped.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  /**
   * Báo cáo đơn hàng theo ngày
   */
  async getOrdersReport(params: {
    fromDate: string;
    toDate: string;
    source?: 'WEB' | 'WMS' | 'ADMIN_WEB';
  }) {
    const { fromDate, toDate, source } = params;
    const start = new Date(fromDate);
    const end = new Date(toDate);

    const where: any = {
      createdAt: { gte: start, lte: end },
    };
    if (source) {
      where.source = source;
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const grouped = new Map<string, { ordersCount: number; itemsCount: number; totalValue: number }>();

    for (const order of orders) {
      const date = new Date(order.createdAt).toISOString().split('T')[0];
      const existing = grouped.get(date) ?? { ordersCount: 0, itemsCount: 0, totalValue: 0 };

      existing.ordersCount++;
      existing.itemsCount += order.items.length;
      existing.totalValue += Number(order.total);

      grouped.set(date, existing);
    }

    return Array.from(grouped.entries()).map(([date, data]) => ({
      date,
      ...data,
      avgOrderValue: data.ordersCount > 0 ? data.totalValue / data.ordersCount : 0,
    }));
  }

  /**
   * Báo cáo top sản phẩm bán chạy
   */
  async getTopSellingProducts(params: {
    fromDate: string;
    toDate: string;
    limit?: number;
  }) {
    const { fromDate, toDate, limit = 20 } = params;
    const start = new Date(fromDate);
    const end = new Date(toDate);

    // Get order items in date range (use snapshot fields - no direct product relation)
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: start, lte: end },
          status: { in: ['COMPLETED', 'DELIVERED'] },
        },
      },
    });

    // Group by product
    const productStats = new Map<string, { productId: string; name: string; productCode: string; quantity: number; revenue: number }>();

    for (const item of orderItems) {
      const existing = productStats.get(item.productId) ?? {
        productId: item.productId,
        name: item.productName,
        productCode: item.productCode,
        quantity: 0,
        revenue: 0,
      };

      existing.quantity += item.quantity;
      existing.revenue += Number(item.totalPrice);

      productStats.set(item.productId, existing);
    }

    return Array.from(productStats.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  /**
   * Báo cáo hàng tồn kho
   */
  async getInventoryReport(params: {
    categoryId?: string;
    lowStockOnly?: boolean;
    outOfStockOnly?: boolean;
    sortBy?: 'quantity' | 'value' | 'name';
    sortDir?: 'asc' | 'desc';
  }) {
    const { categoryId, lowStockOnly, outOfStockOnly, sortBy = 'quantity', sortDir = 'asc' } = params;

    const where: any = { product: { deletedAt: null } };
    if (categoryId) where.product = { ...where.product, categoryId };
    if (lowStockOnly) where.lowStockThreshold = { gt: 0 };

    let items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: { name: true, productCode: true, basePrice: true, category: { select: { name: true } } },
        },
      },
    });

    // Filter out of stock
    if (outOfStockOnly) {
      items = items.filter((i) => i.quantity === 0);
    }

    // Filter low stock
    if (lowStockOnly) {
      items = items.filter((i) => i.quantity > 0 && i.quantity <= i.lowStockThreshold);
    }

    // Add computed fields
    const withValues = items.map((i) => ({
      inventoryId: i.id,
      productId: i.productId,
      name: i.product?.name,
      productCode: i.product?.productCode,
      category: i.product?.category?.name,
      quantity: i.quantity,
      lowStockThreshold: i.lowStockThreshold,
      isLowStock: i.quantity > 0 && i.quantity <= i.lowStockThreshold,
      isOutOfStock: i.quantity === 0,
      unitPrice: Number(i.product?.basePrice ?? 0),
      value: i.quantity * Number(i.product?.basePrice ?? 0),
    }));

    // Sort
    withValues.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'quantity') cmp = a.quantity - b.quantity;
      else if (sortBy === 'value') cmp = a.value - b.value;
      else if (sortBy === 'name') cmp = (a.name ?? '').localeCompare(b.name ?? '');
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return withValues;
  }

  /**
   * Báo cáo stocktake history
   */
  async getStocktakeReport(params: {
    fromDate?: string;
    toDate?: string;
  }) {
    const { fromDate, toDate } = params;
    const where: any = { status: 'COMPLETED' };

    if (fromDate || toDate) {
      where.completedAt = {};
      if (fromDate) where.completedAt.gte = new Date(fromDate);
      if (toDate) where.completedAt.lte = new Date(toDate);
    }

    const stocktakes = await this.prisma.stocktake.findMany({
      where,
      include: {
        createdBy: { select: { name: true, email: true } },
        items: true,
      },
      orderBy: { completedAt: 'desc' },
    });

    return stocktakes.map((st) => ({
      stocktakeNumber: st.stocktakeNumber,
      name: st.name,
      completedAt: st.completedAt,
      createdBy: st.createdBy?.name,
      itemCount: st.items.length,
      adjustmentCount: st.adjustmentCount,
      totalDifference: st.totalDifference,
    }));
  }
}

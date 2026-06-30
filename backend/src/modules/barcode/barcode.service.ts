import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface BarcodeResult {
  productId?: string;
  variantId?: string;
  productCode: string;
  sku: string;
  name: string;
  type: 'product' | 'variant';
  quantity?: number;
  available?: number;
}

@Injectable()
export class BarcodeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tra cứu barcode - hỗ trợ nhiều định dạng:
   * - Mã sản phẩm (productCode)
   * - SKU
   * - Supplier code
   * - UPC/EAN barcode
   */
  async lookup(barcode: string): Promise<BarcodeResult> {
    if (!barcode || barcode.trim().length === 0) {
      throw new BadRequestException('Barcode không được để trống');
    }

    const code = barcode.trim();

    // 1. Thử tìm variant trước (ưu tiên)
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        OR: [
          { productCode: code },
          { sku: code },
        ],
      },
      include: {
        product: { select: { id: true, name: true, supplierCode: true } },
        inventory: true,
      },
    });

    if (variant) {
      return {
        variantId: variant.id,
        productId: variant.productId,
        productCode: variant.productCode ?? '',
        sku: variant.sku,
        name: `${variant.product.name} - ${variant.name}`,
        type: 'variant',
        quantity: variant.inventory?.quantity ?? 0,
        available: (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQty ?? 0),
      };
    }

    // 2. Tìm product
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { productCode: code },
          { sku: code },
          { supplierCode: code },
        ],
        deletedAt: null,
      },
      include: { inventory: true },
    });

    if (product) {
      return {
        productId: product.id,
        productCode: product.productCode,
        sku: product.sku,
        name: product.name,
        type: 'product',
        quantity: product.inventory?.quantity ?? 0,
        available: (product.inventory?.quantity ?? 0) - (product.inventory?.reservedQty ?? 0),
      };
    }

    throw new NotFoundException(`Không tìm thấy sản phẩm với mã "${code}"`);
  }

  /**
   * Batch lookup - tra cứu nhiều barcodes cùng lúc
   */
  async batchLookup(barcodes: string[]): Promise<BarcodeResult[]> {
    const results: BarcodeResult[] = [];

    for (const barcode of barcodes) {
      try {
        const result = await this.lookup(barcode);
        results.push(result);
      } catch {
        // Skip invalid barcodes in batch
      }
    }

    return results;
  }

  /**
   * Generate barcode string từ product/variant info
   * Không tạo barcode thực sự, chỉ format chuỗi
   */
  generateBarcodeString(product: {
    productCode: string;
    sku: string;
    variantCode?: string;
  }): string {
    // Sử dụng SKU hoặc productCode làm barcode
    return product.variantCode || product.productCode || product.sku;
  }

  /**
   * Validate barcode format
   */
  validateBarcode(barcode: string): { valid: boolean; type?: string; message?: string } {
    if (!barcode) {
      return { valid: false, message: 'Barcode trống' };
    }

    const code = barcode.trim();

    // UPC-A: 12 digits
    if (/^\d{12}$/.test(code)) {
      return { valid: true, type: 'UPC-A' };
    }

    // EAN-13: 13 digits
    if (/^\d{13}$/.test(code)) {
      return { valid: true, type: 'EAN-13' };
    }

    // EAN-8: 8 digits
    if (/^\d{8}$/.test(code)) {
      return { valid: true, type: 'EAN-8' };
    }

    // Code 128: alphanumeric
    if (/^[A-Za-z0-9\-\.]+$/.test(code) && code.length <= 48) {
      return { valid: true, type: 'CODE128' };
    }

    // Internal code: letters and numbers
    if (/^[A-Z0-9\-_]+$/i.test(code)) {
      return { valid: true, type: 'INTERNAL' };
    }

    return { valid: false, message: 'Định dạng barcode không hợp lệ' };
  }

  /**
   * Lấy danh sách products/variants chưa có barcode
   */
  async getProductsWithoutBarcode() {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { supplierCode: null },
          { supplierCode: '' },
        ],
      },
      select: {
        id: true,
        productCode: true,
        sku: true,
        name: true,
      },
      take: 100,
    });

    return products;
  }

  /**
   * Update supplier code (barcode) cho product
   */
  async updateSupplierCode(productId: string, supplierCode: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    // Check if code already used
    const existing = await this.prisma.product.findFirst({
      where: {
        supplierCode,
        NOT: { id: productId },
      },
    });

    if (existing) {
      throw new BadRequestException(`Mã "${supplierCode}" đã được sử dụng bởi sản phẩm khác`);
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { supplierCode },
    });
  }

  /**
   * Search products by partial barcode
   */
  async searchByBarcode(query: string) {
    if (!query || query.length < 2) {
      return [];
    }

    const q = query.trim();

    const results = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { productCode: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { supplierCode: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        inventory: true,
        variants: {
          include: { inventory: true },
        },
      },
      take: 20,
    });

    return results.map((p) => ({
      productId: p.id,
      productCode: p.productCode,
      sku: p.sku,
      supplierCode: p.supplierCode,
      name: p.name,
      type: 'product',
      quantity: p.inventory?.quantity ?? 0,
      variants: p.variants.map((v) => ({
        variantId: v.id,
        productCode: v.productCode,
        sku: v.sku,
        name: v.name,
        attributes: v.attributes,
        quantity: v.inventory?.quantity ?? 0,
      })),
    }));
  }
}

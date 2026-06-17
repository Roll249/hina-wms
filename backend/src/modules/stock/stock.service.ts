import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  /**
   * Tra cứu tồn kho tổng quan (kèm reserved qty).
   * Lấy trực tiếp từ Inventory model của hina-e-comm.
   *
   * Filter mới:
   * - isClassified=true  → chỉ sản phẩm đã phân loại (tab "Đã phân loại")
   * - isClassified=false → chỉ sản phẩm chưa phân loại (tab "Chưa phân loại")
   * - categoryId         → lọc theo category cụ thể
   */
  async listStock(params: {
    search?: string;
    warehouseId?: string;
    lowStockOnly?: boolean;
    isClassified?: boolean;     // NEW
    categoryId?: string;        // NEW
    page?: number;
    pageSize?: number;
    sortBy?: 'quantity' | 'name' | 'updatedAt';
    sortDir?: 'asc' | 'desc';
  }) {
    const {
      search,
      lowStockOnly,
      isClassified,
      categoryId,
      page = 1,
      pageSize = 50,
      sortBy = 'updatedAt',
      sortDir = 'desc',
    } = params;
    const skip = (page - 1) * pageSize;

    // Base where: chỉ lấy product chưa xóa
    const where: any = { product: { deletedAt: null } };

    // Filter theo trạng thái phân loại (cho 2 tab)
    if (isClassified !== undefined) {
      where.product.isClassified = isClassified;
    }

    // Filter theo category cụ thể
    if (categoryId) {
      where.product.categoryId = categoryId;
    }

    // Search theo productCode / name / sku
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

    // Order by
    let orderBy: any;
    if (sortBy === 'name') {
      orderBy = { product: { name: sortDir } };
    } else if (sortBy === 'quantity') {
      orderBy = { quantity: sortDir };
    } else {
      orderBy = { updatedAt: sortDir };
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
              isClassified: true,
              categoryId: true,
              category: { select: { id: true, name: true, slug: true } },
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
        orderBy,
      }),
      this.prisma.inventory.count({ where }),
    ]);

    // Lọc low stock sau khi fetch
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
        isClassified: it.product?.isClassified ?? false,
        categoryId: it.product?.categoryId,
        categoryName: it.product?.category?.name,
        categorySlug: it.product?.category?.slug,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Lấy danh sách categories để filter trên UI.
   * Kèm count sản phẩm đã phân loại vào mỗi category.
   */
  async listCategories() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, slug: true,
        _count: {
          select: { products: { where: { deletedAt: null, isClassified: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      productCount: c._count.products,
    }));
  }

  /**
   * Lấy counts cho 2 tab "Chưa phân loại" / "Đã phân loại".
   */
  async getClassificationCounts() {
    const [unclassified, classified] = await Promise.all([
      this.prisma.product.count({
        where: { deletedAt: null, isClassified: false },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, isClassified: true },
      }),
    ]);
    return { unclassified, classified, total: unclassified + classified };
  }

  /**
   * Phân loại sản phẩm (gán vào category mới + flag isClassified).
   * Dùng để admin kéo sản phẩm từ "Chưa phân loại" sang category cụ thể.
   *
   * Nếu gán vào đúng category mặc định (Import Lotussouvenir) thì coi như
   * reset về chưa phân loại.
   */
  async classifyProduct(params: {
    productId: string;
    categoryId: string;
    actorUserId: string;
    actorEmail: string;
    actorRole: string;
    ipAddress?: string;
  }) {
    const { productId, categoryId, actorUserId, actorEmail, actorRole, ipAddress } = params;

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

    const newCategory = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!newCategory) throw new NotFoundException('Category không tồn tại');

    // Nếu gán vào category mặc định "Import Lotussouvenir" → set isClassified=false
    const isDefaultCategory = newCategory.name.toLowerCase().includes('import');

    const oldCategoryId = product.categoryId;
    const oldIsClassified = product.isClassified;

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        categoryId,
        isClassified: !isDefaultCategory,
      },
    });

    // Ghi AuditLog
    await this.prisma.auditLog.create({
      data: {
        entityType: 'Product',
        entityId: productId,
        action: 'UPDATE',
        changes: {
          categoryId: [oldCategoryId, categoryId],
          isClassified: [oldIsClassified, !isDefaultCategory],
          note: isDefaultCategory
            ? 'Reset về chưa phân loại (category mặc định)'
            : 'Phân loại sản phẩm vào kho',
        },
        userId: actorUserId,
        userEmail: actorEmail,
        userRole: actorRole,
        ipAddress,
      },
    });

    return {
      productId: updated.id,
      categoryId: updated.categoryId,
      isClassified: updated.isClassified,
      isDefaultCategory,
    };
  }

  /**
   * Sửa thông tin sản phẩm (tên, mô tả, attributes, giá, weight, dimensions, taxRate, supplierCode, ...).
   * KHÔNG cho sửa: id, productCode, sku (vì ảnh hưởng đến đơn hàng đang xử lý).
   * (Tuy nhiên theo yêu cầu user, cho phép sửa cả productCode/sku - có confirm ở frontend)
   *
   * Ghi AuditLog với changes JSON (oldValue → newValue cho mỗi field thay đổi).
   */
  async editProduct(params: {
    productId: string;
    patch: {
      name?: string;
      productCode?: string;
      sku?: string;
      description?: string;
      shortDesc?: string;
      basePrice?: number;
      weight?: number;
      dimensions?: Record<string, number>;
      attributes?: Record<string, any>;
      taxRate?: number;
      supplierCode?: string;
      metaTitle?: string;
      metaDesc?: string;
      showPriceToGuest?: boolean;
      showPriceToRetail?: boolean;
      showPriceToWholesale?: boolean;
    };
    actorUserId: string;
    actorEmail: string;
    actorRole: string;
    ipAddress?: string;
  }) {
    const { productId, patch, actorUserId, actorEmail, actorRole, ipAddress } = params;

    // Lấy sản phẩm hiện tại
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);

    // Kiểm tra quyền
    const allowedRoles = ['MANAGE', 'ADMIN'];
    if (!allowedRoles.includes(actorRole)) {
      throw new ForbiddenException(
        `Chỉ MANAGE/ADMIN được sửa sản phẩm. Role hiện tại: ${actorRole}`,
      );
    }

    // Nếu sửa productCode → check unique
    if (patch.productCode && patch.productCode !== product.productCode) {
      const exists = await this.prisma.product.findFirst({
        where: { productCode: patch.productCode, NOT: { id: productId } },
      });
      if (exists) {
        throw new ForbiddenException(`Mã sản phẩm "${patch.productCode}" đã tồn tại`);
      }
    }

    // Nếu sửa sku → check unique
    if (patch.sku && patch.sku !== product.sku) {
      const exists = await this.prisma.product.findFirst({
        where: { sku: patch.sku, NOT: { id: productId } },
      });
      if (exists) {
        throw new ForbiddenException(`SKU "${patch.sku}" đã tồn tại`);
      }
    }

    // So sánh từng field, build changes
    const changes: Record<string, [any, any]> = {};
    const fieldsToCheck = [
      'name', 'productCode', 'sku', 'description', 'shortDesc',
      'basePrice', 'weight', 'dimensions', 'attributes',
      'taxRate', 'supplierCode', 'metaTitle', 'metaDesc',
      'showPriceToGuest', 'showPriceToRetail', 'showPriceToWholesale',
    ] as const;

    for (const field of fieldsToCheck) {
      if (patch[field] === undefined) continue;
      const oldVal = (product as any)[field];
      const newVal = patch[field];

      // So sánh JSON (dimensions, attributes) bằng stringify
      const isJson = field === 'dimensions' || field === 'attributes';
      const same = isJson
        ? JSON.stringify(oldVal) === JSON.stringify(newVal)
        : oldVal === newVal || (oldVal == null && newVal == null);

      if (!same) {
        changes[field] = [oldVal, newVal];
      }
    }

    if (Object.keys(changes).length === 0) {
      return { productId, changed: 0, changes: {} };
    }

    // Update
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: patch,
    });

    // Ghi AuditLog
    await this.prisma.auditLog.create({
      data: {
        entityType: 'Product',
        entityId: productId,
        action: 'UPDATE',
        changes: changes as any,
        userId: actorUserId,
        userEmail: actorEmail,
        userRole: actorRole,
        ipAddress,
      },
    });

    return {
      productId: updated.id,
      changed: Object.keys(changes).length,
      changes,
    };
  }

  /**
   * Lấy lịch sử sửa sản phẩm (từ AuditLog).
   */
  async getProductHistory(productId: string, limit = 30) {
    return this.prisma.auditLog.findMany({
      where: {
        entityType: 'Product',
        entityId: productId,
        action: 'UPDATE',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        changes: true,
        userEmail: true,
        userRole: true,
        ipAddress: true,
        createdAt: true,
      },
    });
  }

  /**
   * Chi tiết 1 sản phẩm (cho edit form prefill).
   */
  async getProductDetail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        inventory: true,
        images: { take: 1, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    return product;
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

  // ============================================================
  // PRODUCT IMAGE MANAGEMENT
  // ============================================================

  /**
   * Tạo presigned URL để frontend upload ảnh trực tiếp lên MinIO.
   * Flow:
   *  1) FE: POST /stock/product/:id/images/presigned {contentType}
   *     → nhận { uploadUrl, publicUrl, key }
   *  2) FE: PUT uploadUrl (với file binary) → upload lên MinIO
   *  3) FE: POST /stock/product/:id/images { url: publicUrl, altText?, sortOrder?, isPrimary? }
   *     → INSERT row ProductImage
   */
  async generateProductImagePresignedUrl(productId: string, contentType: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    return this.upload.generatePresignedUrl(`products/${productId}`, contentType);
  }

  /**
   * Lấy tất cả ảnh của 1 sản phẩm (cả ảnh ở variant lẫn product).
   * Trả về kèm flag `level: "product" | "variant"` để UI biết.
   */
  async getProductImages(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true, url: true, altText: true, sortOrder: true, isPrimary: true,
            variantId: true, createdAt: true,
          },
        },
        variants: {
          select: {
            id: true, sku: true, name: true,
            images: {
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true, url: true, altText: true, sortOrder: true, isPrimary: true,
                variantId: true, createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    return product;
  }

  /**
   * Thêm 1 ProductImage row (sau khi FE đã upload file lên MinIO thành công).
   * - Nếu isPrimary=true → unset primary của ảnh khác cùng product.
   * - sortOrder: auto = max+1 nếu không truyền.
   */
  async addProductImage(
    productId: string,
    dto: { url: string; altText?: string; sortOrder?: number; isPrimary?: boolean },
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

    // Auto sortOrder
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const last = await this.prisma.productImage.findFirst({
        where: { productId, variantId: null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? -1) + 1;
    }

    // Nếu set primary → unset các ảnh primary khác
    if (dto.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, variantId: null, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.create({
      data: {
        id: crypto.randomUUID(),
        productId,
        variantId: null,
        url: dto.url,
        altText: dto.altText ?? null,
        sortOrder,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  /**
   * Cập nhật ảnh (altText, isPrimary, sortOrder).
   * Nếu isPrimary=true → unset primary các ảnh khác cùng product.
   */
  async updateProductImage(
    imageId: string,
    dto: { altText?: string; sortOrder?: number; isPrimary?: boolean },
  ) {
    const img = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Ảnh không tồn tại');

    if (dto.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: {
          productId: img.productId,
          variantId: img.variantId,
          isPrimary: true,
          id: { not: imageId },
        },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        altText: dto.altText ?? undefined,
        sortOrder: dto.sortOrder ?? undefined,
        isPrimary: dto.isPrimary ?? undefined,
      },
    });
  }

  /**
   * Xóa ảnh: DELETE row trong DB + xóa file trên MinIO (best effort).
   * Nếu là primary → tự set ảnh khác làm primary (sortOrder nhỏ nhất).
   */
  async deleteProductImage(imageId: string) {
    const img = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Ảnh không tồn tại');

    // Xóa row trước
    await this.prisma.productImage.delete({ where: { id: imageId } });

    // Best-effort xóa file MinIO (không throw nếu fail)
    if (img.url) {
      this.upload.deleteFile(img.url).catch(() => undefined);
    }

    // Nếu vừa xóa ảnh primary → set ảnh khác làm primary
    if (img.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId: img.productId, variantId: img.variantId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { ok: true, id: imageId };
  }
}

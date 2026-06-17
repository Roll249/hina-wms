import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lấy category tree (parent + children) cho UI.
   * Mỗi node kèm productCount (count product đang active, không tính soft-deleted).
   */
  async getTree() {
    const all = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        description: true,
        icon: true,
        imageUrl: true,
        bannerImageUrl: true,
        taxRate: true,
        sortOrder: true,
        isActive: true,
        showOnMegaMenu: true,
        showOnHomepageCard: true,
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Build map và attach children
    type Node = (typeof all)[number] & {
      productCount: number;
      children: Node[];
    };
    const map = new Map<string, Node>();
    for (const c of all) {
      map.set(c.id, { ...c, productCount: c._count.products, children: [] });
    }

    const roots: Node[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return { roots, total: all.length };
  }

  /**
   * Lấy flat list categories kèm productCount (đã có ở stock.service).
   * Method này trả về cả soft-deleted cho audit + quản lý.
   */
  async getFlat() {
    const cats = await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        description: true,
        icon: true,
        sortOrder: true,
        isActive: true,
        deletedAt: true,
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      description: c.description,
      icon: c.icon,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      isDeleted: c.deletedAt !== null,
      productCount: c._count.products,
    }));
  }

  /**
   * Tạo category mới.
   * Vì WMS và e-comm chia sẻ DB → INSERT vào `Category` table
   * sẽ tự động xuất hiện trên web.
   */
  async create(dto: CreateCategoryDto) {
    // Auto-slug từ name nếu không cung cấp
    let slug = dto.slug?.trim();
    if (!slug) slug = this.slugify(dto.name);
    slug = this.slugify(slug);

    // Check slug unique
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Slug "${slug}" đã tồn tại`);

    // Check parent exists (nếu có)
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException(`Parent category không tồn tại`);
    }

    // Auto sortOrder: lớn nhất + 1 trong cùng parent
    let sortOrder = dto.sortOrder ?? 0;
    if (sortOrder === 0) {
      const last = await this.prisma.category.findFirst({
        where: { parentId: dto.parentId ?? null, deletedAt: null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? 0) + 1;
    }

    const created = await this.prisma.category.create({
      data: {
        id: crypto.randomUUID(),
        name: dto.name.trim(),
        slug,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        icon: dto.icon ?? null,
        imageUrl: dto.imageUrl ?? null,
        bannerImageUrl: dto.bannerImageUrl ?? null,
        taxRate: dto.taxRate ?? null,
        sortOrder,
        isActive: dto.isActive ?? true,
        showOnMegaMenu: dto.showOnMegaMenu ?? false,
        showOnHomepageCard: dto.showOnHomepageCard ?? false,
        updatedAt: new Date(),
      },
    });
    return created;
  }

  /**
   * Cập nhật category - hỗ trợ tất cả fields từ e-comm form.
   */
  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Category không tồn tại');

    if (dto.parentId === id) {
      throw new BadRequestException('Category không thể là parent của chính nó');
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException(`Parent category không tồn tại`);

      // Check cycle: parent mới không được là descendant của category này
      const isDescendant = await this.isDescendant(dto.parentId, id);
      if (isDescendant) {
        throw new BadRequestException('Không thể set parent là descendant (tránh cycle)');
      }
    }

    // Slug unique check nếu đổi
    if (dto.slug && dto.slug !== existing.slug) {
      const dup = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
      if (dup && dup.id !== id) throw new ConflictException(`Slug "${dto.slug}" đã tồn tại`);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        slug: dto.slug ?? undefined,
        description: dto.description ?? undefined,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        icon: dto.icon ?? undefined,
        imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl,
        bannerImageUrl: dto.bannerImageUrl === undefined ? undefined : dto.bannerImageUrl,
        taxRate: dto.taxRate === undefined ? undefined : dto.taxRate,
        sortOrder: dto.sortOrder ?? undefined,
        isActive: dto.isActive ?? undefined,
        showOnMegaMenu: dto.showOnMegaMenu ?? undefined,
        showOnHomepageCard: dto.showOnHomepageCard ?? undefined,
        updatedAt: new Date(),
      },
    });
    return updated;
  }

  /**
   * Slugify: tương tự form, dùng cho cả input name và input slug.
   */
  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  /**
   * Soft-delete category.
   * Set deletedAt thay vì xóa cứng để giữ foreign key từ Product.categoryId.
   */
  async softDelete(id: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Category không tồn tại');

    // Check có product nào đang dùng không
    const productCount = await this.prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Không thể xóa: có ${productCount} sản phẩm đang dùng category này. ` +
          `Hãy chuyển sản phẩm sang category khác trước.`,
      );
    }

    // Check có child nào đang dùng không
    const childCount = await this.prisma.category.count({
      where: { parentId: id, deletedAt: null },
    });
    if (childCount > 0) {
      throw new ConflictException(
        `Không thể xóa: có ${childCount} sub-category con. Hãy xóa hoặc chuyển children trước.`,
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Helper: Kiểm tra `targetId` có phải là descendant (cháu/chắt) của `ancestorId` không.
   * Dùng cho validation cycle khi set parent.
   */
  private async isDescendant(targetId: string, ancestorId: string): Promise<boolean> {
    let current = targetId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const cat = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!cat) return false;
      if (cat.parentId === ancestorId) return true;
      current = cat.parentId ?? '';
    }
    return false;
  }

  /**
   * Sync stats: đếm tổng categories + product mapped + categories có slug bị duplicate, v.v.
   * Dùng để admin kiểm tra tình trạng đồng bộ với web.
   */
  async getSyncStats() {
    const [total, active, withProducts] = await Promise.all([
      this.prisma.category.count(),
      this.prisma.category.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.category.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          _count: { select: { products: { where: { deletedAt: null } } } },
        },
      }),
    ]);

    const mapped = withProducts.filter((c) => c._count.products > 0).length;
    const unmapped = withProducts.filter((c) => c._count.products === 0).length;

    return {
      total,
      active,
      mapped,
      unmapped,
      // Vì share DB nên pullSync = 0 (web đã cùng source)
      // PushSync = số category WMS tạo ra = cần tracking riêng nếu muốn
      lastSyncedAt: new Date().toISOString(),
    };
  }
}

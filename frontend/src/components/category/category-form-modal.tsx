"use client";

import { useEffect, useState, useRef } from "react";
import {
  X,
  FolderTree,
  Plus,
  Save,
  Image as ImageIcon,
  Upload,
  Loader2,
  AlertCircle,
  XCircle,
  Percent,
  Megaphone,
  Home as HomeIcon,
} from "lucide-react";
import {
  useCategoryTree,
  useCreateCategory,
  useUpdateCategory,
  type CategoryNode,
} from "@/hooks/use-category";
import { Card } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultParentId?: string;
  /** Khi truyền `category` thì form chuyển sang SỬA. Ngược lại là TẠO MỚI. */
  category?: CategoryNode | null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function flattenTree(
  nodes: CategoryNode[],
  depth = 0,
  excludeId?: string,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    if (n.slug === "import-lotussouvenir") continue;
    if (excludeId && n.id === excludeId) continue; // không cho parent là chính nó
    const prefix = depth > 0 ? "— ".repeat(depth) : "";
    out.push({ id: n.id, label: `${prefix}${n.name}` });
    if (n.children.length > 0) {
      out.push(...flattenTree(n.children, depth + 1, excludeId));
    }
  }
  return out;
}

/**
 * Upload 1 ảnh lên MinIO qua presigned URL, trả về publicUrl.
 * Tái sử dụng pattern từ product-image.
 */
function useUploadCategoryImage() {
  return useMutation({
    mutationFn: async ({ file, folder }: { file: File; folder: "categories" | "banners" }) => {
      const presign = await api.post(`/upload/presigned`, {
        contentType: file.type,
        folder: `categories/${folder}`,
      });
      const { uploadUrl, publicUrl } = presign.data as { uploadUrl: string; publicUrl: string };
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        throw new Error(`Upload MinIO fail: HTTP ${putRes.status}`);
      }
      return publicUrl;
    },
  });
}

export function CategoryFormModal({
  open,
  onClose,
  defaultParentId,
  category,
}: Props) {
  const isEdit = !!category;
  const { data: tree } = useCategoryTree();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const uploader = useUploadCategoryImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    slugTouched: false,
    parentId: "",
    description: "",
    icon: "",
    imageUrl: "",
    bannerImageUrl: "",
    taxRate: "",
    sortOrder: "",
    isActive: true,
    showOnMegaMenu: false,
    showOnHomepageCard: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (category) {
      setForm({
        name: category.name,
        slug: category.slug,
        slugTouched: true,
        parentId: category.parentId ?? "",
        description: category.description ?? "",
        icon: category.icon ?? "",
        imageUrl: category.imageUrl ?? "",
        bannerImageUrl: category.bannerImageUrl ?? "",
        taxRate: category.taxRate != null ? String(category.taxRate) : "",
        sortOrder: String(category.sortOrder ?? ""),
        isActive: category.isActive,
        showOnMegaMenu: category.showOnMegaMenu ?? false,
        showOnHomepageCard: category.showOnHomepageCard ?? false,
      });
    } else {
      setForm({
        name: "",
        slug: "",
        slugTouched: false,
        parentId: defaultParentId ?? "",
        description: "",
        icon: "",
        imageUrl: "",
        bannerImageUrl: "",
        taxRate: "",
        sortOrder: "",
        isActive: true,
        showOnMegaMenu: false,
        showOnHomepageCard: false,
      });
    }
    setError(null);
  }, [open, category?.id, defaultParentId]);

  useEffect(() => {
    if (!form.slugTouched && form.name) {
      setForm((f) => ({ ...f, slug: slugify(f.name) }));
    }
  }, [form.name, form.slugTouched]);

  const flatCategories = tree ? flattenTree(tree.roots, 0, category?.id) : [];

  const handleImageUpload = async (
    file: File,
    field: "imageUrl" | "bannerImageUrl",
  ) => {
    try {
      const folder = field === "imageUrl" ? "categories" : "banners";
      const url = await uploader.mutateAsync({ file, folder });
      setForm((f) => ({ ...f, [field]: url }));
      toast.success("Upload ảnh thành công");
    } catch (e: any) {
      toast.error(`Upload lỗi: ${e?.message ?? e}`);
    }
  };

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Tên category không được trống");
      return;
    }
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) {
      setError("Slug chỉ chứa chữ thường, số và dấu gạch ngang");
      return;
    }
    // TaxRate 0..1
    let taxRate: number | undefined;
    if (form.taxRate !== "") {
      const v = Number(form.taxRate);
      if (Number.isNaN(v) || v < 0 || v > 1) {
        setError("TaxRate phải trong khoảng 0..1 (vd: 0.21 = 21%)");
        return;
      }
      taxRate = v;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || undefined,
      parentId: form.parentId || null,
      icon: form.icon.trim() || undefined,
      imageUrl: form.imageUrl || null,
      bannerImageUrl: form.bannerImageUrl || null,
      taxRate,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
      isActive: form.isActive,
      showOnMegaMenu: form.showOnMegaMenu,
      showOnHomepageCard: form.showOnHomepageCard,
    };

    try {
      if (isEdit && category) {
        await update.mutateAsync({ id: category.id, patch: payload });
        toast.success(`Đã cập nhật category "${form.name}"`);
      } else {
        await create.mutateAsync(payload);
        toast.success(`Đã tạo category "${form.name}"`);
      }
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? "Lỗi";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
  };

  const submitting = create.isPending || update.isPending || uploader.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center">
              {isEdit ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isEdit ? `Sửa category` : "Tạo category mới"}
              </h2>
              {isEdit && category && (
                <p className="text-xs text-gray-500 font-mono">{category.slug}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            <strong>Đồng bộ với web:</strong> Mọi thay đổi ở đây tự động cập nhật
            trên web LotusSouvenir (cùng database).
          </div>

          {/* Tên + Slug */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên category <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Hrnky a lahve"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-gray-500 font-normal">
                  (URL: /{form.slug || "..."})
                </span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value, slugTouched: true })
                }
                placeholder="hrnky-lahve"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm font-mono"
              />
            </div>
          </div>

          {/* Category cha + Icon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FolderTree className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                Category cha
              </label>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm"
              >
                <option value="">— Root (cấp cao nhất) —</option>
                {flatCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Icon (emoji hoặc URL)
              </label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="🎁 hoặc https://..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm"
              />
            </div>
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Mô tả ngắn về category (tuỳ chọn)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm resize-none"
            />
          </div>

          {/* Ảnh đại diện */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <ImageIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Ảnh đại diện
            </label>
            <div className="flex items-center gap-2">
              {form.imageUrl ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border bg-gray-50 flex-shrink-0">
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => setForm({ ...form, imageUrl: "" })}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full"
                    type="button"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-6 h-6 text-gray-300" />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f, "imageUrl");
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploader.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {uploader.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {form.imageUrl ? "Đổi ảnh" : "Upload"}
              </button>
            </div>
          </div>

          {/* Banner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Megaphone className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Ảnh banner
            </label>
            <div className="flex items-center gap-2">
              {form.bannerImageUrl ? (
                <div className="relative w-32 h-16 rounded-lg overflow-hidden border bg-gray-50 flex-shrink-0">
                  <img
                    src={form.bannerImageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => setForm({ ...form, bannerImageUrl: "" })}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full"
                    type="button"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-5 h-5 text-gray-300" />
                </div>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f, "bannerImageUrl");
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploader.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {uploader.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {form.bannerImageUrl ? "Đổi banner" : "Upload banner"}
              </button>
            </div>
          </div>

          {/* TaxRate + sortOrder + Flags */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Percent className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                Thuế riêng
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                placeholder="vd: 0.21"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort order
              </label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                placeholder="Auto"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trạng thái
              </label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Hiển thị trên web</span>
              </label>
            </div>
          </div>

          {/* Storefront placement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.showOnMegaMenu}
                onChange={(e) =>
                  setForm({ ...form, showOnMegaMenu: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Hiển thị trên Mega Menu
                </div>
                <div className="text-xs text-gray-500">
                  Xuất hiện trong menu chính của web
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.showOnHomepageCard}
                onChange={(e) =>
                  setForm({ ...form, showOnHomepageCard: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  <HomeIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  Hiển thị trên trang chủ
                </div>
                <div className="text-xs text-gray-500">
                  Xuất hiện trong card trang chủ web
                </div>
              </div>
            </label>
          </div>

          {error && (
            <Card padding="sm" className="bg-red-50 border-red-200">
              <p className="text-sm text-red-700 flex items-start gap-1">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </p>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={submitting || !form.name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEdit ? "Lưu thay đổi" : "Tạo category"}
          </button>
        </div>
      </div>
    </div>
  );
}

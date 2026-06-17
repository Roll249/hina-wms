"use client";

import { useEffect, useState } from "react";
import { X, FolderTree, Plus } from "lucide-react";
import {
  useCategoryTree,
  useCreateCategory,
  type CategoryNode,
} from "@/hooks/use-category";
import { Card } from "@/components/ui/card";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultParentId?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function flattenTree(
  nodes: CategoryNode[],
  depth = 0,
): { id: string; label: string; hasChildren: boolean }[] {
  const out: { id: string; label: string; hasChildren: boolean }[] = [];
  for (const n of nodes) {
    if (n.slug === "import-lotussouvenir") continue; // bỏ category mặc định
    const prefix = depth > 0 ? "— ".repeat(depth) : "";
    out.push({
      id: n.id,
      label: `${prefix}${n.name}`,
      hasChildren: n.children.length > 0,
    });
    if (n.children.length > 0) {
      out.push(...flattenTree(n.children, depth + 1));
    }
  }
  return out;
}

export function CreateCategoryModal({ open, onClose, defaultParentId }: Props) {
  const { data: tree } = useCategoryTree();
  const create = useCreateCategory();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setParentId(defaultParentId ?? "");
      setDescription("");
      setSortOrder("");
      setIsActive(true);
      setError(null);
    }
  }, [open, defaultParentId]);

  // Auto-slug khi user gõ name (nếu chưa sửa slug)
  useEffect(() => {
    if (!slugTouched && name) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  const flatCategories = tree ? flattenTree(tree.roots) : [];

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Tên category không được trống");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError("Slug chỉ chứa chữ thường, số và dấu gạch ngang");
      return;
    }

    try {
      await create.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        parentId: parentId || undefined,
        description: description.trim() || undefined,
        sortOrder: sortOrder ? Number(sortOrder) : undefined,
        isActive,
      });
      onClose();
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ?? e?.message ?? "Tạo category thất bại";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary-100 text-primary-600 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Tạo category mới
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            <strong>Đồng bộ 2 chiều:</strong> Category tạo ở đây sẽ tự động xuất hiện
            trên web (cùng database). Sau khi tạo, có thể vào mục "Đã phân loại" để
            gán sản phẩm.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên category <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Dřevěné dekorace"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-gray-500 font-normal">
                (URL: /danh-mục/<b>{slug || "..."}</b>)
              </span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="drevene-dekorace"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm font-mono"
            />
            {!slugTouched && name && (
              <p className="text-xs text-gray-500 mt-1">
                Auto-generated từ tên
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FolderTree className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Category cha
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none text-sm"
            >
              <option value="">— Root (cấp cao nhất) —</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Để trống để tạo root category. Chọn cha để tạo sub-category.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Mô tả ngắn về category này (tuỳ chọn)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Thứ tự sort
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="Auto (max+1)"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trạng thái
              </label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  Hiển thị trên web
                </span>
              </label>
            </div>
          </div>

          {error && (
            <Card padding="sm" className="bg-red-50 border-red-200">
              <p className="text-sm text-red-700">⚠️ {error}</p>
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
            disabled={create.isPending || !name.trim() || !slug.trim()}
            className="px-4 py-2 rounded text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {create.isPending ? "Đang tạo..." : "Tạo category"}
          </button>
        </div>
      </div>
    </div>
  );
}

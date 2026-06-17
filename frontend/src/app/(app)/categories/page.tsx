"use client";

import { useState } from "react";
import {
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  TreePine,
  RefreshCw,
  Globe,
  Package,
} from "lucide-react";
import {
  useCategoryTree,
  useCategorySyncStats,
  useDeleteCategory,
  type CategoryNode,
} from "@/hooks/use-category";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryFormModal } from "@/components/category/category-form-modal";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

function CategoryTreeNode({
  node,
  depth = 0,
  onAddChild,
  onDelete,
  onEdit,
  expanded,
  toggle,
}: {
  node: CategoryNode;
  depth?: number;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
  onEdit: (node: CategoryNode) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isRoot = depth === 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 group",
          isRoot && "bg-gray-50/50",
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => toggle(node.id)}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            <ChevronRight
              className={cn(
                "w-4 h-4 text-gray-500 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}

        <TreePine
          className={cn(
            "w-4 h-4",
            isRoot ? "text-primary-600" : "text-gray-400",
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm truncate",
                isRoot ? "font-semibold" : "font-normal",
                node.isActive ? "text-gray-900" : "text-gray-400 line-through",
              )}
            >
              {node.name}
            </span>
            <code className="text-[10px] text-gray-400 font-mono">
              /{node.slug}
            </code>
            {!node.isActive && (
              <Badge variant="gray">
                Ẩn
              </Badge>
            )}
          </div>
        </div>

        <Badge variant={node.productCount > 0 ? "success" : "gray"}>
          <Package className="w-3 h-3 mr-0.5" />
          {node.productCount}
        </Badge>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(node)}
            className="p-1 rounded hover:bg-blue-100 text-blue-600"
            title="Sửa"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAddChild(node.id)}
            className="p-1 rounded hover:bg-blue-100 text-blue-600"
            title="Thêm sub-category"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(node.id, node.name)}
            className="p-1 rounded hover:bg-red-100 text-red-600"
            title="Xóa"
            disabled={node.productCount > 0 || node.children.length > 0}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onEdit={onEdit}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const { data: tree, isLoading, refetch } = useCategoryTree();
  const { data: stats } = useCategorySyncStats();
  const del = useDeleteCategory();
  const qc = useQueryClient();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [defaultParent, setDefaultParent] = useState<string | undefined>();
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const handleAddChild = (parentId: string) => {
    setEditingCategory(null);
    setDefaultParent(parentId);
    setShowCreate(true);
  };

  const handleEdit = (node: CategoryNode) => {
    setShowCreate(false);
    setEditingCategory(node);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmDelete({ id, name });
    setDeleteError(null);
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    try {
      await del.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(
        e?.response?.data?.message ?? e?.message ?? "Xóa thất bại",
      );
    }
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Danh mục</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Đồng bộ 2 chiều với web LotusSouvenir
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["category-tree"] });
              qc.invalidateQueries({ queryKey: ["category-sync-stats"] });
            }}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title="Reload"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setDefaultParent(undefined);
              setShowCreate(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Tạo mới
          </button>
        </div>
      </div>

      {/* Sync stats banner */}
      {stats && (
        <Card padding="sm" className="bg-blue-50/50 border-blue-200">
          <div className="flex items-start gap-2">
            <Globe className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-blue-900 font-medium">
                Đồng bộ với web: tự động
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                WMS và web chia sẻ database. Mọi thay đổi (tạo/sửa/xóa) ở WMS sẽ
                tự động cập nhật trên web trong vài giây.
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span>
                  📦 <b>{stats.total}</b> tổng
                </span>
                <span>
                  ✅ <b>{stats.active}</b> active
                </span>
                <span>
                  🔗 <b>{stats.mapped}</b> có SP
                </span>
                <span className="text-gray-500">
                  ⏰ {new Date(stats.lastSyncedAt).toLocaleTimeString("vi-VN")}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tree */}
      <Card padding="sm">
        {isLoading ? (
          <p className="text-center text-gray-500 py-8">Đang tải...</p>
        ) : !tree || tree.roots.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Chưa có category nào</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {tree.roots.map((root) => (
              <div key={root.id} className="py-1">
                <CategoryTreeNode
                  node={root}
                  onAddChild={handleAddChild}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  expanded={expanded}
                  toggle={toggle}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create / Edit modal */}
      <CategoryFormModal
        open={showCreate || editingCategory !== null}
        onClose={() => {
          setShowCreate(false);
          setEditingCategory(null);
        }}
        defaultParentId={defaultParent}
        category={editingCategory}
      />

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Xác nhận xóa
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Xóa category <b>"{confirmDelete.name}"</b>? (Soft-delete, có thể
              khôi phục)
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 mb-3">⚠️ {deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                onClick={confirmDeleteAction}
                disabled={del.isPending}
                className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {del.isPending ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

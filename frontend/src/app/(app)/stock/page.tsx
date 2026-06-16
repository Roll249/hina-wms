"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, AlertTriangle, Edit3, FolderTree, Plus, Settings2 } from "lucide-react";
import {
  useStock,
  useClassificationCounts,
  useCategories,
} from "@/hooks/use-stock";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatNumber, cn } from "@/lib/utils";
import { useSse } from "@/hooks/use-sse";
import { useQueryClient } from "@tanstack/react-query";
import { EditProductDrawer } from "@/components/stock/edit-product-drawer";

type Tab = "unclassified" | "classified";

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [tab, setTab] = useState<Tab>("unclassified");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const qc = useQueryClient();

  // Auto-refetch khi có stock event
  useSse("/sse/stream", (msg) => {
    if (msg.type === "stock.changed") {
      qc.invalidateQueries({ queryKey: ["stock"] });
    }
  });

  const { data: counts, error: countsError } = useClassificationCounts();
  const { data: categories = [], error: categoriesError } = useCategories();

  const isClassified = tab === "classified";
  const { data, isLoading, error: stockError } = useStock({
    search: search || undefined,
    lowStockOnly: lowOnly,
    isClassified,
    categoryId: categoryFilter || undefined,
    pageSize: 100,
  });

  // Hiển thị lỗi rõ ràng nếu API bị 403
  const anyError = countsError || categoriesError || stockError;
  const is403 = (anyError as any)?.response?.status === 403 || (anyError as any)?.status === 403;

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tồn kho</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/categories"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
            title="Quản lý categories (đồng bộ với web)"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quản lý DM</span>
          </Link>
          {data && (
            <Badge variant="default">
              {data.items.length} / {data.total}
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs phân loại */}
      <div className="flex border-b bg-white rounded-t-lg overflow-hidden">
        <button
          onClick={() => {
            setTab("unclassified");
            setCategoryFilter("");
          }}
          className={cn(
            "flex-1 px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2",
            tab === "unclassified"
              ? "border-orange-500 text-orange-700 bg-orange-50/50"
              : "border-transparent text-gray-600 hover:text-gray-900",
          )}
        >
          ⚠️ Chưa phân loại
          {counts && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                tab === "unclassified"
                  ? "bg-orange-200 text-orange-800"
                  : "bg-gray-200 text-gray-700",
              )}
            >
              {counts.unclassified}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("classified")}
          className={cn(
            "flex-1 px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2",
            tab === "classified"
              ? "border-green-500 text-green-700 bg-green-50/50"
              : "border-transparent text-gray-600 hover:text-gray-900",
          )}
        >
          ✅ Đã phân loại
          {counts && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                tab === "classified"
                  ? "bg-green-200 text-green-800"
                  : "bg-gray-200 text-gray-700",
              )}
            >
              {counts.classified}
            </span>
          )}
        </button>
      </div>

      {/* Search + filter */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Tìm theo tên, mã, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <button
            onClick={() => setLowOnly(!lowOnly)}
            className={cn(
              "px-3 rounded-lg border text-sm font-medium flex items-center gap-1",
              lowOnly
                ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                : "bg-white border-gray-300 text-gray-600",
            )}
          >
            <AlertTriangle className="h-4 w-4" /> Tồn thấp
          </button>
        </div>

        {/* Category filter - chỉ hiện khi tab "Đã phân loại" */}
        {tab === "classified" && categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <FolderTree className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <button
              onClick={() => setCategoryFilter("")}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                !categoryFilter
                  ? "bg-primary-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700",
              )}
            >
              Tất cả
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                  categoryFilter === c.id
                    ? "bg-primary-600 text-white"
                    : "bg-white border border-gray-300 text-gray-700",
                )}
              >
                {c.name} ({c.productCount})
              </button>
            ))}
            <Link
              href="/categories"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-green-50 border border-green-300 text-green-700 hover:bg-green-100"
              title="Tạo category mới (đồng bộ với web)"
            >
              <Plus className="w-3 h-3" />
              Tạo mới
            </Link>
          </div>
        )}
      </div>

      {/* List */}
      {is403 ? (
        <Card padding="lg" className="text-center">
          <p className="text-red-600 font-semibold mb-2">⚠️ 403 Forbidden</p>
          <p className="text-sm text-gray-600 mb-3">
            Token đăng nhập không hợp lệ hoặc role không đủ quyền.
            Vui lòng đăng nhập lại.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("wms-auth-storage");
              window.location.href = "/login";
            }}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            Đăng nhập lại
          </button>
        </Card>
      ) : isLoading ? (
        <p className="text-center text-gray-500 py-8">Đang tải...</p>
      ) : data?.items.length === 0 ? (
        <Card padding="lg" className="text-center text-gray-500">
          {tab === "unclassified"
            ? "🎉 Tất cả sản phẩm đã được phân loại"
            : search || categoryFilter
              ? "Không tìm thấy sản phẩm nào"
              : "Chưa có sản phẩm đã phân loại"}
        </Card>
      ) : (
        <div className="space-y-2">
          {data?.items.map((item) => (
            <Card
              key={item.inventoryId}
              padding="sm"
              className="hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-gray-500">
                    {item.productCode}
                    {item.categoryName && (
                      <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                        {item.categoryName}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">
                    {item.name}
                  </p>
                  {item.variantName && item.variantName !== item.name && (
                    <p className="text-xs text-gray-500">{item.variantName}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>Đặt: {item.reservedQty}</span>
                    {item.isLowStock && (
                      <Badge variant="warning" className="text-[10px]">
                        Tồn thấp
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p
                    className={cn(
                      "text-lg font-bold",
                      item.available <= 0
                        ? "text-red-600"
                        : item.available <= item.lowStockThreshold
                          ? "text-yellow-600"
                          : "text-green-600",
                    )}
                  >
                    {formatNumber(item.available)}
                  </p>
                  <p className="text-[10px] text-gray-400">có thể bán</p>
                  <button
                    onClick={() => item.productId && setEditProductId(item.productId)}
                    className="mt-1 px-2 py-1 rounded text-[10px] font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 flex items-center gap-1"
                  >
                    <Edit3 className="h-3 w-3" />
                    Sửa
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && data.total > data.items.length && (
        <p className="text-xs text-center text-gray-400">
          Hiển thị {data.items.length} / {data.total} sản phẩm
        </p>
      )}

      <EditProductDrawer
        productId={editProductId}
        open={!!editProductId}
        onClose={() => setEditProductId(null)}
      />
    </div>
  );
}

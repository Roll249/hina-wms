"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Plus,
  X,
  Search,
  Package,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatNumber, formatDate } from "@/lib/utils";

type StocktakeItem = {
  id: string;
  productId: string;
  variantId?: string;
  expectedQty: number;
  countedQty: number;
  note?: string;
  adjustmentType?: string;
  product: {
    name: string;
    productCode: string;
    sku: string;
    images: Array<{ url: string }>;
  };
  variant?: {
    name: string;
    productCode: string;
    sku: string;
  };
};

type Stocktake = {
  id: string;
  stocktakeNumber: string;
  name: string;
  note?: string;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  itemCount: number;
  adjustmentCount: number;
  totalDifference: number;
  createdAt: string;
  createdBy: { name?: string; email: string };
  items: StocktakeItem[];
};

export default function StocktakeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const stocktakeId = params.id as string;

  const [searchQuery, setSearchQuery] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Fetch stocktake details
  const { data: stocktake, isLoading } = useQuery<Stocktake>({
    queryKey: ["stocktake", stocktakeId],
    queryFn: async () => {
      const { data } = await api.get(`/stocktake/${stocktakeId}`);
      return data;
    },
  });

  // Add items mutation
  const addItemsMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const { data } = await api.post(`/stocktake/${stocktakeId}/items`, { items });
      return data;
    },
    onSuccess: () => {
      toast.success("Đã thêm sản phẩm");
      setShowAddProduct(false);
      setProductSearch("");
      setSearchResults([]);
      qc.invalidateQueries({ queryKey: ["stocktake", stocktakeId] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi thêm sản phẩm");
    },
  });

  // Update counted qty mutation
  const updateQtyMutation = useMutation({
    mutationFn: async ({ itemId, countedQty, note }: { itemId: string; countedQty: number; note?: string }) => {
      const { data } = await api.patch(`/stocktake/items/${itemId}`, { countedQty, note });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktake", stocktakeId] });
    },
  });

  // Apply stocktake mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/stocktake/${stocktakeId}/apply`);
      return data;
    },
    onSuccess: () => {
      toast.success("Đã áp dụng kiểm kê");
      qc.invalidateQueries({ queryKey: ["stocktake", stocktakeId] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi áp dụng");
    },
  });

  // Search products
  const searchProducts = async (query: string) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    try {
      const { data } = await api.get(`/admin/orders/search-products?q=${encodeURIComponent(query)}`);
      setSearchResults(data);
    } catch (err) {
      toast.error("Lỗi tìm sản phẩm");
    }
  };

  // Calculate summary
  const summary = stocktake?.items.reduce(
    (acc, item) => {
      const diff = item.countedQty - item.expectedQty;
      acc.totalItems++;
      if (diff !== 0) acc.adjustedItems++;
      acc.totalDiff += diff;
      if (diff > 0) acc.overItems++;
      if (diff < 0) acc.underItems++;
      return acc;
    },
    { totalItems: 0, adjustedItems: 0, totalDiff: 0, overItems: 0, underItems: 0 }
  );

  const filteredItems = stocktake?.items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.product?.productCode?.toLowerCase().includes(q) ||
      item.product?.name?.toLowerCase().includes(q) ||
      item.variant?.name?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!stocktake) {
    return <div className="text-center py-20 text-gray-500">Không tìm thấy phiếu kiểm kê</div>;
  }

  const canEdit = stocktake.status === "DRAFT" || stocktake.status === "IN_PROGRESS";
  const canApply = stocktake.status === "IN_PROGRESS";

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{stocktake.stocktakeNumber}</h1>
          <p className="text-sm text-gray-500">{stocktake.name}</p>
        </div>
        <Badge variant={stocktake.status === "COMPLETED" ? "success" : stocktake.status === "CANCELLED" ? "destructive" : "default"}>
          {stocktake.status}
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2">
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-bold">{summary?.totalItems ?? 0}</p>
          <p className="text-xs text-gray-500">Tổng items</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-bold text-blue-600">{summary?.adjustedItems ?? 0}</p>
          <p className="text-xs text-gray-500">Cần điều chỉnh</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className={`text-2xl font-bold ${(summary?.totalDiff ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            {(summary?.totalDiff ?? 0) >= 0 ? "+" : ""}{formatNumber(summary?.totalDiff ?? 0)}
          </p>
          <p className="text-xs text-gray-500">Chênh lệch</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-bold text-amber-600">{summary?.overItems ?? 0}</p>
          <p className="text-xs text-gray-500">Thừa / Thiếu</p>
        </Card>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddProduct(true)} className="flex-1">
            <Plus className="h-4 w-4 mr-1" />
            Thêm sản phẩm
          </Button>
          {canApply && (
            <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} className="flex-1 bg-green-600 hover:bg-green-700">
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Áp dụng điều chỉnh
            </Button>
          )}
        </div>
      )}

      {/* Add product modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card padding="md" className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Thêm sản phẩm</h2>
              <button onClick={() => setShowAddProduct(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Input
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                searchProducts(e.target.value);
              }}
              placeholder="Tìm theo mã, tên sản phẩm..."
              className="mb-3"
            />
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    addItemsMutation.mutate([{
                      productId: p.id,
                      expectedQty: p.available || 0,
                      countedQty: p.available || 0,
                    }]);
                  }}
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.productCode} • Có: {p.available}</p>
                  </div>
                  <Plus className="h-5 w-5 text-gray-400" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm sản phẩm..."
          className="pl-9"
        />
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {filteredItems?.map((item) => {
          const diff = item.countedQty - item.expectedQty;
          return (
            <Card key={item.id} padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                  {item.product?.images?.[0]?.url ? (
                    <img src={item.product.images[0].url} className="w-full h-full object-cover rounded" alt="" />
                  ) : (
                    <Package className="h-6 w-6 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product?.name}</p>
                  <p className="text-xs text-gray-500">{item.product?.productCode}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">{item.expectedQty}</span>
                    <span>→</span>
                    {canEdit ? (
                      <Input
                        type="number"
                        value={item.countedQty}
                        onChange={(e) => {
                          updateQtyMutation.mutate({
                            itemId: item.id,
                            countedQty: parseInt(e.target.value) || 0,
                          });
                        }}
                        className="w-16 h-8 text-center"
                      />
                    ) : (
                      <span className="font-semibold w-16 text-center">{item.countedQty}</span>
                    )}
                  </div>
                  {diff !== 0 && (
                    <p className={`text-xs font-medium ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                      {diff > 0 ? "+" : ""}{diff}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

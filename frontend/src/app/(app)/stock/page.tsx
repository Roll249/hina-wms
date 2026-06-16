"use client";

import { useState } from "react";
import { Search, AlertTriangle } from "lucide-react";
import { useStock } from "@/hooks/use-stock";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useSse } from "@/hooks/use-sse";
import { useQueryClient } from "@tanstack/react-query";

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const qc = useQueryClient();

  // Auto-refetch khi có stock event
  useSse("/sse/stream", (msg) => {
    if (msg.type === "stock.changed") {
      qc.invalidateQueries({ queryKey: ["stock"] });
    }
  });

  const { data, isLoading } = useStock({
    search: search || undefined,
    lowStockOnly: lowOnly,
    pageSize: 100,
  });

  return (
    <div className="space-y-3 pb-20">
      <h1 className="text-2xl font-bold text-gray-900">Tồn kho</h1>

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

      {isLoading ? (
        <p className="text-center text-gray-500 py-8">Đang tải...</p>
      ) : data?.items.length === 0 ? (
        <Card padding="lg" className="text-center text-gray-500">
          Không có sản phẩm nào
        </Card>
      ) : (
        <div className="space-y-2">
          {data?.items.map((item) => (
            <Card key={item.inventoryId} padding="sm">
              <div className="flex items-center gap-3">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-gray-500">{item.productCode}</p>
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.name}</p>
                  {item.variantName && item.variantName !== item.name && (
                    <p className="text-xs text-gray-500">{item.variantName}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>Đặt: {item.reservedQty}</span>
                    {item.isLowStock && (
                      <Badge variant="warning" className="text-[10px]">Tồn thấp</Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-lg font-bold",
                      item.available <= 0 ? "text-red-600" :
                      item.available <= item.lowStockThreshold ? "text-yellow-600" : "text-green-600",
                    )}
                  >
                    {formatNumber(item.available)}
                  </p>
                  <p className="text-[10px] text-gray-400">có thể bán</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <p className="text-xs text-center text-gray-400">
          Hiển thị {data.items.length} / {data.total}
        </p>
      )}
    </div>
  );
}

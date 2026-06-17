"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Globe, Package, Save, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

type WebStockInventory = {
  id: string;
  productId: string | null;
  variantId: string | null;
  quantity: number;
  webListedQty: number;
  webSoldQty: number;
  webReservedQty: number;
  webAvailableQty: number;
};

type ProductDetail = {
  product: {
    id: string;
    name: string;
    productCode: string;
    inventory: WebStockInventory | null;
  };
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    inventory: WebStockInventory | null;
  }>;
};

export function WebStockModal({
  productId,
  open,
  onClose,
}: {
  productId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery<ProductDetail>({
    queryKey: ["web-stock-product", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data } = await api.get(`/web-stock/product/${productId}`);
      return data;
    },
    enabled: !!productId && open,
  });

  // Reset edits khi data load: default = quantity (cho phép bán toàn bộ tồn)
  useEffect(() => {
    if (data) {
      const initial: Record<string, number> = {};
      if (data.product.inventory) {
        // Nếu chưa từng set webListedQty (== 0) thì default = quantity
        initial[data.product.id] =
          data.product.inventory.webListedQty > 0
            ? data.product.inventory.webListedQty
            : data.product.inventory.quantity;
      }
      data.variants.forEach((v) => {
        if (v.inventory) {
          initial[v.id] =
            v.inventory.webListedQty > 0
              ? v.inventory.webListedQty
              : v.inventory.quantity;
        }
      });
      setEdits(initial);
    }
  }, [data]);

  const setMutation = useMutation({
    mutationFn: async (body: { targetId: string; webListedQty: number }) => {
      const { data } = await api.patch("/web-stock/admin/set", body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["web-stock-product", productId] });
      qc.invalidateQueries({ queryKey: ["web-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã cập nhật số lượng web");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi cập nhật");
    },
  });

  const handleSave = async (targetId: string) => {
    const value = edits[targetId];
    if (value === undefined) return;
    await setMutation.mutateAsync({ targetId, webListedQty: value });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900">Số lượng đẩy lên web</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
              Đang tải...
            </div>
          ) : data ? (
            <>
              <Card padding="sm" className="bg-blue-50/50 border-blue-200">
                <p className="text-xs text-blue-700">
                  💡 <b>Số lượng cho web</b> = mức tối đa khách có thể mua trên web.
                  Kho có <b>{data.product.inventory ? formatNumber(data.product.inventory.quantity) : 0}</b> sản phẩm,
                  web đã bán <b className="text-blue-600">{formatNumber(data.product.inventory?.webSoldQty || 0)}</b>,
                  còn web mua được <b className="text-green-600">{formatNumber((data.product.inventory?.webListedQty || data.product.inventory?.quantity || 0) - (data.product.inventory?.webSoldQty || 0) - (data.product.inventory?.webReservedQty || 0))}</b>.
                </p>
              </Card>

              {/* Product chính */}
              {data.product.inventory && (
                <StockRow
                  label={data.product.name}
                  code={data.product.productCode}
                  inventory={data.product.inventory}
                  value={edits[data.product.id] ?? 0}
                  onChange={(v) => setEdits((e) => ({ ...e, [data.product.id]: v }))}
                  onSave={() => handleSave(data.product.id)}
                  saving={setMutation.isPending}
                />
              )}

              {/* Variants */}
              {data.variants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 mt-2">Biến thể:</p>
                  {data.variants.map((v) =>
                    v.inventory ? (
                      <StockRow
                        key={v.id}
                        label={v.name}
                        code={v.sku}
                        inventory={v.inventory}
                        value={edits[v.id] ?? 0}
                        onChange={(val) => setEdits((e) => ({ ...e, [v.id]: val }))}
                        onSave={() => handleSave(v.id)}
                        saving={setMutation.isPending}
                      />
                    ) : null,
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-3 border-t">
          <Button onClick={onClose} variant="secondary" className="w-full">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}

function StockRow({
  label,
  code,
  inventory,
  value,
  onChange,
  onSave,
  saving,
}: {
  label: string;
  code: string;
  inventory: WebStockInventory;
  value: number;
  onChange: (v: number) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const hasChange = value !== inventory.webListedQty;
  const tooHigh = value > inventory.quantity;
  const tooLow =
    value < inventory.webSoldQty + inventory.webReservedQty && value >= 0;

  return (
    <Card padding="sm" className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          <code className="text-[10px] text-gray-500 font-mono">{code}</code>
        </div>
        <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-1.5 text-center">
          <p className="text-gray-500">Tổng tồn</p>
          <p className="font-bold text-gray-900">{formatNumber(inventory.quantity)}</p>
        </div>
        <div className="bg-blue-50 rounded p-1.5 text-center">
          <p className="text-blue-600">Đã bán web</p>
          <p className="font-bold text-blue-700">{formatNumber(inventory.webSoldQty)}</p>
        </div>
        <div className="bg-yellow-50 rounded p-1.5 text-center">
          <p className="text-yellow-600">Web reserve</p>
          <p className="font-bold text-yellow-700">
            {formatNumber(inventory.webReservedQty)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 whitespace-nowrap">
          Cho web bán:
        </label>
        <input
          type="number"
          min={0}
          max={inventory.quantity}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Button
          onClick={onSave}
          size="sm"
          disabled={!hasChange || saving || tooHigh || tooLow}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Còn lại có thể bán */}
      <div className="text-xs flex items-center justify-between">
        <span className="text-gray-500">
          Còn lại: <b className="text-green-600">{formatNumber(value - inventory.webSoldQty - inventory.webReservedQty)}</b>
        </span>
        <span className="text-gray-400">/ {formatNumber(value)}</span>
      </div>

      {/* Validation */}
      {tooHigh && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          Vượt quá tổng tồn kho ({formatNumber(inventory.quantity)})
        </div>
      )}
      {tooLow && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          Phải ≥ đã bán + đang reserve (
          {formatNumber(inventory.webSoldQty + inventory.webReservedQty)})
        </div>
      )}
    </Card>
  );
}

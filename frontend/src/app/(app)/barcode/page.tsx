"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Scan,
  Package,
  Search,
  Barcode,
  Check,
  AlertTriangle,
  X,
  Loader2,
  QrCode,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatNumber } from "@/lib/utils";

type LookupResult = {
  productId?: string;
  variantId?: string;
  productCode: string;
  sku: string;
  name: string;
  type: 'product' | 'variant';
  quantity?: number;
  available?: number;
};

type SearchResult = {
  productId: string;
  productCode: string;
  sku: string;
  supplierCode?: string;
  name: string;
  type: 'product';
  quantity: number;
  variants?: Array<{
    variantId: string;
    productCode: string;
    sku: string;
    name: string;
    attributes: any;
    quantity: number;
  }>;
};

export default function BarcodePage() {
  const qc = useQueryClient();
  const [scanMode, setScanMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [recentScans, setRecentScans] = useState<LookupResult[]>([]);

  // Search products
  const { data: searchResults = [], isLoading: searching } = useQuery<SearchResult[]>({
    queryKey: ["barcode-search", searchQuery],
    queryFn: async () => {
      const { data } = await api.get(`/barcode/search?q=${encodeURIComponent(searchQuery)}`);
      return data;
    },
    enabled: searchQuery.length >= 2,
  });

  // Lookup barcode
  const lookupMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.get(`/barcode/lookup/${encodeURIComponent(code)}`);
      return data as LookupResult;
    },
    onSuccess: (result) => {
      setLookupResult(result);
      setRecentScans((prev) => [result, ...prev.slice(0, 9)]);
      setScanMode(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Không tìm thấy sản phẩm");
      setLookupResult(null);
    },
  });

  // Validate barcode
  const validateMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const { data } = await api.post("/barcode/validate", { barcode });
      return data;
    },
  });

  const handleBarcodeInput = useCallback((code: string) => {
    if (!code.trim()) return;
    
    // Validate first
    const validation = validateMutation.mutate(code);
    
    // Then lookup
    lookupMutation.mutate(code);
  }, []);

  const getStockStatus = (result: LookupResult) => {
    if (result.available === 0) {
      return { label: "Hết hàng", color: "bg-red-100 text-red-700" };
    }
    if (result.available !== undefined && result.available <= 10) {
      return { label: "Tồn thấp", color: "bg-yellow-100 text-yellow-700" };
    }
    return { label: "Còn hàng", color: "bg-green-100 text-green-700" };
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quét mã vạch</h1>
        <Button
          variant={scanMode ? "primary" : "ghost"}
          onClick={() => setScanMode(!scanMode)}
        >
          <Scan className="h-4 w-4 mr-1" />
          {scanMode ? "Tắt quét" : "Bật quét"}
        </Button>
      </div>

      {/* Scan mode */}
      {scanMode && (
        <Card padding="md" className="bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <Scan className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Chế độ quét</h3>
              <p className="text-sm text-blue-700">Nhập hoặc quét barcode</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              id="barcode-input"
              placeholder="Nhập mã barcode..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const input = e.currentTarget as HTMLInputElement;
                  handleBarcodeInput(input.value);
                  input.value = "";
                }
              }}
              autoFocus
            />
            <Button
              onClick={() => {
                const input = document.getElementById("barcode-input") as HTMLInputElement;
                handleBarcodeInput(input.value);
                input.value = "";
              }}
              disabled={lookupMutation.isPending}
            >
              {lookupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      {!scanMode && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã, tên sản phẩm..."
            className="pl-9"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>
      )}

      {/* Search results */}
      {!scanMode && searchQuery.length >= 2 && (
        <div className="space-y-2">
          {searchResults.length === 0 ? (
            <Card padding="md" className="text-center text-gray-500">
              Không tìm thấy sản phẩm
            </Card>
          ) : (
            searchResults.map((result) => (
              <Card key={result.productId} padding="sm">
                <div
                  className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded"
                  onClick={() => {
                    setSearchQuery("");
                    setLookupResult({
                      productId: result.productId,
                      productCode: result.productCode,
                      sku: result.sku,
                      name: result.name,
                      type: 'product',
                      quantity: result.quantity,
                      available: result.quantity,
                    });
                  }}
                >
                  <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                    <Barcode className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{result.name}</p>
                    <p className="text-xs text-gray-500">
                      {result.productCode} • {result.sku}
                    </p>
                    {result.variants && result.variants.length > 0 && (
                      <p className="text-xs text-blue-600">
                        {result.variants.length} biến thể
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant={result.quantity > 0 ? "success" : "danger"}>
                      {formatNumber(result.quantity)}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Lookup result */}
      {lookupResult && (
        <Card padding="md" className="border-2 border-primary-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center">
                <Package className="h-8 w-8 text-primary-600" />
              </div>
              <div>
                <Badge className={getStockStatus(lookupResult).color}>
                  {getStockStatus(lookupResult).label}
                </Badge>
                <h3 className="font-semibold text-lg mt-1">{lookupResult.name}</h3>
                <p className="text-sm text-gray-500">{lookupResult.type === 'variant' ? 'Biến thể' : 'Sản phẩm'}</p>
              </div>
            </div>
            <button
              onClick={() => setLookupResult(null)}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Mã SP</p>
              <p className="font-mono font-semibold">{lookupResult.productCode}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">SKU</p>
              <p className="font-mono font-semibold">{lookupResult.sku}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Tồn kho</p>
              <p className="font-mono font-semibold text-lg">
                {formatNumber(lookupResult.quantity ?? 0)}
              </p>
            </div>
          </div>

          {lookupResult.available !== undefined && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Còn khả dụng:</strong> {formatNumber(lookupResult.available)}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-700">Đã quét gần đây</h2>
          <div className="grid grid-cols-2 gap-2">
            {recentScans.slice(0, 6).map((scan, idx) => (
              <Card
                key={`${scan.productCode}-${idx}`}
                padding="sm"
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => setLookupResult(scan)}
              >
                <div className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{scan.name}</p>
                    <p className="text-xs text-gray-500">{scan.productCode}</p>
                  </div>
                  <Badge variant={scan.quantity === 0 ? "destructive" : "default"}>
                    {formatNumber(scan.quantity ?? 0)}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick lookup input */}
      {!scanMode && (
        <Card padding="md">
          <h3 className="font-semibold mb-3">Tra cứu nhanh</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Nhập mã sản phẩm..."
              id="quick-lookup"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const input = e.currentTarget as HTMLInputElement;
                  handleBarcodeInput(input.value);
                  input.value = "";
                }
              }}
            />
            <Button
              onClick={() => {
                const input = document.getElementById("quick-lookup") as HTMLInputElement;
                handleBarcodeInput(input.value);
                input.value = "";
              }}
              disabled={lookupMutation.isPending}
            >
              {lookupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface StockItem {
  inventoryId: string;
  productId: string | null;
  variantId: string | null;
  productCode: string | null;
  sku: string | null;
  name: string | null;
  variantName?: string;
  attributes?: Record<string, string> | null;
  imageUrl?: string;
  quantity: number;
  reservedQty: number;
  available: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

export function useStock(params: {
  search?: string;
  warehouseId?: string;
  lowStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ["stock", params],
    queryFn: async () => {
      const { data } = await api.get("/stock", { params });
      return data as {
        items: StockItem[];
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
      };
    },
    refetchInterval: 30000, // Auto refresh mỗi 30s
  });
}

export function useProductLookup(code: string | null) {
  return useQuery({
    queryKey: ["stock-lookup", code],
    queryFn: async () => {
      if (!code) return null;
      const { data } = await api.get(`/stock/lookup/${encodeURIComponent(code)}`);
      return data;
    },
    enabled: !!code,
    staleTime: 5000,
  });
}

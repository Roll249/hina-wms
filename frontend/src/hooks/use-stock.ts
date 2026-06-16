"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  isClassified: boolean;
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
}

export function useStock(params: {
  search?: string;
  warehouseId?: string;
  lowStockOnly?: boolean;
  isClassified?: boolean;
  categoryId?: string;
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
    refetchInterval: 30000,
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

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await api.get("/stock/categories");
      return data as CategoryItem[];
    },
    staleTime: 60000,
  });
}

export function useClassificationCounts() {
  return useQuery({
    queryKey: ["classification-counts"],
    queryFn: async () => {
      const { data } = await api.get("/stock/classification-counts");
      return data as { unclassified: number; classified: number; total: number };
    },
    staleTime: 30000,
  });
}

export function useClassifyProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { productId: string; categoryId: string }) => {
      const { data } = await api.post("/stock/classify", body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["classification-counts"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export interface ProductDetail {
  id: string;
  name: string;
  productCode: string;
  sku: string;
  description: string | null;
  shortDesc: string | null;
  basePrice: string;       // Decimal serialized
  weight: string | null;
  dimensions: Record<string, number> | null;
  attributes: Record<string, any> | null;
  taxRate: string | null;
  supplierCode: string | null;
  metaTitle: string | null;
  metaDesc: string | null;
  showPriceToGuest: boolean;
  showPriceToRetail: boolean;
  showPriceToWholesale: boolean;
  isClassified: boolean;
  categoryId: string;
  category?: { id: string; name: string; slug: string };
  inventory?: { quantity: number; reservedQty: number } | null;
  images?: { id: string; url: string }[];
}

export function useProductDetail(productId: string | null) {
  return useQuery({
    queryKey: ["product-detail", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data } = await api.get(`/stock/product/${productId}`);
      return data as ProductDetail;
    },
    enabled: !!productId,
  });
}

export function useEditProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data } = await api.patch(`/stock/product/${id}`, patch);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["product-detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["product-history", vars.id] });
    },
  });
}

export interface ProductHistoryEntry {
  id: string;
  action: string;
  changes: Record<string, [any, any]>;
  userEmail: string | null;
  userRole: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function useProductHistory(productId: string | null) {
  return useQuery({
    queryKey: ["product-history", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data } = await api.get(`/stock/product/${productId}/history`);
      return data as ProductHistoryEntry[];
    },
    enabled: !!productId,
  });
}

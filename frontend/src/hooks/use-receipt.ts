"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ScanResult {
  exists: boolean;
  product?: {
    id: string;
    productCode: string;
    sku: string;
    name: string;
    variantId: string | null;
    variantName?: string;
    quantity: number;
    imageUrl?: string;
  };
  action: "add-quantity" | "create-new";
  suggestedCode?: string;
}

export function useScanBarcode(code: string | null) {
  return useQuery({
    queryKey: ["scan-barcode", code],
    queryFn: async () => {
      if (!code) return null;
      const { data } = await api.get(`/receipts/scan/${encodeURIComponent(code)}`);
      return data as ScanResult;
    },
    enabled: !!code,
    staleTime: 5000,
    gcTime: 30000,
  });
}

export function useCreateQuickProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { productCode: string; name?: string }) => {
      const { data } = await api.post("/receipts/quick-product", body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-barcode"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

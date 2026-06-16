"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  variantId: string | null;
  createdAt: string;
}

export interface ProductImagesResponse {
  id: string;
  name: string;
  images: ProductImage[];
  variants: {
    id: string;
    sku: string;
    name: string;
    images: ProductImage[];
  }[];
}

export function useProductImages(productId: string | null) {
  return useQuery({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data } = await api.get(`/stock/product/${productId}/images`);
      return data as ProductImagesResponse;
    },
    enabled: !!productId,
    staleTime: 10000,
  });
}

/**
 * Upload 1 file lên MinIO qua presigned URL, sau đó lưu row ProductImage.
 * Returns ProductImage row mới.
 */
export function useUploadProductImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      altText,
      isPrimary,
    }: {
      file: File;
      altText?: string;
      isPrimary?: boolean;
    }) => {
      // 1. Get presigned URL
      const presign = await api.post(
        `/stock/product/${productId}/images/presigned`,
        { contentType: file.type },
      );
      const { uploadUrl, publicUrl } = presign.data as {
        uploadUrl: string;
        publicUrl: string;
        key: string;
      };

      // 2. Upload trực tiếp lên MinIO
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        const err = await putRes.text();
        throw new Error(`Upload MinIO fail: HTTP ${putRes.status} - ${err.slice(0, 200)}`);
      }

      // 3. Lưu row ProductImage
      const save = await api.post(`/stock/product/${productId}/images`, {
        url: publicUrl,
        altText: altText ?? null,
        isPrimary: isPrimary ?? false,
      });
      return save.data as ProductImage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-images", productId] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useUpdateProductImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      imageId,
      patch,
    }: {
      imageId: string;
      patch: { altText?: string; sortOrder?: number; isPrimary?: boolean };
    }) => {
      const { data } = await api.patch(`/stock/product/images/${imageId}`, patch);
      return data as ProductImage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-images", productId] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useDeleteProductImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { data } = await api.delete(`/stock/product/images/${imageId}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-images", productId] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  children: CategoryNode[];
}

export interface CategoryFlat {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  productCount: number;
}

export interface CategoryTree {
  roots: CategoryNode[];
  total: number;
}

export interface CategorySyncStats {
  total: number;
  active: number;
  mapped: number;
  unmapped: number;
  lastSyncedAt: string;
}

/**
 * Lấy category tree (cha-con, đa cấp) cho UI quản lý.
 */
export function useCategoryTree() {
  return useQuery({
    queryKey: ["category-tree"],
    queryFn: async () => {
      const { data } = await api.get("/categories/tree");
      return data as CategoryTree;
    },
    staleTime: 30000,
  });
}

/**
 * Thống kê sync: tổng / active / mapped / unmapped categories.
 */
export function useCategorySyncStats() {
  return useQuery({
    queryKey: ["category-sync-stats"],
    queryFn: async () => {
      const { data } = await api.get("/categories/sync-stats");
      return data as CategorySyncStats;
    },
    staleTime: 30000,
  });
}

/**
 * Tạo category mới.
 * Lưu ý: vì WMS và e-comm share DB nên INSERT sẽ tự động xuất hiện trên web.
 */
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      slug: string;
      parentId?: string;
      description?: string;
      icon?: string;
      sortOrder?: number;
      isActive?: boolean;
    }) => {
      const { data } = await api.post("/categories", body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-tree"] });
      qc.invalidateQueries({ queryKey: ["category-sync-stats"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

/**
 * Cập nhật category.
 */
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        description?: string;
        parentId?: string | null;
        icon?: string;
        sortOrder?: number;
        isActive?: boolean;
      };
    }) => {
      const { data } = await api.patch(`/categories/${id}`, patch);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-tree"] });
      qc.invalidateQueries({ queryKey: ["category-sync-stats"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

/**
 * Soft-delete category.
 */
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/categories/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-tree"] });
      qc.invalidateQueries({ queryKey: ["category-sync-stats"] });
    },
  });
}

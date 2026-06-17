"use client";

import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/**
 * Generic upload 1 file lên MinIO qua presigned URL.
 * Folder: "products/:id" / "categories/categories" / "categories/banners" / etc.
 * Trả về publicUrl để lưu vào DB.
 */
export function useUploadFile() {
  return useMutation({
    mutationFn: async ({
      file,
      folder,
    }: {
      file: File;
      folder: string;
    }): Promise<string> => {
      const presign = await api.post(`/upload/presigned`, {
        contentType: file.type,
        folder,
      });
      const { uploadUrl, publicUrl } = presign.data as PresignedUrlResponse;

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        const err = await putRes.text();
        throw new Error(`Upload MinIO fail: HTTP ${putRes.status} - ${err.slice(0, 200)}`);
      }
      return publicUrl;
    },
  });
}

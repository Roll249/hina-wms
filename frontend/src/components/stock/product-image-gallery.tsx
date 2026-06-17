"use client";

import { useState, useRef } from "react";
import {
  Image as ImageIcon,
  Upload,
  X,
  Star,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProductImages,
  useUploadProductImage,
  useUpdateProductImage,
  useDeleteProductImage,
} from "@/hooks/use-product-images";

interface Props {
  productId: string;
  productName: string;
}

export function ProductImageGallery({ productId, productName }: Props) {
  const { data, isLoading, error } = useProductImages(productId);
  const upload = useUploadProductImage(productId);
  const update = useUpdateProductImage(productId);
  const del = useDeleteProductImage(productId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<
    Array<{ name: string; progress: "uploading" | "saving" | "done" | "error" }>
  >([]);

  const images = data?.images ?? [];
  const primaryCount = images.filter((i) => i.isPrimary).length;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} không phải ảnh`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} quá lớn (>10MB)`);
        continue;
      }

      const fileLabel = { name: file.name, progress: "uploading" as const };
      setUploadingFiles((prev) => [...prev, fileLabel]);

      try {
        // Upload: nếu chưa có primary và là ảnh đầu tiên → set primary
        const setAsPrimary = primaryCount === 0 && images.length === 0;
        await upload.mutateAsync({
          file,
          altText: file.name.replace(/\.[^.]+$/, ""),
          isPrimary: setAsPrimary,
        });
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, progress: "done" } : f,
          ),
        );
        toast.success(`Đã upload ${file.name}`);
      } catch (err: any) {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, progress: "error" } : f,
          ),
        );
        toast.error(`Upload ${file.name} thất bại: ${err?.message ?? err}`);
      }
    }

    // Clear input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSetPrimary = (imageId: string) => {
    update.mutate(
      { imageId, patch: { isPrimary: true } },
      {
        onSuccess: () => toast.success("Đã đặt làm ảnh đại diện"),
        onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
      },
    );
  };

  const handleDelete = (imageId: string) => {
    if (!confirm("Xóa ảnh này? File trên MinIO cũng sẽ bị xóa.")) return;
    del.mutate(imageId, {
      onSuccess: () => toast.success("Đã xóa ảnh"),
      onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
    });
  };

  if (isLoading) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
        Đang tải ảnh...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 inline mr-1" />
        Lỗi tải ảnh
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Hình ảnh</h3>
          <p className="text-xs text-gray-500">
            {images.length} ảnh · {primaryCount} ảnh đại diện
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
        <strong>Đồng bộ với web:</strong> Ảnh upload ở đây sẽ tự động hiển thị
        trên web LotusSouvenir ngay lập tức (cùng database + MinIO).
        JPG/PNG/WebP/GIF, tối đa 10MB/ảnh.
      </div>

      {/* Image grid */}
      {images.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <ImageIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Chưa có ảnh nào</p>
          <p className="text-xs text-gray-400 mt-1">
            Click "Upload" để thêm ảnh đầu tiên
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
            >
              <img
                src={img.url}
                alt={img.altText ?? ""}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />

              {/* Primary badge */}
              {img.isPrimary && (
                <div className="absolute top-1 left-1 bg-yellow-400 text-yellow-900 rounded-full p-1">
                  <Star className="w-3 h-3 fill-current" />
                </div>
              )}

              {/* Sort order badge */}
              <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                #{img.sortOrder}
              </div>

              {/* Alt text overlay */}
              {img.altText && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-1 truncate">
                  {img.altText}
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {!img.isPrimary && (
                  <button
                    onClick={() => handleSetPrimary(img.id)}
                    disabled={update.isPending}
                    className="p-1.5 bg-yellow-400 text-yellow-900 rounded-full hover:bg-yellow-500"
                    title="Đặt làm ảnh đại diện"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(img.id)}
                  disabled={del.isPending}
                  className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                  title="Xóa"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploading indicators */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-1 mt-2">
          {uploadingFiles.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-gray-50"
            >
              {f.progress === "uploading" && (
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              )}
              {f.progress === "done" && (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              )}
              {f.progress === "error" && (
                <AlertCircle className="w-3 h-3 text-red-500" />
              )}
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-gray-400">
                {f.progress === "uploading" && "Đang upload..."}
                {f.progress === "done" && "✓"}
                {f.progress === "error" && "Lỗi"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Variant images (read-only) */}
      {data?.variants && data.variants.some((v) => v.images.length > 0) && (
        <details className="mt-3 border rounded-lg">
          <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer">
            Ảnh theo variant ({data.variants.reduce((sum, v) => sum + v.images.length, 0)})
          </summary>
          <div className="px-3 pb-3 space-y-3">
            {data.variants
              .filter((v) => v.images.length > 0)
              .map((v) => (
                <div key={v.id}>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {v.sku} - {v.name}
                  </p>
                  <div className="grid grid-cols-4 gap-1">
                    {v.images.map((img) => (
                      <div
                        key={img.id}
                        className="aspect-square rounded overflow-hidden border bg-gray-50"
                      >
                        <img
                          src={img.url}
                          alt={img.altText ?? ""}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}

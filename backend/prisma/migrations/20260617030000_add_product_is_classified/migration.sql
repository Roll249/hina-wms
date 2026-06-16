-- ============================================================
-- Migration: Thêm cột isClassified trên Product
-- ============================================================
-- Mục đích: Đánh dấu sản phẩm đã được phân loại cho kho hay chưa.
-- Khi admin tạo Category mới và gán sản phẩm vào → isClassified=true.
-- WMS hiển thị tab "Chưa phân loại" với tất cả sản phẩm isClassified=false,
-- tab "Đã phân loại" với isClassified=true.
--
-- Default false vì tất cả 1810 sản phẩm hiện đang ở category mặc định
-- "Import Lotussouvenir" → đều cần được phân loại lại.
-- ============================================================

ALTER TABLE "Product"
  ADD COLUMN "isClassified" BOOLEAN NOT NULL DEFAULT false;

-- Index cho query lọc nhanh theo tab
CREATE INDEX "Product_isClassified_idx" ON "Product" ("isClassified");

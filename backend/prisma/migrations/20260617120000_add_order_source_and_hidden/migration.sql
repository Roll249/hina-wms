-- ============================================================
-- Migration: Thêm OrderSource enum + source + isHiddenFromWeb
-- ============================================================
-- Mục đích:
--   - Phân biệt đơn từ WEB (ecom) vs WMS (kho tạo offline)
--   - Đơn WMS có isHiddenFromWeb=true để ecom không hiển thị
--   - Backfill: existing WMS orders (isGuestOrder=true) → source=WMS
-- ============================================================

-- 1. Tạo enum OrderSource
DO $$ BEGIN
  CREATE TYPE "OrderSource" AS ENUM ('WEB', 'WMS', 'ADMIN_WEB');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Thêm cột source (default 'WEB' cho backward compat)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "source" "OrderSource" NOT NULL DEFAULT 'WEB';
CREATE INDEX IF NOT EXISTS "Order_source_idx" ON "Order"("source");
CREATE INDEX IF NOT EXISTS "Order_source_status_idx" ON "Order"("source", "status");

-- 3. Thêm cờ isHiddenFromWeb
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isHiddenFromWeb" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Order_isHiddenFromWeb_idx" ON "Order"("isHiddenFromWeb");

-- 4. Backfill: existing WMS orders (isGuestOrder=true) → source=WMS, hidden=true
UPDATE "Order" 
SET "source" = 'WMS', "isHiddenFromWeb" = true 
WHERE "isGuestOrder" = true;

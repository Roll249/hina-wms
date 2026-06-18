-- ============================================================
-- Migration: Thêm 3 cột web stock fields vào Inventory
-- ============================================================
-- Mục đích: WMS quản lý số lượng đẩy lên web bán
--   - webListedQty  : số lượng tối đa cho phép bán trên web (admin set)
--   - webSoldQty    : số lượng web đã bán (đồng bộ từ webhook)
--   - webReservedQty: số lượng web đang reserve trong cart
-- ============================================================

ALTER TABLE "Inventory"
  ADD COLUMN IF NOT EXISTS "webListedQty"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "webSoldQty"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "webReservedQty" INTEGER NOT NULL DEFAULT 0;

-- Index cho query filter theo webAvailable (positive)
CREATE INDEX IF NOT EXISTS "Inventory_webListedQty_idx" ON "Inventory" ("webListedQty");

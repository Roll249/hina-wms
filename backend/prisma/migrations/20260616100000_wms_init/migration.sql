-- ============================================================
-- Hina WMS - Initial Migration
-- ============================================================
-- Áp dụng migration này VÀO database hina-e-comm đang chạy.
-- File này tạo các bảng/enum mới cho WMS mà KHÔNG động vào
-- schema hiện tại của hina-e-comm.
--
-- Áp dụng:
--   psql $DATABASE_URL -f prisma/migrations/20260616100000_wms_init/migration.sql
-- ============================================================

-- ============================================================
-- 1. ENUMS MỚI
-- ============================================================

-- GoodsReceiptStatus
DO $$ BEGIN
  CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ReceiptSource
DO $$ BEGIN
  CREATE TYPE "ReceiptSource" AS ENUM ('MANUAL', 'BARCODE', 'FILE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ShipmentStatus
DO $$ BEGIN
  CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'HANDED_OVER', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. THÊM GIÁ TRỊ MỚI VÀO ENUM MovementType
-- ============================================================

ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'GOODS_RECEIPT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ORDER_SHIPMENT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'STOCKTAKE_ADJUST';

-- ============================================================
-- 3. BẢNG WAREHOUSE
-- ============================================================

CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "code"      TEXT NOT NULL UNIQUE,
  "name"      TEXT NOT NULL,
  "address"   TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tạo kho mặc định
INSERT INTO "Warehouse" ("id", "code", "name", "address", "isDefault", "isActive")
VALUES ('wh-default-0001', 'WH-DEFAULT', 'Kho mặc định', 'Hồ Chí Minh', true, true)
ON CONFLICT ("code") DO NOTHING;

-- ============================================================
-- 4. BẢNG SUPPLIER
-- ============================================================

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "code"          TEXT UNIQUE,
  "name"          TEXT NOT NULL,
  "contactPerson" TEXT,
  "phone"         TEXT,
  "email"         TEXT,
  "address"       TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Supplier_isActive_idx" ON "Supplier"("isActive");

-- ============================================================
-- 5. BẢNG WAREHOUSE_STAFF
-- ============================================================

CREATE TABLE IF NOT EXISTS "WarehouseStaff" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"       TEXT NOT NULL UNIQUE,
  "employeeCode" TEXT NOT NULL UNIQUE,
  "warehouseId"  TEXT NOT NULL,
  "pinHash"      TEXT,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarehouseStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "WarehouseStaff_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "WarehouseStaff_warehouseId_idx" ON "WarehouseStaff"("warehouseId");
CREATE INDEX IF NOT EXISTS "WarehouseStaff_employeeCode_idx" ON "WarehouseStaff"("employeeCode");

-- ============================================================
-- 6. THÊM CỘT warehouseStaffId VÀO InventoryMovement
-- ============================================================

ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "warehouseStaffId" TEXT;

CREATE INDEX IF NOT EXISTS "InventoryMovement_warehouseStaffId_idx" ON "InventoryMovement"("warehouseStaffId");

DO $$ BEGIN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseStaffId_fkey"
    FOREIGN KEY ("warehouseStaffId") REFERENCES "WarehouseStaff"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 7. BẢNG GOODS_RECEIPT
-- ============================================================

CREATE TABLE IF NOT EXISTS "GoodsReceipt" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "receiptNumber" TEXT NOT NULL UNIQUE,
  "warehouseId"   TEXT NOT NULL,
  "supplierId"    TEXT,
  "receivedById"  TEXT NOT NULL,
  "status"        "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "source"        "ReceiptSource" NOT NULL DEFAULT 'MANUAL',
  "note"          TEXT,
  "totalQuantity" INTEGER NOT NULL DEFAULT 0,
  "totalSku"      INTEGER NOT NULL DEFAULT 0,
  "completedAt"   TIMESTAMP(3),
  "cancelledAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL,
  CONSTRAINT "GoodsReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "WarehouseStaff"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "GoodsReceipt_warehouseId_createdAt_idx" ON "GoodsReceipt"("warehouseId", "createdAt");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_status_idx" ON "GoodsReceipt"("status");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_receivedById_idx" ON "GoodsReceipt"("receivedById");

-- ============================================================
-- 8. BẢNG GOODS_RECEIPT_ITEM
-- ============================================================

CREATE TABLE IF NOT EXISTS "GoodsReceiptItem" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "receiptId"        TEXT NOT NULL,
  "productId"        TEXT,
  "variantId"        TEXT,
  "productCode"      TEXT NOT NULL,
  "productName"      TEXT NOT NULL,
  "sku"              TEXT NOT NULL,
  "expectedQuantity" INTEGER NOT NULL DEFAULT 0,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost"         DECIMAL(12, 2),
  "lotNumber"        TEXT,
  "expiryDate"       TIMESTAMP(3),
  "note"             TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE,
  CONSTRAINT "GoodsReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL,
  CONSTRAINT "GoodsReceiptItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "GoodsReceiptItem_receiptId_idx" ON "GoodsReceiptItem"("receiptId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptItem_productId_idx" ON "GoodsReceiptItem"("productId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptItem_variantId_idx" ON "GoodsReceiptItem"("variantId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptItem_productCode_idx" ON "GoodsReceiptItem"("productCode");

-- ============================================================
-- 9. BẢNG OUTBOUND_SHIPMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS "OutboundShipment" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "shipmentNumber" TEXT NOT NULL UNIQUE,
  "orderId"        TEXT NOT NULL UNIQUE,
  "orderNumber"    TEXT NOT NULL,
  "warehouseId"    TEXT NOT NULL,
  "pickedById"     TEXT,
  "status"         "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "pickedAt"       TIMESTAMP(3),
  "packedAt"       TIMESTAMP(3),
  "handedOverAt"   TIMESTAMP(3),
  "carrierName"    TEXT,
  "trackingNumber" TEXT,
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundShipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  CONSTRAINT "OutboundShipment_pickedById_fkey" FOREIGN KEY ("pickedById") REFERENCES "WarehouseStaff"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "OutboundShipment_warehouseId_status_idx" ON "OutboundShipment"("warehouseId", "status");
CREATE INDEX IF NOT EXISTS "OutboundShipment_pickedById_idx" ON "OutboundShipment"("pickedById");

-- ============================================================
-- 10. BẢNG OUTBOUND_SHIPMENT_ITEM
-- ============================================================

CREATE TABLE IF NOT EXISTS "OutboundShipmentItem" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "shipmentId"     TEXT NOT NULL,
  "productId"      TEXT,
  "variantId"      TEXT,
  "productCode"    TEXT NOT NULL,
  "productName"    TEXT NOT NULL,
  "sku"            TEXT NOT NULL,
  "orderQuantity"  INTEGER NOT NULL,
  "pickedQuantity" INTEGER NOT NULL DEFAULT 0,
  "packedQuantity" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OutboundShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "OutboundShipment"("id") ON DELETE CASCADE,
  CONSTRAINT "OutboundShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL,
  CONSTRAINT "OutboundShipmentItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "OutboundShipmentItem_shipmentId_idx" ON "OutboundShipmentItem"("shipmentId");
CREATE INDEX IF NOT EXISTS "OutboundShipmentItem_productId_idx" ON "OutboundShipmentItem"("productId");
CREATE INDEX IF NOT EXISTS "OutboundShipmentItem_variantId_idx" ON "OutboundShipmentItem"("variantId");

# Hina WMS - Database Migration

File này chứa migration SQL để tạo các bảng/enum mới cho WMS mà KHÔNG động vào schema hiện tại của `hina-e-comm`.

## Áp dụng

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260616100000_wms_init/migration.sql
```

## Bảng được tạo

- `Warehouse` - Kho vật lý
- `Supplier` - Nhà cung cấp
- `WarehouseStaff` - Nhân viên kho (1-1 với User)
- `GoodsReceipt` - Phiếu nhập kho
- `GoodsReceiptItem` - Chi tiết phiếu nhập
- `OutboundShipment` - Phiếu xuất kho
- `OutboundShipmentItem` - Chi tiết phiếu xuất

## Enum mới

- `GoodsReceiptStatus` (DRAFT, CONFIRMED, CANCELLED)
- `ReceiptSource` (MANUAL, BARCODE, FILE)
- `ShipmentStatus` (PENDING, PICKING, PICKED, PACKING, PACKED, HANDED_OVER, CANCELLED)

## Enum mở rộng

- `MovementType` thêm 3 giá trị: GOODS_RECEIPT, ORDER_SHIPMENT, STOCKTAKE_ADJUST

## Cột mở rộng

- `InventoryMovement.warehouseStaffId` - FK tới WarehouseStaff (ghi nhận ai thực hiện)

## Rollback

```sql
DROP TABLE IF EXISTS "OutboundShipmentItem";
DROP TABLE IF EXISTS "OutboundShipment";
DROP TABLE IF EXISTS "GoodsReceiptItem";
DROP TABLE IF EXISTS "GoodsReceipt";
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_warehouseStaffId_fkey";
ALTER TABLE "InventoryMovement" DROP COLUMN IF EXISTS "warehouseStaffId";
DROP TABLE IF EXISTS "WarehouseStaff";
DROP TABLE IF EXISTS "Supplier";
DROP TABLE IF EXISTS "Warehouse";
-- Không xóa giá trị enum đã thêm vì PostgreSQL không hỗ trợ dễ dàng
```

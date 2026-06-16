#!/bin/bash
# ============================================================
# Sync schema từ hina-e-comm sang hina-wms
# ============================================================
# Script này:
# 1. Copy schema.prisma từ hina-e-comm
# 2. Thêm relation ngược vào User, Product, ProductVariant
#    (vì WMS tham chiếu tới các model này)
# 3. Append phần WMS mới (enums + models) vào cuối
# ============================================================

set -e

HINA_SCHEMA="/home/khang/job/hina-e-comm/backend/prisma/schema.prisma"
WMS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WMS_SCHEMA="$WMS_DIR/prisma/schema.prisma"
WMS_EXTRA="$WMS_DIR/prisma/schema.wms.prisma"

if [ ! -f "$HINA_SCHEMA" ]; then
  echo "ERROR: Không tìm thấy schema gốc tại $HINA_SCHEMA"
  exit 1
fi

if [ ! -f "$WMS_EXTRA" ]; then
  echo "ERROR: Không tìm thấy file $WMS_EXTRA"
  exit 1
fi

echo "==> Đang copy schema gốc từ hina-e-comm..."
cp "$HINA_SCHEMA" "$WMS_SCHEMA"

# Thêm relation ngược vào Product (receiptItems, shipmentItems)
# Tìm dòng "  cartItems     CartItem[]" trong model Product và thêm sau nó
python3 <<'PYEOF'
import re

with open('/home/khang/senkutech/hina-wms/backend/prisma/schema.prisma', 'r') as f:
    content = f.read()

# Thêm vào Product
product_addition = """  cartItems     CartItem[]
  receiptItems  GoodsReceiptItem[]
  shipmentItems OutboundShipmentItem[]"""
content = content.replace(
    "  cartItems     CartItem[]\n\n  // Timestamps",
    product_addition + "\n\n  // Timestamps"
)

# Thêm vào ProductVariant
variant_addition = """  cartItems     CartItem[]
  receiptItems  GoodsReceiptItem[]
  shipmentItems OutboundShipmentItem[]"""
content = content.replace(
    "  cartItems     CartItem[]\n\n  createdAt",
    variant_addition + "\n\n  createdAt"
)

# Thêm vào User - tìm dòng có auditLogs/addresses hoặc cuối model User
user_addition = "  warehouseStaff WarehouseStaff?"
# Tìm pattern của model User (đơn giản: thêm trước dòng đóng })
# Ta thêm ngay sau dòng cuối cùng của model User, trước "}" đầu tiên sau các quan hệ
# Cách an toàn: tìm "model User {" và thêm trước "}" đầu tiên
# Đơn giản hơn: tìm dòng "isActive" cuối cùng của User rồi thêm sau
content = re.sub(
    r'(model User \{[\s\S]*?isActive[^\n]*\n)',
    r'\1  warehouseStaff WarehouseStaff?\n',
    content,
    count=1
)

# Thêm warehouseStaffId vào InventoryMovement (sau createdBy)
inv_addition = """  warehouseStaff   WarehouseStaff? @relation(fields: [warehouseStaffId], references: [id], onDelete: SetNull)
  warehouseStaffId String?"""
content = content.replace(
    "  createdBy     String?      // userId\n",
    "  createdBy     String?      // userId\n  " + inv_addition.replace('\n', '\n  ') + "\n"
)
# Sửa lại format
content = content.replace(
    "  warehouseStaff   WarehouseStaff? @relation(fields: [warehouseStaffId], references: [id], onDelete: SetNull)\n  warehouseStaffId String?",
    "  warehouseStaff   WarehouseStaff? @relation(fields: [warehouseStaffId], references: [id], onDelete: SetNull)\n  warehouseStaffId String?"
)

with open('/home/khang/senkutech/hina-wms/backend/prisma/schema.prisma', 'w') as f:
    f.write(content)

print("==> Đã inject relation ngược vào User/Product/ProductVariant/InventoryMovement")
PYEOF

echo "==> Đang thêm phần WMS mới..."
echo "" >> "$WMS_SCHEMA"
echo "// ============================================================" >> "$WMS_SCHEMA"
echo "// HINA WMS EXTENSIONS (auto-generated bởi scripts/sync-schema.sh)" >> "$WMS_SCHEMA"
echo "// ============================================================" >> "$WMS_SCHEMA"

# Thêm giá trị mới vào enum MovementType (nếu chưa có)
if grep -q "GOODS_RECEIPT" "$WMS_SCHEMA"; then
  echo "==> MovementType đã có WMS values, skip"
else
  echo "==> Inject WMS values vào enum MovementType..."
  python3 <<'PYEOF'
with open('/home/khang/senkutech/hina-wms/backend/prisma/schema.prisma', 'r') as f:
    content = f.read()

old = """enum MovementType {
  PRODUCT_CREATED
  VARIANT_CREATED
  STOCK_INITIALIZED
  STOCK_SET_MANUAL
  STOCK_ADJUSTED_MANUAL
  STOCK_DEDUCTED_ORDER
  STOCK_RESTORED_ORDER_CANCEL
  STOCK_RESERVED
  STOCK_RELEASED
  STOCK_RELEASED_ABANDONED
  RETURN
  SHIPMENT
}"""

new = """enum MovementType {
  PRODUCT_CREATED
  VARIANT_CREATED
  STOCK_INITIALIZED
  STOCK_SET_MANUAL
  STOCK_ADJUSTED_MANUAL
  STOCK_DEDUCTED_ORDER
  STOCK_RESTORED_ORDER_CANCEL
  STOCK_RESERVED
  STOCK_RELEASED
  STOCK_RELEASED_ABANDONED
  RETURN
  SHIPMENT
  GOODS_RECEIPT
  ORDER_SHIPMENT
  STOCKTAKE_ADJUST
}"""

if old in content:
    content = content.replace(old, new)
    with open('/home/khang/senkutech/hina-wms/backend/prisma/schema.prisma', 'w') as f:
        f.write(content)
    print("==> Đã inject")
else:
    print("WARNING: Không tìm thấy enum MovementType để inject")
PYEOF
fi

# Bỏ phần generator/datasource trong WMS_EXTRA (chỉ giữ enums + models)
sed -n '/^enum /,$p' "$WMS_EXTRA" >> "$WMS_SCHEMA"

echo "==> Đã tạo $WMS_SCHEMA"
wc -l "$WMS_SCHEMA"
echo ""
echo "==> Chạy 'npm run prisma:generate' để generate Prisma Client"
echo "==> Chạy 'psql \$DATABASE_URL -f prisma/migrations/20260616100000_wms_init/migration.sql' để apply migration"

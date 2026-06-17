#!/bin/bash
# ============================================================
# Seed WMS-specific data (Warehouse, WarehouseStaff)
# ============================================================
# Idempotent: chạy nhiều lần OK, dùng ON CONFLICT.
# Chạy SAU khi đã:
#   1. npx prisma db push   (tạo schema)
#   2. Đã có ít nhất 1 user ADMIN/MANAGE trong User table
#
# Sử dụng: bash scripts/seed-wms.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Không tìm thấy $ENV_FILE"
  exit 1
fi

# Load env (POSTGRES_PASSWORD, DATABASE_URL, ...)
set -a
# shellcheck disable=SC1090
source <(grep -E "^(POSTGRES_PASSWORD|POSTGRES_HOST|POSTGRES_PORT|POSTGRES_USER|DATABASE_URL)=" "$ENV_FILE" | sed 's/^/export /' 2>/dev/null) || true
set +a

# Detect mode: Docker network (@postgres:) hoặc host (port 5433)
if echo "$DATABASE_URL" | grep -q "@postgres:" 2>/dev/null; then
  PG_RUN() { docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" hina-e-comm-postgres-1 psql -U lotussouvenir -d lotussouvenir "$@"; }
  echo "==> Mode: Docker network (exec into postgres container)"
else
  DETECTED_PORT=$(echo "$DATABASE_URL" | grep -oE ':[0-9]+/' | head -1 | tr -d ':/' || echo "5432")
  export PGPASSWORD="$POSTGRES_PASSWORD"
  PG_RUN() { psql -h 127.0.0.1 -p "$DETECTED_PORT" -U "${POSTGRES_USER:-lotussouvenir}" -d lotussouvenir "$@"; }
  echo "==> Mode: local psql (port $DETECTED_PORT)"
fi

# 1. Seed 2 default warehouses
echo "==> Seeding default warehouses..."
PG_RUN -c "
INSERT INTO \"Warehouse\" (id, code, name, address, \"isDefault\", \"isActive\", \"createdAt\", \"updatedAt\")
VALUES 
  ('wh-hcm-default-001', 'WH-HCM-01', 'Kho Tổng HCM', '123 Nguyễn Huệ, Q1, TP.HCM', true, true, NOW(), NOW()),
  ('wh-hn-branch-002', 'WH-HN-01', 'Kho Chi Nhánh HN', '456 Trần Hưng Đạo, Q1, Hà Nội', false, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
"

# 2. Seed WarehouseStaff cho user ADMIN/MANAGE
echo "==> Seeding WarehouseStaff for ADMIN/MANAGE users..."
PG_RUN -c "
INSERT INTO \"WarehouseStaff\" (id, \"userId\", \"employeeCode\", \"warehouseId\", \"pinHash\", \"isActive\", \"createdAt\", \"updatedAt\")
SELECT 
  'ws-' || u.id, 
  u.id, 
  'WS-' || UPPER(LEFT(u.email, 3)) || '-' || SUBSTR(u.id::text, 1, 4),
  'wh-hcm-default-001',
  NULL,
  true,
  NOW(),
  NOW()
FROM \"User\" u
WHERE u.role IN ('ADMIN', 'MANAGE') AND u.\"deletedAt\" IS NULL
ON CONFLICT (\"userId\") DO NOTHING;
"

# 3. Verify
echo ""
echo "==> Verify:"
PG_RUN -c "
SELECT u.email, u.role, ws.\"employeeCode\", w.code AS warehouse 
FROM \"User\" u 
JOIN \"WarehouseStaff\" ws ON ws.\"userId\"=u.id 
JOIN \"Warehouse\" w ON w.id=ws.\"warehouseId\"
WHERE u.\"deletedAt\" IS NULL
ORDER BY u.email;
"

echo ""
echo "✅ Done! Bây giờ login lại được rồi."

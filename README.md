# Hina WMS

Hệ thống quản lý kho (Warehouse Management System) cho **hina-e-comm**.

WMS mini, mobile-first, tối giản cho nhân viên kho, **đồng bộ real-time** với web bán hàng theo nguyên tắc: **"web thế nào thì kho thế nào"**.

## 🚀 Quick Start (Local Dev)

```bash
# 1. Clone repo
git clone https://github.com/Roll249/hina-wms.git
cd hina-wms

# 2. Copy env mẫu
cp .env.example .env
# Sửa DATABASE_URL, REDIS_URL, JWT_SECRET khớp với hina-e-comm

# 3. Đảm bảo hina-e-comm đang chạy (cùng docker network)
docker network create hina-network 2>/dev/null || true

# 4. Apply Prisma schema (chỉ cần 1 lần đầu)
docker run --rm -it \
  -e DATABASE_URL="$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '\"')" \
  -v "$PWD/backend/prisma:/app/prisma" \
  hina-wms-hina-wms-backend:latest \
  npx prisma db push --skip-generate

# 5. Khởi động
docker compose up -d

# 6. Truy cập
# Frontend: http://localhost:4568
# Backend:  http://localhost:7777
```

## 📦 Production Deploy

Xem section **"[PRODUCTION]"** trong `.env.example` để biết các biến cần đổi khi deploy.

Các điểm khác biệt chính so với local:
- `NODE_ENV=production`
- `DATABASE_URL` trỏ tới DB production
- `JWT_SECRET` khớp với hina-e-comm production
- `CORS_ORIGINS` chỉ chứa domain thật (https://...)
- `NEXT_PUBLIC_API_URL` trỏ tới API thật

## 🧪 Test users (sau khi seed)

| Role | Email | Password / PIN | Login |
|------|-------|----------------|-------|
| ADMIN | `admin@hina.vn` | `Admin@123` | email + password |
| MANAGE | `manage1@test.vn` | `Test@123` | email + password |
| WAREHOUSE_STAFF | `whstaff1@test.vn` | PIN `1234` (code `WH1xx`) | employee code + PIN |
| CTV/RETAIL/WHOLESALE | — | — | **không được login WMS** (401) |

## Tính năng chính

- ✅ **Nhập kho** 3 chế độ: quét mã vạch (camera + USB scanner), nhập tay, upload CSV
- ✅ **Xuất kho** theo đơn hàng từ hina-e-comm (picklist)
- ✅ **Tồn kho real-time**: tự động đồng bộ giữa kho và web bán hàng
- ✅ **Đăng nhập nhanh** bằng PIN (4-6 số) cho thiết bị kho chia sẻ
- ✅ **Cảnh báo tồn thấp** trên dashboard
- ✅ **Lịch sử** nhập/xuất/biến động đầy đủ
- ✅ **Audit log** mọi thao tác

## Tech Stack

| Lớp | Công nghệ |
|------|-----------|
| Backend | NestJS 11 + TypeScript + Prisma 5 |
| Database | PostgreSQL 16 (**chung với hina-e-comm**) |
| Cache/EventBus | Redis 7 (**chung với hina-e-comm**) |
| Realtime | Server-Sent Events (SSE) + Redis pub/sub |
| Frontend | Next.js 15 + Tailwind CSS + Zustand + TanStack Query |
| Barcode | @zxing/browser (camera + USB) |
| CSV | papaparse |

## Cấu trúc

```
hina-wms/
├── backend/                # NestJS API (port 7777)
│   ├── src/
│   │   ├── common/         # Prisma, EventBus, Guards, Decorators
│   │   └── modules/        # auth, warehouse, stock, receipts, shipments, sse, webhook
│   ├── prisma/
│   │   ├── schema.prisma   # Auto-merged từ hina-e-comm + WMS extensions
│   │   └── migrations/     # SQL migration
│   └── scripts/            # sync-schema.sh
├── frontend/               # Next.js UI (port 4568)
│   └── src/app/            # (auth)/login, (app)/{dashboard,receive,ship,stock,history}
├── integration/            # Helper để tích hợp với hina-e-comm
└── docker-compose.yml
```

## Cài đặt

### Bước 1: Apply database migration

Database WMS dùng **chung** với hina-e-comm. Áp dụng migration để tạo các bảng/enum mới:

```bash
cd /home/khang/senkutech/hina-wms

# Lấy DATABASE_URL từ hina-e-comm
export DATABASE_URL=$(grep DATABASE_URL /home/khang/job/hina-e-comm/backend/.env | cut -d= -f2- | tr -d '"')

# Apply migration
psql "$DATABASE_URL" -f backend/prisma/migrations/20260616100000_wms_init/migration.sql
```

### Bước 2: Generate Prisma Client

```bash
cd backend
./scripts/sync-schema.sh          # Copy schema gốc + inject relations + append WMS
npx prisma generate
```

### Bước 3: Cấu hình env

```bash
cp backend/.env.example backend/.env
# Sửa DATABASE_URL, REDIS_URL, JWT_SECRET cho khớp với hina-e-comm
```

### Bước 4: Chạy với Docker

```bash
docker network create hina-network   # Network chung với hina-e-comm (nếu chưa có)

docker compose up -d
```

Hoặc chạy local:

```bash
# Backend
cd backend && npm install && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev
```

### Bước 5: Tạo nhân viên kho + PIN

Sau khi admin login thành công, tạo WarehouseStaff:

```bash
# Dùng psql hoặc Prisma Studio
psql $DATABASE_URL -c "
INSERT INTO \"WarehouseStaff\" (\"id\", \"userId\", \"employeeCode\", \"warehouseId\", \"isActive\", \"createdAt\", \"updatedAt\")
SELECT 'staff-001', u.id, 'NV001', w.id, true, NOW(), NOW()
FROM \"User\" u, \"Warehouse\" w
WHERE u.email = 'your-admin@hina.local' AND w.code = 'WH-DEFAULT'
LIMIT 1;
"

# Set PIN (qua API hoặc seed script)
# API: PATCH /warehouse/staff/NV001/pin với body { pin: 1234 }
```

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                  Hina E-Comm (Web bán hàng)                  │
│                                                              │
│   [Admin] [Store] [NestJS API]  ──┐                         │
│       │              │             │                         │
└───────┼──────────────┼─────────────┼─────────────────────────┘
        │ publish      │ publish      │ HTTP
        │ event        │ event        │ webhook
        ▼              ▼             │
┌─────────────────────────────────────┼──────────────────────┐
│                  Redis pub/sub      │                       │
│            wms:event:*  ◄────────────┘                       │
│                  │                                          │
│                  ▼                                          │
│        ┌──────────────────┐                                 │
│        │   Hina WMS API   │  ──┐                            │
│        │  (NestJS+Prisma) │    │                            │
│        └────────┬─────────┘    │                            │
│                 │ atomic SQL   │ SSE                        │
│                 ▼              │ push                       │
│        ┌──────────────────┐    │                            │
│        │   PostgreSQL     │    │                            │
│        │  (SHARED DB)     │    │                            │
│        └──────────────────┘    │                            │
│                                ▼                            │
│                       ┌──────────────────┐                  │
│                       │   Hina WMS UI    │                  │
│                       │   (Next.js)      │                  │
│                       │  Mobile-friendly │                  │
│                       └──────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/auth/login` | Login email + password |
| `POST` | `/auth/pin-login` | Login nhanh bằng PIN |
| `GET`  | `/auth/me` | Thông tin user hiện tại |
| `GET`  | `/stock` | Danh sách tồn kho (search, filter) |
| `GET`  | `/stock/lookup/:code` | Tra cứu nhanh theo mã |
| `GET`  | `/stock/movements` | Lịch sử biến động |
| `GET`  | `/stock/alerts/low-stock` | Cảnh báo tồn thấp |
| `POST` | `/receipts` | Tạo phiếu nhập (DRAFT) |
| `POST` | `/receipts/items` | Thêm sản phẩm vào phiếu |
| `POST` | `/receipts/import` | Import hàng loạt từ CSV |
| `PATCH`| `/receipts/:id/confirm` | Xác nhận phiếu → cập nhật tồn |
| `GET`  | `/receipts` | Danh sách phiếu nhập |
| `GET`  | `/receipts/:id` | Chi tiết phiếu |
| `POST` | `/shipments/from-order` | Tạo shipment từ đơn hàng |
| `POST` | `/shipments/:id/start` | Bắt đầu pick |
| `POST` | `/shipments/:id/pick` | Pick 1 sản phẩm (quét barcode) |
| `PATCH`| `/shipments/:id/complete-pick` | Hoàn tất pick |
| `POST` | `/shipments/handover` | Bàn giao cho carrier |
| `GET`  | `/shipments` | Danh sách shipments |
| `GET`  | `/shipments/:id` | Chi tiết (kèm picklist) |
| `GET`  | `/sse/stream` | SSE endpoint |
| `POST` | `/webhook/hina` | Webhook từ hina-e-comm |

## Test

```bash
# Build + test
cd backend && npm run build

# Chạy e2e test (cần có data thật)
npx ts-node scripts/e2e-test.ts
```

## Tích hợp với hina-e-comm

Xem chi tiết tại [`integration/README.md`](integration/README.md).

Tóm tắt:
1. Copy `integration/hina-wms-sync.service.ts` vào `hina-e-comm/backend/src/common/`
2. Inject `HinaWmsSyncService` vào `ProductsService`, `InventoryService`, `OrdersService`
3. Gọi `publishEvent()` sau mỗi CRUD
4. Hina-e-comm publish lên Redis → WMS subscribe → tự động sync

## Luồng nghiệp vụ chính

### Nhập kho

```
1. Staff mở /receive
2. Chọn tab (Quét mã / Nhập tay / Upload file)
3. Thêm từng sản phẩm + số lượng
4. Bấm "Hoàn tất"
   → Server: tạo GoodsReceipt (DRAFT) → thêm items → confirm
   → Atomic: UPDATE Inventory.quantity += N
   → Ghi InventoryMovement(type=GOODS_RECEIPT, qty=+N)
   → Publish 'stock.changed' lên Redis
5. SSE push tới tất cả clients → UI tự refresh
```

### Xuất kho

```
1. Khách đặt đơn trên hina-e-comm
2. Hina-e-comm publish 'order.confirmed' (hoặc webhook)
3. WMS tạo OutboundShipment (PENDING) từ order items
4. Staff mở /ship → thấy đơn cần pick
5. Bấm "Bắt đầu pick" → PICKING
6. Quét từng sản phẩm trong picklist
   → Mỗi lần pick: pickedQuantity++
   → Khi đủ orderQuantity: atomic UPDATE Inventory.quantity -= N
7. "Hoàn tất pick" → PICKED
8. Nhập tên carrier + tracking → "Bàn giao" → HANDED_OVER
9. WMS update order.status = DELIVERED (trong hina-e-comm DB)
```

## Phát triển tiếp

- [ ] Thêm tính năng kiểm kê (stocktake)
- [ ] Thêm chuyển kho (inter-warehouse transfer)
- [ ] Thêm xử lý đổi/trả hàng (returns)
- [ ] Thêm in barcode/PDF cho nhãn kệ
- [ ] Mobile app (React Native) dùng chung API
- [ ] Báo cáo, thống kê theo tuần/tháng

## License

Private - thuộc về dự án hina-e-comm.

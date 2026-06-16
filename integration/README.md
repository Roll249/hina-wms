# Tích hợp Hina WMS với Hina E-Comm

> ⚠️ **Hina-WMS và Hina-E-Comm dùng CHUNG 1 PostgreSQL database và CHUNG 1 Redis instance.**
>
> Hai hệ thống mount chung DB → mọi thay đổi được sync real-time mà không cần API đồng bộ.

## Tổng quan kiến trúc

```
Hina-E-Comm (web)  ──┐                ┌── Hina-WMS (mobile)
   Products          │                │     Receipts
   Inventory  ───────┼──┐         ┌───┼──  OutboundShipment
   Orders            │  │         │   │     InventoryMovement
                     ▼  ▼         ▼   ▼
            ┌─────────────────────────────────┐
            │   PostgreSQL (CHUNG DATABASE)   │
            └─────────────────────────────────┘
                     ▲  ▲         ▲   ▲
            ┌─────────────────────────────────┐
            │   Redis (CHUNG) pub/sub + SSE  │
            └─────────────────────────────────┘
```

## Vì sao dùng chung DB?

**Lợi ích**:
- ✅ **Đồng bộ real-time, không cần API sync**: web update Product, WMS thấy ngay; WMS update Inventory, web thấy ngay
- ✅ **Không cần cron job, batch sync**: cùng row trong cùng table
- ✅ **Single source of truth**: chỉ 1 chỗ lưu `Inventory.quantity`, cả 2 hệ thống đều đọc/ghi vào đó
- ✅ **Foreign key works**: WMS `Receipt.productId` reference tới `Product.id` của e-comm mà không cần map

**Trade-off**:
- ⚠️ Schema changes của 1 bên có thể ảnh hưởng bên kia → cần discipline khi migration
- ⚠️ Cùng Prisma version, cùng migration runner

## Cài đặt tích hợp

### 1. Cùng Docker network

Hina-e-comm và Hina-WMS phải ở chung 1 Docker network (mặc định: `hina-network`):

```bash
docker network create hina-network
```

E-comm `docker-compose.yml` thêm:
```yaml
networks:
  default:
    name: hina-network
    external: true
```

WMS `docker-compose.yml` thêm (đã có sẵn):
```yaml
networks:
  hina-network:
    name: hina-network
    external: true
```

### 2. Cùng DATABASE_URL, REDIS_URL, JWT_SECRET

File `.env` của WMS phải khớp với `.env` của e-comm:

```bash
# E-comm
DATABASE_URL="postgresql://user:pass@postgres:5432/dbname?schema=public"
REDIS_URL="redis://:pass@redis:6379"
JWT_SECRET="same-secret"

# WMS (cùng giá trị)
DATABASE_URL="postgresql://user:pass@postgres:5432/dbname?schema=public"
REDIS_URL="redis://:pass@redis:6379"
JWT_SECRET="same-secret"
```

Lý do: 2 hệ thống đọc cùng DB, dùng cùng JWT secret để verify chéo (1 user login web, dùng token đó cho WMS).

### 3. Event sync qua Redis pub/sub (optional, cho real-time push)

Khi e-comm update tồn kho, web cần push event tới WMS UI để refresh. Dùng Redis pub/sub:

**E-comm side** (file `integration/hina-wms-sync.service.ts`):
```typescript
constructor(
  // ...existing
  private readonly hinaWmsSync: HinaWmsSyncService,
) {}

async adjustStock(...) {
  const updated = await this.adjustInventoryQuantity(...);
  // Publish event tới Redis - WMS EventBus sẽ subscribe
  await this.hinaWmsSync.publishEvent('stock.changed', {
    productId: updated.productId,
    variantId: updated.variantId,
    newQuantity: updated.quantity,
  });
}
```

**WMS side** (auto subscribe):
```typescript
// backend/src/common/events/event-bus.service.ts
@Injectable()
export class EventBusService {
  // Auto subscribe Redis channel 'hina:wms:events'
  // Khi có event 'stock.changed' → broadcast tới SSE clients
}
```

### 4. Webhook backup (cho production reliability)

Ngoài Redis pub/sub, có thể dùng HTTP webhook làm backup:

```typescript
// E-comm gọi webhook khi Redis fail
await fetch('http://hina-wms-backend:7777/webhook/hina', {
  method: 'POST',
  headers: { 'x-hina-webhook-secret': WEBHOOK_SECRET },
  body: JSON.stringify({ type: 'order.confirmed', payload: {...} }),
});
```

## Luồng dữ liệu chi tiết

### Đồng bộ sản phẩm (Product)

```
Hina-E-Comm
  │
  ├─ Admin tạo Product mới
  │   INSERT INTO "Product" ...
  │
  └─ Redis publish 'product.changed' ───┐
                                       │
Hina-WMS                                │
  │                                    │
  └─ EventBus subscribe ───────────────┘
     ├─ Update cache (nếu có)
     └─ SSE push tới UI: "Có sản phẩm mới, refresh"
```

**Lưu ý**: Vì chung DB, WMS query Product lúc nào cũng thấy data mới nhất. SSE chỉ để báo UI refresh.

### Đồng bộ tồn kho (Inventory)

```
Hina-E-Comm                          Hina-WMS
  │                                    │
  ├─ User đặt hàng                     │
  │   UPDATE "Inventory"               │
  │   SET quantity = quantity - 1      │
  │                                    │
  └─ Redis publish 'stock.changed' ────┐
                                       │
                                       ├─ SSE push tới UI: "Refresh stock"
                                       │
                                       └─ Nhân viên kho thấy tồn giảm
                                          ngay khi reload /stock
```

**Lưu ý**: Query SQL của 2 bên đều đọc cùng row → real-time không cần push (push chỉ là optimize để giảm polling).

### Đồng bộ đơn hàng (Order → OutboundShipment)

```
Hina-E-Comm                          Hina-WMS
  │                                    │
  ├─ Order status = CONFIRMED          │
  │   (thanh toán xong)                │
  │                                    │
  └─ Redis publish 'order.confirmed' ──┐
                                       │
                                       ├─ ShipmentsService.createFromOrder()
                                       │   INSERT INTO "OutboundShipment"
                                       │   INSERT INTO "OutboundShipmentItem"
                                       │
                                       └─ SSE push tới UI: "Có đơn mới"
```

### Đồng bộ nhân viên (User/WarehouseStaff)

```
Hina-E-Comm
  │
  ├─ Admin tạo User mới (role WAREHOUSE_STAFF)
  │   INSERT INTO "User" ...
  │   INSERT INTO "WarehouseStaff" ...  -- row mới (WMS schema)
  │
  └─ WMS thấy ngay (cùng table)
     └─ Nhân viên login WMS bằng employeeCode + PIN
```

## Schema tổng quan

```sql
-- E-Comm models (WMS đọc, ít khi ghi)
"Product"           -- sản phẩm
"ProductVariant"    -- biến thể
"Inventory"         -- tồn kho (cả 2 bên đều UPDATE)
"Order"             -- đơn hàng
"User"              -- user (admin/manage/staff)
"Category"          -- danh mục
"Brand"             -- thương hiệu
...

-- WMS models (WMS tạo và quản lý, e-comm đọc qua API)
"Warehouse"         -- kho vật lý
"WarehouseStaff"    -- nhân viên kho
"Receipt"           -- phiếu nhập
"ReceiptItem"       -- chi tiết phiếu nhập
"OutboundShipment"  -- phiếu xuất
"OutboundShipmentItem" -- chi tiết xuất
"InventoryMovement" -- log mọi biến động tồn kho
"WebhookEvent"      -- log webhook backup từ e-comm
```

## Vận hành

### Khi deploy production

1. **E-comm lên trước**: chạy migration của e-comm, sau đó WMS thêm migration của riêng nó
2. **WMS không tự ý ALTER bảng e-comm**: nếu cần thêm cột vào `Inventory` chẳng hạn, phải qua migration của e-comm trước
3. **Backup DB chung**: 1 cron job backup DB, cả 2 hệ thống dùng chung
4. **Monitoring**: monitor 1 PostgreSQL instance (không phải 2), 1 Redis instance

### Khi có sự cố

| Sự cố | Hậu quả | Cách debug |
|-------|---------|-----------|
| E-comm down | WMS vẫn hoạt động (đọc/ghi DB trực tiếp) | Restart e-comm |
| WMS down | E-comm vẫn hoạt động | Restart WMS |
| Redis down | SSE không push, nhưng query DB vẫn real-time | Restart Redis |
| DB down | Cả 2 cùng chết | Restore từ backup |
| Lệch schema | Foreign key error, query fail | `prisma db pull` cả 2 bên, so sánh |

## Tự động tạo shipment khi có order

WMS sẽ tự động tạo `OutboundShipment` khi nhận event `order.confirmed`:
- **Qua Redis pub/sub** (mặc định): nhanh, real-time
- **Qua webhook backup** (nếu Redis fail): đảm bảo không mất đơn

Nếu cả 2 đều không hoạt động, đơn hàng vẫn ở trạng thái CONFIRMED trong DB,
nhân viên kho có thể sync thủ công qua API `POST /shipments/from-order`.

## Code helper cho E-Comm side

File `hina-wms-sync.service.ts` (cùng folder với README này) chứa helper để
e-comm publish events sang WMS. Xem hướng dẫn cài đặt trong file.

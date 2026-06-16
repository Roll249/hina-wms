# Tích hợp Hina WMS với Hina E-Comm

File `hina-wms-sync.service.ts` chứa helper để hina-e-comm publish events sang WMS.

## Cài đặt trong hina-e-comm

### 1. Copy file

```bash
cp /home/khang/senkutech/hina-wms/integration/hina-wms-sync.service.ts \
   /home/khang/job/hina-e-comm/backend/src/common/hina-wms-sync/
```

### 2. Thêm vào AppModule

Sửa `/home/khang/job/hina-e-comm/backend/src/app.module.ts`:

```typescript
import { HinaWmsSyncService } from './common/hina-wms-sync/hina-wms-sync.service';
// ...

@Module({
  // ...existing
  providers: [..., HinaWmsSyncService],
})
export class AppModule {}
```

### 3. Thêm env

Sửa `/home/khang/job/hina-e-comm/backend/.env`:

```bash
# Cùng Redis với WMS
REDIS_URL=redis://localhost:6379

# Webhook backup
WMS_WEBHOOK_URL=http://localhost:7777
WMS_WEBHOOK_SECRET=change-me-shared-with-wms
```

### 4. Inject và gọi trong services

**products.service.ts** - sau khi CRUD product:

```typescript
constructor(
  // ...existing
  private readonly hinaWmsSync: HinaWmsSyncService,
) {}

async createProduct(...) {
  const product = await tx.product.create({ ... });
  await this.hinaWmsSync.publishEvent('product.changed', {
    productId: product.id,
    productCode: product.productCode,
    name: product.name,
    basePrice: product.basePrice,
  });
  return product;
}
```

**inventory.service.ts** - sau khi adjust stock:

```typescript
async adjustStock(...) {
  const updated = await this.adjustInventoryQuantity(...);
  await this.hinaWmsSync.publishEvent('stock.changed', {
    productId: updated.productId,
    variantId: updated.variantId,
    newQuantity: updated.quantity,
  });
}
```

**orders.service.ts** - khi order CONFIRMED:

```typescript
async updateStatus(...) {
  if (newStatus === 'CONFIRMED') {
    await this.hinaWmsSync.publishEvent('order.confirmed', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  }
}
```

## Luồng dữ liệu

```
Hina E-Comm                     WMS
===========                     ===

[products.service]
  └─publish 'product.changed'  →[EventBusService.subscribe] → SSE push to UI
                                                         
[orders.service]
  └─publish 'order.confirmed'  →[ShipmentsService.createFromOrder]
                                  └─tạo OutboundShipment
                                  └─SSE push to WMS UI

[inventory.service]
  └─publish 'stock.changed'    →[EventBusService.subscribe] → SSE push to WMS UI
```

## Tự động tạo shipment khi có order

WMS sẽ tự động tạo `OutboundShipment` khi nhận event `order.confirmed` (qua Webhook backup).
Nếu Redis hoạt động bình thường, EventBusService trong WMS cũng có thể subscribe `order.confirmed`
và gọi `ShipmentsService.createFromOrder` (cần bật tính năng này trong `event-bus.service.ts`).

Hiện tại, để đơn giản, việc tạo shipment được xử lý qua webhook endpoint `/webhook/hina` của WMS.

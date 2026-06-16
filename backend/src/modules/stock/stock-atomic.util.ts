import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

export type StockSelector =
  | { inventoryId: string }
  | { productId: string; variantId?: string | null };

/**
 * Tìm inventory theo selector. Nếu không tìm thấy, tạo mới với quantity=0.
 * Trả về inventoryId.
 */
export async function findOrCreateInventoryId(
  tx: Tx,
  selector: StockSelector,
): Promise<string> {
  if ('inventoryId' in selector) return selector.inventoryId;

  const { productId, variantId = null } = selector;

  // Ưu tiên variantId nếu có
  if (variantId) {
    const existing = await tx.inventory.findUnique({ where: { variantId } });
    if (existing) return existing.id;

    const created = await tx.inventory.create({
      data: { productId, variantId, quantity: 0, reservedQty: 0 },
    });
    return created.id;
  }

  // Chỉ productId (không có variant)
  const existing = await tx.inventory.findUnique({ where: { productId } });
  if (existing) return existing.id;

  const created = await tx.inventory.create({
    data: { productId, variantId: null, quantity: 0, reservedQty: 0 },
  });
  return created.id;
}

/**
 * Cộng dồn quantity (atomic SQL). Dùng cho nhập kho.
 * Không thay đổi reservedQty.
 */
export async function incrementInventory(
  tx: Tx,
  selector: StockSelector,
  quantity: number,
): Promise<{ id: string; quantity: number }> {
  if (quantity <= 0) throw new Error('quantity phải > 0');
  const inventoryId = await findOrCreateInventoryId(tx, selector);

  const rows = await tx.$queryRaw<Array<{ id: string; quantity: number }>>`
    UPDATE "Inventory"
    SET "quantity" = "quantity" + ${quantity}, "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
    RETURNING "id", "quantity"
  `;
  if (!rows[0]) throw new Error('Inventory không tồn tại');
  return rows[0];
}

/**
 * Trừ quantity để bán/xuất kho (atomic SQL). Dùng cho xuất kho theo picklist.
 * Check (quantity - reservedQty) >= yêu cầu.
 */
export async function decrementInventoryForShipment(
  tx: Tx,
  selector: StockSelector,
  quantity: number,
): Promise<{ id: string; quantity: number; reservedQty: number }> {
  if (quantity <= 0) throw new Error('quantity phải > 0');
  const inventoryId = await findOrCreateInventoryId(tx, selector);

  const rows = await tx.$queryRaw<
    Array<{ id: string; quantity: number; reservedQty: number }>
  >`
    UPDATE "Inventory"
    SET "quantity" = "quantity" - ${quantity}, "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
      AND ("quantity" - "reservedQty") >= ${quantity}
    RETURNING "id", "quantity", "reservedQty"
  `;
  if (!rows[0]) {
    throw new Error(`Không đủ tồn kho (yêu cầu: ${quantity})`);
  }
  return rows[0];
}

/**
 * Set quantity tuyệt đối. Check reservedQty <= newQuantity.
 */
export async function setInventoryQuantity(
  tx: Tx,
  selector: StockSelector,
  newQuantity: number,
): Promise<{ id: string; quantity: number }> {
  if (newQuantity < 0) throw new Error('quantity phải >= 0');
  const inventoryId = await findOrCreateInventoryId(tx, selector);

  const rows = await tx.$queryRaw<Array<{ id: string; quantity: number }>>`
    UPDATE "Inventory"
    SET "quantity" = ${newQuantity}, "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
      AND "reservedQty" <= ${newQuantity}
    RETURNING "id", "quantity"
  `;
  if (!rows[0]) {
    throw new Error('Số lượng mới phải >= số lượng đã đặt (reserved)');
  }
  return rows[0];
}

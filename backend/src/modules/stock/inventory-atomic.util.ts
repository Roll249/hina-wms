import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type InventoryRow = {
  id: string;
  quantity: number;
  reservedQty: number;
};

type InventoryDb = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  inventory: {
    findFirst(args: Prisma.InventoryFindFirstArgs): Promise<InventoryRow | null>;
    findUnique(args: Prisma.InventoryFindUniqueArgs): Promise<InventoryRow | null>;
  };
};

type InventorySelector = {
  productId?: string | null;
  variantId?: string | null;
  inventoryId?: string | null;
};

function selectorSql(selector: InventorySelector): Prisma.Sql {
  if (selector.inventoryId) {
    return Prisma.sql`"id" = ${selector.inventoryId}`;
  }
  if (selector.variantId) {
    return Prisma.sql`"variantId" = ${selector.variantId}`;
  }
  if (selector.productId) {
    return Prisma.sql`"productId" = ${selector.productId}`;
  }
  throw new BadRequestException('Either inventoryId, productId, or variantId is required');
}

async function findInventory(
  db: InventoryDb,
  selector: InventorySelector,
): Promise<InventoryRow | null> {
  if (selector.inventoryId) {
    return db.inventory.findUnique({
      where: { id: selector.inventoryId },
      select: { id: true, quantity: true, reservedQty: true },
    });
  }

  return db.inventory.findFirst({
    where: selector.variantId
      ? { variantId: selector.variantId }
      : { productId: selector.productId ?? undefined },
    select: { id: true, quantity: true, reservedQty: true },
  });
}

function insufficientStockMessage(
  inventory: InventoryRow,
  quantity: number,
  label = 'stock',
): string {
  const availableQty = inventory.quantity - inventory.reservedQty;
  return `Insufficient ${label}. Available: ${availableQty}, Requested: ${quantity}`;
}

export async function decrementAvailableInventory(
  db: InventoryDb,
  selector: InventorySelector,
  quantity: number,
  label?: string,
): Promise<InventoryRow> {
  const whereSql = selectorSql(selector);
  const rows = await db.$queryRaw<InventoryRow[]>(Prisma.sql`
    UPDATE "Inventory"
    SET "quantity" = "quantity" - ${quantity}, "updatedAt" = NOW()
    WHERE ${whereSql}
      AND ("quantity" - "reservedQty") >= ${quantity}
    RETURNING "id", "quantity", "reservedQty"
  `);

  if (rows[0]) {
    return rows[0];
  }

  const inventory = await findInventory(db, selector);
  if (!inventory) {
    throw new NotFoundException('Inventory not found');
  }
  throw new BadRequestException(insufficientStockMessage(inventory, quantity, label));
}

export async function incrementReservedInventory(
  db: InventoryDb,
  selector: InventorySelector,
  quantity: number,
): Promise<InventoryRow> {
  const whereSql = selectorSql(selector);
  const rows = await db.$queryRaw<InventoryRow[]>(Prisma.sql`
    UPDATE "Inventory"
    SET "reservedQty" = "reservedQty" + ${quantity}, "updatedAt" = NOW()
    WHERE ${whereSql}
      AND ("quantity" - "reservedQty") >= ${quantity}
    RETURNING "id", "quantity", "reservedQty"
  `);

  if (rows[0]) {
    return rows[0];
  }

  const inventory = await findInventory(db, selector);
  if (!inventory) {
    throw new NotFoundException('Inventory not found');
  }
  throw new BadRequestException(insufficientStockMessage(inventory, quantity));
}

export async function decrementReservedInventory(
  db: InventoryDb,
  inventoryId: string,
  quantity: number,
): Promise<InventoryRow> {
  const rows = await db.$queryRaw<InventoryRow[]>(Prisma.sql`
    UPDATE "Inventory"
    SET "reservedQty" = "reservedQty" - ${quantity}, "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
      AND "reservedQty" >= ${quantity}
    RETURNING "id", "quantity", "reservedQty"
  `);

  if (rows[0]) {
    return rows[0];
  }

  const inventory = await findInventory(db, { inventoryId });
  if (!inventory) {
    throw new NotFoundException('Inventory not found');
  }
  throw new BadRequestException(
    `Cannot release ${quantity} units. Only ${inventory.reservedQty} reserved.`,
  );
}

export async function decrementInventoryForSale(
  db: InventoryDb,
  inventoryId: string,
  quantity: number,
): Promise<InventoryRow> {
  const rows = await db.$queryRaw<InventoryRow[]>(Prisma.sql`
    UPDATE "Inventory"
    SET
      "quantity" = "quantity" - ${quantity},
      "reservedQty" = GREATEST("reservedQty" - ${quantity}, 0),
      "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
      AND "quantity" >= ${quantity}
    RETURNING "id", "quantity", "reservedQty"
  `);

  if (rows[0]) {
    return rows[0];
  }

  const inventory = await findInventory(db, { inventoryId });
  if (!inventory) {
    throw new NotFoundException('Inventory not found');
  }
  throw new BadRequestException(`Insufficient stock. Available: ${inventory.quantity}`);
}

export async function setInventoryQuantity(
  db: InventoryDb,
  inventoryId: string,
  quantity: number,
): Promise<InventoryRow> {
  const rows = await db.$queryRaw<InventoryRow[]>(Prisma.sql`
    UPDATE "Inventory"
    SET "quantity" = ${quantity}, "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
      AND "reservedQty" <= ${quantity}
    RETURNING "id", "quantity", "reservedQty"
  `);

  if (rows[0]) {
    return rows[0];
  }

  const inventory = await findInventory(db, { inventoryId });
  if (!inventory) {
    throw new NotFoundException('Inventory not found');
  }
  throw new BadRequestException(
    `Quantity cannot be lower than reserved stock (${inventory.reservedQty})`,
  );
}

export async function adjustInventoryQuantity(
  db: InventoryDb,
  inventoryId: string,
  delta: number,
): Promise<InventoryRow> {
  const rows = await db.$queryRaw<InventoryRow[]>(Prisma.sql`
    UPDATE "Inventory"
    SET "quantity" = "quantity" + ${delta}, "updatedAt" = NOW()
    WHERE "id" = ${inventoryId}
      AND ("quantity" + ${delta}) >= 0
      AND ("quantity" + ${delta}) >= "reservedQty"
    RETURNING "id", "quantity", "reservedQty"
  `);

  if (rows[0]) {
    return rows[0];
  }

  const inventory = await findInventory(db, { inventoryId });
  if (!inventory) {
    throw new NotFoundException('Inventory not found');
  }
  const nextQuantity = inventory.quantity + delta;
  if (nextQuantity < 0) {
    throw new BadRequestException('Resulting quantity cannot be negative');
  }
  throw new BadRequestException(
    `Resulting quantity cannot be lower than reserved stock (${inventory.reservedQty})`,
  );
}

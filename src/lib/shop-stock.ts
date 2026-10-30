// SHOP-4 (Cam 2026-10-30: "Low stock + receiving", "Yes, optional cost"): the pro
// shop's stock beyond a shelf count.
//
//  • Receive stock: a delivery adds to the count (an item not counted yet starts
//    counting at what came in) and is logged (ShopStockReceipt). A cost on the
//    delivery becomes the item's cost.
//  • Reorder point: an item at or below it is on the low-stock list.
//  • Cost: what one costs the course, for margin on the sales report. The owner
//    only sees or sets it (the route enforces that).
//
// Rows are sellable rows only — an item with options keeps its stock, cost and
// reorder point on each option (lib/shop-catalog).
import { prisma } from './prisma';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const MAX_QTY = 100_000;
const MAX_COST = 10_000_000; // $100,000

export type StockRow = { id: string; name: string; category: string; stockCount: number | null; reorderAt: number | null; costCents?: number | null; priceCents: number; low: boolean };

/** Pure: is this row low? Only a counted item with a reorder point can be. */
export const isLow = (r: { stockCount: number | null; reorderAt: number | null }) => r.stockCount !== null && r.reorderAt !== null && r.stockCount <= r.reorderAt;

/** A sellable row of this course (an option, or an item with no options). */
async function sellable(courseId: string, itemId: string) {
  const row = await prisma.shopItem.findFirst({ where: { id: itemId, courseId }, select: { id: true, name: true, active: true, _count: { select: { options: true } } } });
  if (!row) return fail(404, 'Item not found.');
  if (row._count.options > 0) return fail(400, 'Count stock on each option, not on the item.');
  return { ok: true as const, value: row };
}

/** Every counted or reorder-tracked sellable row, low ones first. Cost only when asked (the owner). */
export async function stockRows(courseId: string, opts: { cost: boolean }): Promise<StockRow[]> {
  const rows = await prisma.shopItem.findMany({
    where: { courseId, active: true, options: { none: {} }, OR: [{ parentId: null }, { parent: { active: true } }] },
    select: { id: true, name: true, category: true, stockCount: true, reorderAt: true, costCents: true, priceCents: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 2000,
  });
  return rows
    .map(({ costCents, ...r }) => ({ ...r, ...(opts.cost ? { costCents } : {}), low: isLow(r) }))
    .sort((a, b) => Number(b.low) - Number(a.low));
}

const whole = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/** A delivery: add to the shelf and log it. */
export async function receiveStock(courseId: string, itemId: string, input: { quantity: unknown; unitCostCents?: unknown; note?: unknown }, by: string, allowCost: boolean): Promise<Result<{ stockCount: number }>> {
  const q = whole(input.quantity, MAX_QTY);
  if (!q) return fail(400, 'Enter how many came in.');
  let cost: number | null = null;
  if (input.unitCostCents !== undefined && input.unitCostCents !== null && input.unitCostCents !== '') {
    if (!allowCost) return fail(403, 'Only the course owner can enter costs.');
    cost = whole(input.unitCostCents, MAX_COST);
    if (cost === null) return fail(400, 'Enter the cost of one, up to $100,000.');
  }
  const row = await sellable(courseId, itemId);
  if (!row.ok) return row;
  const note = String(input.note ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const stockCount = await prisma.$transaction(async tx => {
    // Not counted yet: counting starts at what came in. Atomic, so a sale at the same moment isn't lost.
    await tx.shopItem.updateMany({ where: { id: itemId, courseId, stockCount: null }, data: { stockCount: 0 } });
    const it = await tx.shopItem.update({ where: { id: itemId }, data: { stockCount: { increment: q }, ...(cost !== null ? { costCents: cost } : {}) }, select: { stockCount: true } });
    await tx.shopStockReceipt.create({ data: { courseId, shopItemId: itemId, quantity: q, unitCostCents: cost, note, receivedBy: by.slice(0, 200) } });
    return it.stockCount ?? q;
  });
  return { ok: true, value: { stockCount } };
}

/** The reorder point: a whole number, or blank for no alert. */
export async function setReorder(courseId: string, itemId: string, raw: unknown): Promise<Result<null>> {
  const v = raw === null || raw === '' || raw === undefined ? null : whole(raw, MAX_QTY);
  if (v === null && raw !== null && raw !== '' && raw !== undefined) return fail(400, 'Reorder at a whole number, or blank for no alert.');
  const row = await sellable(courseId, itemId);
  if (!row.ok) return row;
  await prisma.shopItem.updateMany({ where: { id: itemId, courseId }, data: { reorderAt: v } });
  return { ok: true, value: null };
}

/** What one costs (the owner only — the route checks). Blank clears it. */
export async function setCost(courseId: string, itemId: string, raw: unknown): Promise<Result<null>> {
  const v = raw === null || raw === '' || raw === undefined ? null : whole(raw, MAX_COST);
  if (v === null && raw !== null && raw !== '' && raw !== undefined) return fail(400, 'Enter the cost of one, up to $100,000, or blank.');
  const row = await sellable(courseId, itemId);
  if (!row.ok) return row;
  await prisma.shopItem.updateMany({ where: { id: itemId, courseId }, data: { costCents: v } });
  return { ok: true, value: null };
}

/** The last deliveries, newest first. Cost only for the owner. */
export async function recentReceipts(courseId: string, opts: { cost: boolean }, take = 30) {
  const rows = await prisma.shopStockReceipt.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take, select: { id: true, quantity: true, unitCostCents: true, note: true, receivedBy: true, createdAt: true, shopItem: { select: { name: true } } } });
  return rows.map(({ unitCostCents, shopItem, createdAt, ...r }) => ({ ...r, name: shopItem.name, createdAt: createdAt.toISOString(), ...(opts.cost ? { unitCostCents } : {}) }));
}

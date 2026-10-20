// @brain pro-shop
// POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): the pro-shop catalog and
// items added to a round. Items are charged WITH the round — at check-in or on
// the golfer's pay link — plus GreenReserve's fee: $0.50 per sale ("per sale
// not item"), paid by the golfer ("our whole thing is free for course"), taken
// as part of the same charge's application fee.
//
// Booking.totalAmount stays the ROUND's own price everywhere (revenue, partial
// party, moves). The card charge for a round is roundChargeCents(): the round
// plus shopTotalCents plus shopFeeCents. Every charge, refund and receipt path
// reads these two helpers instead of totalAmount / accessFeeTotal alone.
import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';
import { SHOP_SALE_FEE_CENTS, SHOP_FEE_ON } from './booking-fees';

export { SHOP_SALE_FEE_CENTS, SHOP_FEE_ON };
export const MAX_ITEM_PRICE_CENTS = 1_000_000; // $10,000 — a typo guard, not a business rule
export const MAX_LINE_QUANTITY = 99;
/** Most shop items one booking can carry ($10,000) — a typo / abuse guard. */
export const MAX_BOOKING_SHOP_CENTS = 1_000_000;

/** GreenReserve's fee on a round's shop items: one sale per booking — 0 while SHOP_FEE_ON is off. */
export function shopFeeFor(shopTotalCents: number, on: boolean = SHOP_FEE_ON): number {
  return on && shopTotalCents > 0 ? SHOP_SALE_FEE_CENTS : 0;
}

/** What the round's card charge takes: the round, its shop items and their fee. */
export function roundChargeCents(b: { totalAmount: number; shopTotalCents?: number | null; shopFeeCents?: number | null }): number {
  return Math.round(b.totalAmount) + (b.shopTotalCents ?? 0) + (b.shopFeeCents ?? 0);
}

/** What the round's card charge actually took — the stored PaymentIntent amount
 *  when there is one (refunds and receipts cap against this), else the computed total. */
export function roundChargedTotal(b: { totalAmount: number; shopTotalCents?: number | null; shopFeeCents?: number | null; roundChargedCents?: number | null }): number {
  return b.roundChargedCents ?? roundChargeCents(b);
}

/** GreenReserve's part of that charge: the booking fee plus the shop fee. */
export function roundApplicationFeeCents(b: { accessFeeTotal: number; shopFeeCents?: number | null }): number {
  return Math.round(b.accessFeeTotal) + (b.shopFeeCents ?? 0);
}

/**
 * Why a booking's shop items cannot change, or null. Items ride the round's
 * charge, so they can only change before that charge: once paid (card, or the
 * counter), checked in or cancelled, a sale is a counter sale (POS-1b).
 */
export function shopLockedReason(b: { status: string; paymentStatus: string; roundPaymentIntentId: string; paidOffline: boolean; shopLockedAt?: Date | string | null }): string | null {
  if (b.status === 'cancelled') return 'This booking was cancelled.';
  if (b.status === 'completed' || b.paidOffline) return 'This group has already checked in and paid — ring it up as a separate sale.';
  if (b.roundPaymentIntentId && (b.paymentStatus === 'paid' || b.paymentStatus === 'refunded')) return 'This round is already paid — ring it up as a separate sale.';
  // Security review: a charge has been attempted (it may be in flight right
  // now, or its answer was lost). The items it carried are what it charged.
  if (b.shopLockedAt) return 'A payment for this round has been started — ring extra items up as a separate sale.';
  return null;
}

export function validItemInput(body: { name?: unknown; category?: unknown; priceCents?: unknown }): { name: string; category: string; priceCents: number } | string {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return 'Give the item a name.';
  if (name.length > 80) return 'Keep the name under 80 characters.';
  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 40) : '';
  const priceCents = Number(body.priceCents);
  if (!Number.isInteger(priceCents) || priceCents <= 0) return 'Enter a price above $0.';
  if (priceCents > MAX_ITEM_PRICE_CENTS) return 'That price is over $10,000 — check it.';
  return { name, category, priceCents };
}

/**
 * POS-2: move an item's shelf count by `quantity` (negative puts it back).
 * Items nobody counts (stockCount null) are left alone; a count may go below
 * zero — it never blocks a sale, the shelf is the truth.
 */
export async function takeStock(tx: Prisma.TransactionClient, shopItemId: string, quantity: number) {
  if (!quantity) return;
  await tx.shopItem.updateMany({ where: { id: shopItemId, stockCount: { not: null } }, data: { stockCount: { decrement: quantity } } });
}

/** Re-total a booking's shop lines onto the booking. Call inside the write's transaction. */
async function retotal(tx: Prisma.TransactionClient, bookingId: string) {
  const lines = await tx.bookingShopItem.findMany({ where: { bookingId }, select: { unitPriceCents: true, quantity: true } });
  const shopTotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  if (shopTotalCents > MAX_BOOKING_SHOP_CENTS) throw new ShopCapError();
  const shopFeeCents = shopFeeFor(shopTotalCents);
  await tx.booking.update({ where: { id: bookingId }, data: { shopTotalCents, shopFeeCents } });
  return { shopTotalCents, shopFeeCents };
}

const LOCK_FIELDS = { courseId: true, status: true, paymentStatus: true, roundPaymentIntentId: true, paidOffline: true, shopLockedAt: true } as const;

class ShopCapError extends Error {}
const CAP_RESULT = { ok: false, status: 409, error: 'That would put more than $10,000 of shop items on one booking — ring it up as a separate sale.' } as const;

/**
 * Security review: lock the booking row for the rest of the transaction, so two
 * writes (a double tap, two staff) cannot each re-total without the other's
 * line, and a charge starting now waits for this write and sees its result.
 */
async function lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
}

export type ShopWriteResult =
  | { ok: true; shopTotalCents: number; shopFeeCents: number }
  | { ok: false; status: number; error: string };

/** Add `quantity` of a catalog item to a booking at this course. */
export async function addItemToBooking(courseId: string, bookingId: string, shopItemId: string, quantity: number, addedBy: string): Promise<ShopWriteResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return { ok: false, status: 400, error: `Quantity must be 1 to ${MAX_LINE_QUANTITY}.` };
  return prisma.$transaction(async tx => {
    await lockBooking(tx, bookingId);
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: LOCK_FIELDS });
    // Tenant isolation: another course's booking reads exactly like a missing one.
    if (!b || b.courseId !== courseId) return { ok: false, status: 404, error: 'Booking not found.' } as const;
    const locked = shopLockedReason(b);
    if (locked) return { ok: false, status: 409, error: locked } as const;
    const item = await tx.shopItem.findUnique({ where: { id: shopItemId }, include: { _count: { select: { options: true } }, parent: { select: { active: true } } } });
    if (!item || item.courseId !== courseId || !item.active || (item.parent && !item.parent.active)) return { ok: false, status: 404, error: 'That item is not in your shop.' } as const;
    // W2-7: an item with sizes/colors is sold by its option, never itself.
    if (item._count.options > 0) return { ok: false, status: 400, error: 'Pick a size or color for that item.' } as const;
    await tx.bookingShopItem.create({ data: { bookingId, shopItemId: item.id, name: item.name, unitPriceCents: item.priceCents, quantity, addedBy } });
    await takeStock(tx, item.id, quantity);
    return { ok: true, ...(await retotal(tx, bookingId)) } as const;
  }).catch(e => { if (e instanceof ShopCapError) return CAP_RESULT; throw e; });
}

/** Remove one line from a booking at this course. */
export async function removeLineFromBooking(courseId: string, bookingId: string, lineId: string): Promise<ShopWriteResult> {
  return prisma.$transaction(async tx => {
    await lockBooking(tx, bookingId);
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: LOCK_FIELDS });
    if (!b || b.courseId !== courseId) return { ok: false, status: 404, error: 'Booking not found.' } as const;
    const locked = shopLockedReason(b);
    if (locked) return { ok: false, status: 409, error: locked } as const;
    const line = await tx.bookingShopItem.findFirst({ where: { id: lineId, bookingId }, select: { shopItemId: true, quantity: true } });
    if (!line) return { ok: false, status: 404, error: 'That item is not on this booking.' } as const;
    await tx.bookingShopItem.delete({ where: { id: lineId } });
    if (line.shopItemId) await takeStock(tx, line.shopItemId, -line.quantity);
    return { ok: true, ...(await retotal(tx, bookingId)) } as const;
  });
}

export type ShopLine = { id: string; name: string; unitPriceCents: number; quantity: number };

/** A booking's lines for a receipt or the tee-sheet panel, oldest first. */
export async function shopLinesFor(bookingId: string): Promise<ShopLine[]> {
  return prisma.bookingShopItem.findMany({
    where: { bookingId }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, unitPriceCents: true, quantity: true },
  });
}

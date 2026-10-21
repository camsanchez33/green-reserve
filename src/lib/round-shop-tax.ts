// W2-7 part B2 (Cam 2026-10-20: sales tax "based by state … we will follow those
// tax laws"): pro-shop items added to a ROUND are taxed like walk-up sales
// (lib/sales-tax.ts) — Stripe Tax on the course's own account, at the course's
// address, by each item's tax category — and the tax rides the round's charge
// (roundChargeCents in lib/shop.ts). Green fees, carts and the booking fee are
// not taxed here.
//
// ensureShopTax() is the ONE way a booking's shop tax is set. It quotes Stripe
// only when the lines changed, the quote is near expiry, or the course turned
// tax on/off — and never once a charge has started or the round is paid (the
// charge and the record must agree). Every screen that shows the round's total
// and every charge calls it first. Server only.
import { prisma } from './prisma';
import { quoteShopTax, type TaxLine } from './sales-tax';
import { stripe } from './stripe';

type Line = { id: string; unitPriceCents: number; quantity: number; taxCategory: string };

/** The lines a quote was made for — a quote is current only for exactly these. */
export function shopTaxKey(lines: Line[]): string {
  return lines.map(l => `${l.id}:${l.unitPriceCents}:${l.quantity}:${l.taxCategory}`).sort().join('|');
}

/** Stripe keeps a calculation recordable for 90 days; re-quote a day before. */
const EXPIRY_MARGIN_MS = 24 * 3600 * 1000;

export type EnsureResult = { ok: true; shopTaxCents: number } | { ok: false; error: string };
export const TAX_UNAVAILABLE = 'Couldn’t work out sales tax on the shop items just now — try again in a minute.';

/**
 * A charge has started or the round is paid: the tax on it is final. `ownLock`
 * is the charge's own shopLockedAt stamp — the charge freezes the items FIRST,
 * then quotes under its own lock, so the quote and the charge see the same lines.
 */
function frozen(b: { status: string; paymentStatus: string; paidOffline: boolean; shopLockedAt: Date | null }, ownLock?: Date) {
  const lockedByOther = !!b.shopLockedAt && !(ownLock && b.shopLockedAt.getTime() === ownLock.getTime());
  return lockedByOther || b.paidOffline || b.status !== 'confirmed' || b.paymentStatus === 'paid' || b.paymentStatus === 'refunded';
}

const SELECT = {
  courseId: true, status: true, paymentStatus: true, paidOffline: true, shopLockedAt: true,
  shopTaxCents: true, shopTaxCalculationId: true, shopTaxKey: true, shopTaxExpiresAt: true,
  course: { select: { shopTaxOn: true } },
  shopItems: { select: { id: true, unitPriceCents: true, quantity: true, taxCategory: true } },
} as const;

/**
 * Make the booking's shop tax match its lines now. Returns the tax in cents.
 * Fails (never throws) only when Stripe can't be reached for a needed quote —
 * the caller then must not take a card payment on a stale figure.
 */
export async function ensureShopTax(bookingId: string, opts?: { ownLock?: Date }): Promise<EnsureResult> {
  const ownLock = opts?.ownLock;
  for (let attempt = 0; attempt < 3; attempt++) {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: SELECT });
    if (!b) return { ok: true, shopTaxCents: 0 };
    // A charge that finds another attempt's lock stops rather than charge on a figure it didn't check.
    if (ownLock && b.shopLockedAt && b.shopLockedAt.getTime() !== ownLock.getTime()) return { ok: false, error: 'This round is being charged right now from another screen — wait a moment and refresh.' };
    if (frozen(b, ownLock)) return { ok: true, shopTaxCents: b.shopTaxCents };
    const lines = b.shopItems;
    const key = shopTaxKey(lines);
    const want = b.course.shopTaxOn && lines.length > 0;
    if (!want) {
      if (!b.shopTaxCents && !b.shopTaxCalculationId) return { ok: true, shopTaxCents: 0 };
      if (await write(bookingId, key, { shopTaxCents: 0, shopTaxCalculationId: '', shopTaxKey: '', shopTaxExpiresAt: null }, ownLock)) return { ok: true, shopTaxCents: 0 };
      continue;
    }
    const fresh = b.shopTaxCalculationId && b.shopTaxKey === key && b.shopTaxExpiresAt && b.shopTaxExpiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS;
    if (fresh) return { ok: true, shopTaxCents: b.shopTaxCents };
    let quote;
    try {
      const taxLines: TaxLine[] = lines.map(l => ({ reference: l.id, amountCents: l.unitPriceCents * l.quantity, quantity: l.quantity, category: l.taxCategory }));
      quote = await quoteShopTax(b.courseId, taxLines);
    } catch (err) {
      console.error(JSON.stringify({ ev: 'round_shop_tax.quote.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
      return { ok: false, error: TAX_UNAVAILABLE };
    }
    if (await write(bookingId, key, { shopTaxCents: quote.taxCents, shopTaxCalculationId: quote.calculationId, shopTaxKey: key, shopTaxExpiresAt: quote.expiresAt ?? null }, ownLock)) {
      return { ok: true, shopTaxCents: quote.taxCents };
    }
    // The lines changed (or a charge started) while Stripe answered — look again.
  }
  return { ok: false, error: TAX_UNAVAILABLE };
}

/** Write the tax only if the lines are still the ones quoted and no charge has started. */
async function write(bookingId: string, key: string, data: { shopTaxCents: number; shopTaxCalculationId: string; shopTaxKey: string; shopTaxExpiresAt: Date | null }, ownLock?: Date): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const now = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true, paymentStatus: true, paidOffline: true, shopLockedAt: true, shopItems: { select: { id: true, unitPriceCents: true, quantity: true, taxCategory: true } } } });
    if (!now || frozen(now, ownLock) || shopTaxKey(now.shopItems) !== key) return false;
    await tx.booking.update({ where: { id: bookingId }, data });
    return true;
  });
}

/**
 * Record a paid round's shop tax on the course's account, once (the booking id
 * is the transaction reference, which Stripe keeps unique). Paid = checked in
 * and charged, paid on the pay link, or paid at the counter. Never throws; the
 * hourly cron retries any it missed.
 */
export async function recordRoundShopTax(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true, paymentStatus: true, paidOffline: true, shopTaxCents: true, shopTaxCalculationId: true, shopTaxTransactionId: true, shopTaxKey: true, course: { select: { stripeAccountId: true } }, shopItems: { select: { id: true, unitPriceCents: true, quantity: true, taxCategory: true } } } });
  if (!b || !b.shopTaxCalculationId || b.shopTaxTransactionId || !b.course.stripeAccountId) return;
  if (!(b.paymentStatus === 'paid' || b.paidOffline)) return;
  // Never record a quote made for different lines (a counter payment while Stripe was down).
  if (shopTaxKey(b.shopItems) !== b.shopTaxKey) {
    console.error(JSON.stringify({ ev: 'round_shop_tax.record.stale_quote', bookingId }));
    return;
  }
  try {
    const tx = await stripe.tax.transactions.createFromCalculation(
      { calculation: b.shopTaxCalculationId, reference: `round-shop-${bookingId}`, metadata: { bookingId } },
      { stripeAccount: b.course.stripeAccountId, idempotencyKey: `tax-tx-round-shop-${bookingId}` },
    );
    await prisma.booking.update({ where: { id: bookingId }, data: { shopTaxTransactionId: tx.id } });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'round_shop_tax.record.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
  }
}

/** Hourly: record shop tax for paid rounds still missing their record. */
export async function recordPendingRoundShopTax(limit = 50): Promise<number> {
  const pending = await prisma.booking.findMany({
    // An expired calculation can never be recorded — leave it out (it's logged when it fails) so it can't starve the rest.
    where: { shopTaxCalculationId: { not: '' }, shopTaxTransactionId: '', AND: [{ OR: [{ paymentStatus: 'paid' }, { paidOffline: true }] }, { OR: [{ shopTaxExpiresAt: null }, { shopTaxExpiresAt: { gte: new Date() } }] }] },
    select: { id: true }, take: limit, orderBy: { paidAt: 'asc' },
  });
  for (const b of pending) await recordRoundShopTax(b.id);
  return pending.length;
}

/**
 * The course turned sales tax on or off: bring every open round with shop
 * items up to date, so the tee sheet shows what a check-in will charge.
 * Best effort — a round Stripe can't quote now is quoted again before it's paid.
 */
export async function refreshOpenRoundShopTax(courseId: string, limit = 200): Promise<void> {
  const open = await prisma.booking.findMany({
    where: { courseId, status: 'confirmed', shopTotalCents: { gt: 0 }, shopLockedAt: null },
    select: { id: true }, take: limit, orderBy: { createdAt: 'asc' },
  });
  for (const b of open) await ensureShopTax(b.id);
}

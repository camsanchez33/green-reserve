// POS-2 (Cam 2026-10-19: the pro shop, "everything"): walk-up sales — items
// sold at the counter with no round attached. Paid in cash (recorded, no
// charge) or by a pay link the customer opens on their phone, which is a
// direct charge on the course's own Stripe account, exactly like a round.
// GreenReserve takes nothing on a sale while SHOP_FEE_ON is false.
//
// One status machine, every write conditional on the status it expects:
//   open ──(cash)──────────────▶ paid_cash
//   open ──(card claimed)──▶ paying ──(charged)──▶ paid_card
//                              └──(declined)──▶ open
//   open ──(void)──────────────▶ void
// Void / took-cash only take an 'open' sale and cancel its PaymentIntent
// first; a charge that then finds the intent canceled stops ("ask for a new
// link"). A charge claims the sale first, so two taps cannot both charge, and
// the sale has ONE PaymentIntent, so a retry can never charge twice.
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import Stripe from 'stripe';
import { stripe } from './stripe';
import { MAX_ITEM_PRICE_CENTS, MAX_LINE_QUANTITY, takeStock, shopFeeFor } from './shop';

export const MAX_SALE_CENTS = 1_000_000; // $10,000 — a typo guard
export const MAX_SALE_LINES = 40;
/** A claim this old belongs to a request that is gone (longer than any function run). The sale's single PaymentIntent keeps a retry to one charge either way. */
export const STALE_CHARGE_MS = 10 * 60 * 1000;

export type SaleLineInput = { shopItemId: string; quantity: number };
export type SaleView = {
  id: string; status: string; totalCents: number; createdAt: string; paidAt: string | null;
  customerName: string; customerPhone: string; customerEmail: string; soldBy: string;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
};

export const saleView = (s: {
  id: string; status: string; totalCents: number; createdAt: Date; paidAt: Date | null;
  customerName: string; customerPhone: string; customerEmail: string; soldBy: string;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
}): SaleView => ({
  id: s.id, status: s.status, totalCents: s.totalCents, createdAt: s.createdAt.toISOString(), paidAt: s.paidAt?.toISOString() ?? null,
  customerName: s.customerName, customerPhone: s.customerPhone, customerEmail: s.customerEmail, soldBy: s.soldBy,
  lines: s.lines.map(l => ({ name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
});

const LINES = { select: { name: true, unitPriceCents: true, quantity: true }, orderBy: { id: 'asc' as const } };

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

/** Ring up a sale. Cash is paid on the spot; a link sale waits for the customer. */
export async function createSale(opts: {
  courseId: string; lines: unknown; pay: 'cash' | 'link'; soldBy: string;
  customerName?: string; customerPhone?: string; customerEmail?: string;
}): Promise<Result<SaleView & { payToken: string }>> {
  if (!Array.isArray(opts.lines) || opts.lines.length === 0) return fail(400, 'Add at least one item.');
  if (opts.lines.length > MAX_SALE_LINES) return fail(400, `A sale can have up to ${MAX_SALE_LINES} lines.`);
  const wanted = new Map<string, number>();
  for (const l of opts.lines as Record<string, unknown>[]) {
    const id = typeof l?.shopItemId === 'string' ? l.shopItemId : '';
    const q = Number(l?.quantity);
    if (!id || !Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) return fail(400, `Each line needs an item and a quantity of 1 to ${MAX_LINE_QUANTITY}.`);
    wanted.set(id, (wanted.get(id) ?? 0) + q);
  }
  for (const q of wanted.values()) if (q > MAX_LINE_QUANTITY) return fail(400, `Quantity must be 1 to ${MAX_LINE_QUANTITY}.`);
  // Tenant isolation: only this course's active items, priced from the catalog — never from the client.
  const items = await prisma.shopItem.findMany({ where: { id: { in: [...wanted.keys()] }, courseId: opts.courseId, active: true } });
  if (items.length !== wanted.size) return fail(404, 'One of those items is not in your shop any more — refresh and try again.');
  const lines = items.map(i => ({ shopItemId: i.id, name: i.name, unitPriceCents: i.priceCents, quantity: wanted.get(i.id)! }));
  if (lines.some(l => l.unitPriceCents <= 0 || l.unitPriceCents > MAX_ITEM_PRICE_CENTS)) return fail(400, 'An item has a price that needs fixing in Settings → Pro shop.');
  const totalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  if (totalCents > MAX_SALE_CENTS) return fail(400, 'That sale is over $10,000 — check the quantities.');
  if (opts.pay === 'link' && shopFeeFor(totalCents) > 0) return fail(400, 'Walk-up pay links are not set up for the shop fee yet.');

  const name = String(opts.customerName ?? '').trim().slice(0, 80);
  const phone = String(opts.customerPhone ?? '').trim().slice(0, 30);
  const email = String(opts.customerEmail ?? '').trim().toLowerCase().slice(0, 200);
  const payToken = opts.pay === 'link' ? randomUUID() : '';
  const sale = await prisma.$transaction(async tx => {
    const s = await tx.shopSale.create({
      data: {
        courseId: opts.courseId, totalCents, soldBy: opts.soldBy, customerName: name, customerPhone: phone, customerEmail: email, payToken,
        status: opts.pay === 'cash' ? 'paid_cash' : 'open', paidAt: opts.pay === 'cash' ? new Date() : null,
        lines: { create: lines },
      },
      include: { lines: LINES },
    });
    // Cash leaves the shelf now; a link sale only when it is paid.
    if (opts.pay === 'cash') for (const l of lines) await takeStock(tx, l.shopItemId, l.quantity);
    return s;
  });
  return { ok: true, value: { ...saleView(sale), payToken } };
}

/** Why staff can't void or take cash for a sale in this status. */
export const whyNotOpen = (status: string) =>
  status === 'paying' ? 'The customer is paying right now — wait a moment and refresh.'
    : status === 'paid_card' ? 'This sale is already paid by card.'
    : status === 'paid_cash' ? 'This sale is already paid in cash.'
    : 'This sale was voided.';

/** Void an unpaid link sale, or take cash for it at the counter instead. */
export async function settleOpenSale(courseId: string, saleId: string, to: 'void' | 'paid_cash'): Promise<Result<SaleView>> {
  return prisma.$transaction(async tx => {
    const done = await tx.shopSale.updateMany({
      where: { id: saleId, courseId, status: 'open' },
      // The token stays: the customer's page then says the sale was paid or cancelled.
      data: to === 'void' ? { status: 'void', voidedAt: new Date() } : { status: 'paid_cash', paidAt: new Date() },
    });
    const sale = await tx.shopSale.findFirst({ where: { id: saleId, courseId }, include: { lines: { select: { name: true, unitPriceCents: true, quantity: true, shopItemId: true }, orderBy: { id: 'asc' } } } });
    if (!sale) return fail(404, 'Sale not found.');
    if (done.count === 0) return fail(409, whyNotOpen(sale.status));
    if (to === 'paid_cash') for (const l of sale.lines) if (l.shopItemId) await takeStock(tx, l.shopItemId, l.quantity);
    return { ok: true as const, value: saleView(sale) };
  });
}

/** What the customer's pay page shows. Null unless the token matches an open (or just-paid) sale. */
export async function saleForPayPage(saleId: string, token: string) {
  if (!token) return null;
  const sale = await prisma.shopSale.findUnique({
    where: { id: saleId },
    include: { lines: LINES, course: { select: { name: true, brandColor: true, logoUrl: true, stripeAccountId: true, stripeAccountActive: true } } },
  });
  if (!sale || !sale.payToken || sale.payToken !== token) return null;
  return sale;
}

/**
 * The customer pays a link sale with a card or wallet.
 *
 * Security review (2026-10-19): ONE PaymentIntent per sale, on the course's
 * account, created once (idempotency key per sale) and stored on the sale.
 * Every attempt confirms that same intent with the new card. Stripe lets a
 * PaymentIntent succeed only once, so a retry after a timeout, a second tab or
 * a reclaimed stale claim can never become a second charge — no search index
 * and no per-card key is relied on. The card is a platform PaymentMethod from
 * the page (as on the round pay link), attached to a throwaway platform
 * Customer and cloned onto the course's account.
 */
export async function chargeSale(saleId: string, token: string, paymentMethodId: string, expectedTotalCents: number): Promise<Result<{ status: 'paid_card' | 'processing' }>> {
  const sale = await saleForPayPage(saleId, token);
  if (!sale) return fail(404, 'This pay link is not valid any more. Ask the pro shop for a new one.');
  if (sale.status === 'paid_card' || sale.status === 'paid_cash') return fail(409, 'This sale is already paid. Thank you!');
  if (sale.status === 'void') return fail(409, 'The pro shop cancelled this sale.');
  if (!sale.course.stripeAccountId || !sale.course.stripeAccountActive) return fail(409, 'This course can’t take card payments yet — please pay at the pro shop.');
  if (Number(expectedTotalCents) !== sale.totalCents) return fail(409, 'The total changed since this page loaded — refresh to see it.');
  if (typeof paymentMethodId !== 'string' || !paymentMethodId.startsWith('pm_')) return fail(400, 'Card details are missing — try again.');
  const account = sale.course.stripeAccountId;

  // Claim: open, or a claim old enough that its request must be gone.
  const now = new Date();
  const claimed = await prisma.shopSale.updateMany({
    where: { id: saleId, payToken: token, OR: [{ status: 'open' }, { status: 'paying', chargeStartedAt: { lt: new Date(now.getTime() - STALE_CHARGE_MS) } }] },
    data: { status: 'paying', chargeStartedAt: now },
  });
  if (claimed.count === 0) return fail(409, 'A payment for this sale is already going through — wait a moment and refresh.');
  // Back to open ONLY when Stripe has definitely not taken the money.
  const release = () => prisma.shopSale.updateMany({ where: { id: saleId, status: 'paying', chargeStartedAt: now }, data: { status: 'open', chargeStartedAt: null } });
  const unsure = fail(502, 'We couldn’t confirm the payment. Please don’t pay again — wait a few minutes and reopen this link, or ask the pro shop.');

  // The sale's one PaymentIntent.
  let pi;
  try {
    pi = await saleIntent(saleId, sale.paymentIntentId, sale.totalCents, sale.course.name, account);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'shop_sale.intent.fail', saleId, error: err instanceof Error ? err.message : String(err) }));
    await release(); // nothing can have been charged without an intent
    return fail(502, 'Card payments are not working right now — please pay at the pro shop.');
  }
  if (pi.status === 'succeeded') { await markCardPaid(saleId, now, pi.id); return { ok: true, value: { status: 'paid_card' } }; }
  if (pi.status === 'processing') return { ok: true, value: { status: 'processing' } };
  // The pro shop stopped this link (took cash or voided while it was open).
  if (pi.status === 'canceled') { await release(); return fail(409, 'The pro shop closed this pay link — ask them for a new one, or pay there.'); }

  let clonedId: string;
  try {
    const customer = await stripe.customers.create({ email: sale.customerEmail || undefined, name: sale.customerName || undefined, metadata: { shopSaleId: saleId, source: 'shop_walk_up' } });
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    const cloned = await stripe.paymentMethods.create({ customer: customer.id, payment_method: paymentMethodId }, { stripeAccount: account, idempotencyKey: `${pi.id}-${paymentMethodId}-pm` });
    clonedId = cloned.id;
  } catch (err) {
    await release(); // the intent has not been confirmed with this card
    return fail(402, err instanceof Stripe.errors.StripeCardError ? (err.message || 'That card can’t be used — try another.') : 'That card can’t be used — try another, or pay at the pro shop.');
  }

  try {
    console.log(JSON.stringify({ ev: 'shop_sale.charge.attempt', saleId, paymentIntentId: pi.id, amountCents: sale.totalCents }));
    const done = await stripe.paymentIntents.confirm(pi.id, { payment_method: clonedId, off_session: true }, { stripeAccount: account, idempotencyKey: `${pi.id}-${paymentMethodId}-confirm` });
    if (done.status === 'succeeded') { await markCardPaid(saleId, now, done.id); return { ok: true, value: { status: 'paid_card' } }; }
    if (done.status === 'requires_payment_method' || done.status === 'canceled') { await release(); return fail(402, 'The card was declined — try another card, or pay at the pro shop.'); }
    if (done.status === 'processing') return { ok: true, value: { status: 'processing' } };
    // requires_action and the like: this page can't finish it; the intent stays the sale's.
    await release();
    return fail(402, 'This card needs a step this page can’t do — try another card, or pay at the pro shop.');
  } catch (err) {
    // A card error is a definite decline (the intent goes back to needing a card).
    // Anything else — a timeout, a 5xx — may have charged: keep the claim; the
    // next attempt or the pro shop's list reads the intent and settles it.
    if (err instanceof Stripe.errors.StripeCardError) {
      await release();
      return fail(402, err.message ? `The card was declined: ${err.message}` : 'The card was declined — try another card, or pay at the pro shop.');
    }
    console.error(JSON.stringify({ ev: 'shop_sale.charge.unsure', saleId, paymentIntentId: pi.id, error: err instanceof Error ? err.message : String(err) }));
    return unsure;
  }
}

/** The sale's single PaymentIntent on the course's account: made once, then reused. */
async function saleIntent(saleId: string, existingId: string, amountCents: number, courseName: string, account: string) {
  if (existingId) return stripe.paymentIntents.retrieve(existingId, {}, { stripeAccount: account });
  const fee = shopFeeFor(amountCents);
  const pi = await stripe.paymentIntents.create({
    amount: amountCents, currency: 'usd', payment_method_types: ['card'],
    application_fee_amount: fee > 0 ? fee : undefined,
    description: `Pro shop - ${courseName} - sale ${saleId}`,
    metadata: { shopSaleId: saleId },
  }, { stripeAccount: account, idempotencyKey: `shop-sale-intent-${saleId}` });
  await prisma.shopSale.update({ where: { id: saleId }, data: { paymentIntentId: pi.id } });
  return pi;
}

/**
 * Settle a sale left 'paying' by a request that never finished (or a charge
 * Stripe was still processing): read its intent and record what happened.
 * Called from the pro shop's list. Returns the new status, or null if unchanged.
 */
export async function reconcileStuckSale(courseId: string, saleId: string): Promise<string | null> {
  const sale = await prisma.shopSale.findFirst({ where: { id: saleId, courseId, status: 'paying' }, include: { course: { select: { stripeAccountId: true } } } });
  if (!sale || !sale.chargeStartedAt) return null;
  if (Date.now() - sale.chargeStartedAt.getTime() < STALE_CHARGE_MS) return null;
  // A request that died before its intent was stored cannot have charged anything.
  if (!sale.paymentIntentId) {
    const back = await prisma.shopSale.updateMany({ where: { id: saleId, status: 'paying', chargeStartedAt: sale.chargeStartedAt, paymentIntentId: '' }, data: { status: 'open', chargeStartedAt: null } });
    return back.count ? 'open' : null;
  }
  if (!sale.course.stripeAccountId) return null;
  const pi = await stripe.paymentIntents.retrieve(sale.paymentIntentId, {}, { stripeAccount: sale.course.stripeAccountId });
  if (pi.status === 'succeeded') { await markCardPaid(saleId, sale.chargeStartedAt, pi.id); return 'paid_card'; }
  if (pi.status === 'requires_payment_method' || pi.status === 'canceled' || pi.status === 'requires_action') {
    const back = await prisma.shopSale.updateMany({ where: { id: saleId, status: 'paying', chargeStartedAt: sale.chargeStartedAt }, data: { status: 'open', chargeStartedAt: null } });
    return back.count ? 'open' : null;
  }
  return null; // still processing at Stripe
}

/** Void or take cash for a sale whose card intent exists: stop the intent first so it can't be paid later. */
export async function cancelSaleIntent(courseId: string, saleId: string): Promise<string | null> {
  const sale = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, include: { course: { select: { stripeAccountId: true } } } });
  if (!sale) return 'Sale not found.';
  if (sale.status !== 'open') return whyNotOpen(sale.status); // never stop a payment in flight
  if (!sale.paymentIntentId || !sale.course.stripeAccountId) return null;
  const pi = await stripe.paymentIntents.retrieve(sale.paymentIntentId, {}, { stripeAccount: sale.course.stripeAccountId });
  if (pi.status === 'succeeded') { await markCardPaid(saleId, sale.chargeStartedAt ?? new Date(0), pi.id); return 'This sale was just paid by card — it can’t be voided or taken in cash.'; }
  if (pi.status === 'processing') return 'The customer’s card payment is still going through — wait a few minutes.';
  if (pi.status !== 'canceled') await stripe.paymentIntents.cancel(pi.id, {}, { stripeAccount: sale.course.stripeAccountId });
  return null;
}

async function markCardPaid(saleId: string, stamp: Date, paymentIntentId: string) {
  await prisma.$transaction(async tx => {
    const done = await tx.shopSale.updateMany({
      where: { id: saleId, status: 'paying', chargeStartedAt: stamp },
      data: { status: 'paid_card', paidAt: new Date(), paymentIntentId },
    });
    let moved = done.count;
    if (moved === 0) {
      // The money is taken; record it even if the claim went stale.
      console.error(JSON.stringify({ ev: 'shop_sale.charge.claim_lost', saleId, paymentIntentId }));
      moved = (await tx.shopSale.updateMany({ where: { id: saleId, status: { in: ['open', 'paying'] } }, data: { status: 'paid_card', paidAt: new Date(), paymentIntentId } })).count;
    }
    if (moved === 0) return; // already recorded paid by an earlier attempt
    const lines = await tx.shopSaleLine.findMany({ where: { saleId }, select: { shopItemId: true, quantity: true } });
    for (const l of lines) if (l.shopItemId) await takeStock(tx, l.shopItemId, l.quantity);
  });
}

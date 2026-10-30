// POS-2 (Cam 2026-10-19: the pro shop, "everything"): walk-up sales — items
// sold at the counter with no round attached. Paid in cash (recorded, no
// charge) or by a pay link the customer opens on their phone, which is a
// direct charge on the course's own Stripe account, exactly like a round.
// GreenReserve takes nothing on a sale while SHOP_FEE_ON is false.
//
// POS-3 (Cam 2026-10-24: "look at how Shopify runs their POS or … Square"):
// custom-amount lines, a discount on the whole sale (shop.discount), cash
// handed over with the change, receipts, and refunds (cash recorded, card
// through Stripe, the sales tax reversed on the course's account).
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
import { quoteShopTax, reuseShopTaxQuote, recordShopSaleTax, type TaxLine } from './sales-tax';
import { todayIn, addDaysStr } from './course-time';
import { teeTimeInstant } from './booking-events';
import { recordMove } from './money-ledger';

export const MAX_SALE_CENTS = 1_000_000; // $10,000 — a typo guard
export const MAX_SALE_LINES = 40;
export const PACK_NO_DISCOUNT = 'A round pack can’t be discounted — set its price in Settings → Pro shop.';
/** A claim this old belongs to a request that is gone (longer than any function run). The sale's single PaymentIntent keeps a retry to one charge either way. */
export const STALE_CHARGE_MS = 10 * 60 * 1000;

/** A catalog item by id, or (POS-3) a custom amount with its own name and price. */
export type SaleLineInput = { shopItemId?: string; name?: string; priceCents?: number; quantity: number; roundPackId?: string };
/** POS-3: money off the whole sale — a percent or an amount, and why. */
export type DiscountInput = { percent?: unknown; amountCents?: unknown; note?: unknown } | null | undefined;
export type RefundView = { id: string; amountCents: number; method: string; status: string; reason: string; restocked: boolean; error: string; createdBy: string; createdAt: string };
export type SaleView = {
  id: string; status: string; totalCents: number; taxCents: number; createdAt: string; paidAt: string | null;
  customerName: string; customerPhone: string; customerEmail: string; soldBy: string;
  /** id and returnedQty for a return by item (dead end 23); round = a green fee line (never returned here). */
  lines: { id: string; name: string; unitPriceCents: number; quantity: number; returnedQty: number; round: boolean }[];
  discountCents: number; discountNote: string; cashTenderedCents: number | null; refundedCents: number;
  receiptSentAt: string | null; refunds: RefundView[];
  /** POS-3 R2: green fees paid in this sale (not refundable here). */
  roundsCents: number;
  /** POS-3 R3: sent as a pay link (else rung up at the counter — cash or the card reader). */
  link: boolean;
};

type SaleRow = {
  id: string; status: string; totalCents: number; taxCents: number; createdAt: Date; paidAt: Date | null;
  customerName: string; customerPhone: string; customerEmail: string; soldBy: string;
  lines: { id: string; name: string; unitPriceCents: number; quantity: number; returnedQty: number; bookingId: string | null }[];
  discountCents?: number; discountNote?: string; cashTenderedCents?: number | null; refundedCents?: number; receiptSentAt?: Date | null; roundsCents?: number; payToken?: string;
  refunds?: { id: string; amountCents: number; method: string; status: string; reason: string; restocked: boolean; error: string; createdBy: string; createdAt: Date }[];
};

export const saleView = (s: SaleRow): SaleView => ({
  id: s.id, status: s.status, totalCents: s.totalCents, taxCents: s.taxCents, createdAt: s.createdAt.toISOString(), paidAt: s.paidAt?.toISOString() ?? null,
  customerName: s.customerName, customerPhone: s.customerPhone, customerEmail: s.customerEmail, soldBy: s.soldBy,
  lines: s.lines.map(l => ({ id: l.id, name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, returnedQty: l.returnedQty, round: !!l.bookingId })),
  discountCents: s.discountCents ?? 0, discountNote: s.discountNote ?? '', cashTenderedCents: s.cashTenderedCents ?? null,
  refundedCents: s.refundedCents ?? 0, receiptSentAt: s.receiptSentAt?.toISOString() ?? null, roundsCents: s.roundsCents ?? 0,
  refunds: (s.refunds ?? []).map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
  link: !!s.payToken,
});

/** What every sale read includes, so saleView has the whole sale. */
export const SALE_INCLUDE = {
  lines: { select: { id: true, name: true, unitPriceCents: true, quantity: true, returnedQty: true, bookingId: true }, orderBy: { id: 'asc' as const } },
  refunds: { select: { id: true, amountCents: true, method: true, status: true, reason: true, restocked: true, error: true, createdBy: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
};

const LINES = { select: { name: true, unitPriceCents: true, quantity: true, roundPackId: true, packRounds: true, packCoversCart: true, packGuests: true, packValidDays: true }, orderBy: { id: 'asc' as const } };

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

// PRICE-3: a round pack line carries the pack's terms (lib/round-packs); no tax, no stock, no discount.
type PackTerms = { roundPackId: string; packRounds: number; packCoversCart: boolean; packGuests: boolean; packValidDays: number | null };
type PricedLine = { shopItemId: string | null; reference: string; name: string; unitPriceCents: number; quantity: number; taxCategory: string; pack?: PackTerms };

/**
 * This course's active, sellable items for the requested lines, priced from
 * the catalog — never from the client. A custom-amount line (POS-3: no
 * shopItemId, a name and a price the staff member typed) is taxed as general
 * goods and takes no stock.
 */
async function priceLines(courseId: string, raw: unknown): Promise<Result<{ lines: PricedLine[]; subtotalCents: number }>> {
  if (!Array.isArray(raw) || raw.length === 0) return fail(400, 'Add at least one item.');
  if (raw.length > MAX_SALE_LINES) return fail(400, `A sale can have up to ${MAX_SALE_LINES} lines.`);
  const wanted = new Map<string, number>();
  const wantedPacks = new Map<string, number>();
  const custom: PricedLine[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const id = typeof l?.shopItemId === 'string' ? l.shopItemId : '';
    const q = Number(l?.quantity);
    if (!Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) return fail(400, `Each line needs a quantity of 1 to ${MAX_LINE_QUANTITY}.`);
    if (typeof l?.roundPackId === 'string' && l.roundPackId) { wantedPacks.set(l.roundPackId, (wantedPacks.get(l.roundPackId) ?? 0) + q); continue; }
    if (!id) {
      const name = String(l?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const price = Number(l?.priceCents);
      if (!name) return fail(400, 'Give the custom amount a name, like "Range token".');
      if (!Number.isInteger(price) || price < 1 || price > MAX_ITEM_PRICE_CENTS) return fail(400, 'A custom amount has to be between $0.01 and $10,000.');
      custom.push({ shopItemId: null, reference: `custom-${custom.length + 1}`, name, unitPriceCents: price, quantity: q, taxCategory: 'general' });
      continue;
    }
    wanted.set(id, (wanted.get(id) ?? 0) + q);
  }
  for (const q of wanted.values()) if (q > MAX_LINE_QUANTITY) return fail(400, `Quantity must be 1 to ${MAX_LINE_QUANTITY}.`);
  // Tenant isolation: only this course's active items, priced from the catalog — never from the client.
  // W2-7: an item with options is sold by its option — a parent never matches
  // here, nor does an option of a hidden item.
  const items = wanted.size ? await prisma.shopItem.findMany({ where: { id: { in: [...wanted.keys()] }, courseId, active: true, options: { none: {} }, OR: [{ parentId: null }, { parent: { active: true } }] } }) : [];
  if (items.length !== wanted.size) return fail(404, 'One of those items is not in your shop any more — refresh and try again.');
  // PRICE-3: this course's active round packs, priced from the catalog.
  const packs = wantedPacks.size ? await prisma.roundPack.findMany({ where: { id: { in: [...wantedPacks.keys()] }, courseId, active: true } }) : [];
  if (packs.length !== wantedPacks.size) return fail(404, 'That round pack is not on sale any more — refresh and try again.');
  const packLines: PricedLine[] = packs.map(k => ({ shopItemId: null, reference: `pack-${k.id}`, name: k.name, unitPriceCents: k.priceCents, quantity: wantedPacks.get(k.id)!, taxCategory: 'general', pack: { roundPackId: k.id, packRounds: k.rounds, packCoversCart: k.coversCart, packGuests: k.guests, packValidDays: k.validDays } }));
  const lines: PricedLine[] = [...items.map(i => ({ shopItemId: i.id, reference: i.id, name: i.name, unitPriceCents: i.priceCents, quantity: wanted.get(i.id)!, taxCategory: i.taxCategory })), ...custom, ...packLines];
  if (lines.some(l => l.unitPriceCents <= 0 || l.unitPriceCents > MAX_ITEM_PRICE_CENTS)) return fail(400, 'An item has a price that needs fixing in Settings → Pro shop.');
  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  if (subtotalCents > MAX_SALE_CENTS) return fail(400, 'That sale is over $10,000 — check the quantities.');
  return { ok: true, value: { lines, subtotalCents } };
}

/** POS-3: the request asks for money off (so the route checks shop.discount). */
export const hasDiscount = (d: DiscountInput) => !!d && ((d.percent != null && d.percent !== '' && Number(d.percent) !== 0) || (d.amountCents != null && d.amountCents !== '' && Number(d.amountCents) !== 0));

/**
 * POS-3: the discount on a sale of `subtotalCents` — a percent (0–100) or an
 * amount in cents, never more than the sale. Null input = no discount.
 */
export function discountFor(subtotalCents: number, raw: DiscountInput): Result<{ discountCents: number; note: string }> {
  const note = String(raw?.note ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  const pct = raw?.percent == null || raw.percent === '' ? null : Number(raw.percent);
  const amt = raw?.amountCents == null || raw.amountCents === '' ? null : Number(raw.amountCents);
  if (pct == null && amt == null) return { ok: true, value: { discountCents: 0, note: '' } };
  if (pct != null && amt != null) return fail(400, 'Take off a percent or an amount, not both.');
  let cents: number;
  if (pct != null) {
    if (!(pct > 0 && pct <= 100)) return fail(400, 'A percent off has to be between 1 and 100.');
    cents = Math.round(subtotalCents * pct / 100);
  } else {
    if (!Number.isInteger(amt) || amt! < 1) return fail(400, 'Enter the amount to take off.');
    if (amt! > subtotalCents) return fail(400, 'The discount can’t be more than the sale.');
    cents = amt!;
  }
  return { ok: true, value: { discountCents: Math.min(cents, subtotalCents), note } };
}

/**
 * Pure: spread a discount over the lines in proportion to what each comes to
 * (largest remainders get the leftover cents), so sales tax is worked out on
 * what is actually paid for each item.
 */
export function spreadDiscount(amounts: number[], discountCents: number): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (!discountCents || !total) return [...amounts];
  const exact = amounts.map(a => (a * discountCents) / total);
  const off = exact.map(Math.floor);
  let left = discountCents - off.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) { if (left <= 0) break; if (off[i] < amounts[i]) { off[i]++; left--; } }
  return amounts.map((a, i) => a - off[i]);
}

const taxLines = (lines: PricedLine[], discountCents = 0): TaxLine[] => {
  const after = spreadDiscount(lines.map(l => l.unitPriceCents * l.quantity), discountCents);
  return lines.map((l, i) => ({ reference: l.reference, amountCents: l.pack ? 0 : after[i], quantity: l.quantity, category: l.taxCategory }))
    // PRICE-3: prepaid rounds are green fees, untaxed like green fees rung up at the register.
    // A line discounted to nothing has no tax to work out (Stripe wants a positive amount).
    .filter(l => l.amountCents > 0);
};
const TAX_DOWN = 'We couldn’t work out the sales tax just now — try again in a moment.';
export const TOTAL_CHANGED = 'The sales tax changed since the total was shown — look at the new total.';

/** What the tax on these lines comes to (none when the whole sale is discounted away). */
async function taxFor(courseId: string, lines: TaxLine[], reuseId?: string) {
  if (!lines.length) return { taxCents: 0, calculationId: '' };
  return (reuseId ? await reuseShopTaxQuote(courseId, reuseId, lines) : null) ?? await quoteShopTax(courseId, lines);
}

/** W2-7 part B: what a sale will come to, tax included, before it is rung up. */
// Cam 2026-10-29 ("no tax on cash"): when Stripe Tax can't be reached the quote
// says so (taxUnavailable) instead of failing, so the counter can still take
// cash — with no tax, marked on the sale. A pay link or the card reader still waits.
export async function quoteSale(courseId: string, raw: unknown, discount?: DiscountInput): Promise<Result<{ subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; taxCalculationId: string; taxUnavailable: boolean }>> {
  const p = await priceLines(courseId, raw);
  if (!p.ok) return p;
  if (p.value.lines.some(l => l.pack) && hasDiscount(discount)) return fail(400, PACK_NO_DISCOUNT);
  const d = discountFor(p.value.subtotalCents, discount);
  if (!d.ok) return d;
  let q;
  try { q = await taxFor(courseId, taxLines(p.value.lines, d.value.discountCents)); }
  catch (err) {
    console.error(JSON.stringify({ ev: 'sales_tax.quote.fail', courseId, error: err instanceof Error ? err.message : String(err) }));
    q = null;
  }
  const net = p.value.subtotalCents - d.value.discountCents;
  if (!q) return { ok: true, value: { subtotalCents: p.value.subtotalCents, discountCents: d.value.discountCents, taxCents: 0, totalCents: net, taxCalculationId: '', taxUnavailable: true } };
  return { ok: true, value: { subtotalCents: p.value.subtotalCents, discountCents: d.value.discountCents, taxCents: q.taxCents, totalCents: net + q.taxCents, taxCalculationId: q.calculationId, taxUnavailable: false } };
}

/** Ring up a sale. Cash is paid on the spot; a link sale waits for the customer. */
export async function createSale(opts: {
  /** POS-3 R3: 'reader' = paid on the course's card reader (lib/card-reader.ts); open until the card goes through. */
  courseId: string; lines: unknown; pay: 'cash' | 'link' | 'reader'; soldBy: string;
  customerName?: string; customerPhone?: string; customerEmail?: string;
  /** The quote the counter showed (quoteSale); reused when it still matches, else tax is worked out again. */
  taxCalculationId?: string;
  /** POS-3: money off the whole sale. The route checks shop.discount before passing one. */
  discount?: DiscountInput;
  /** POS-3: cash handed over (cents), for the change; must cover the total. */
  cashTenderedCents?: unknown;
  /**
   * Cash: the items' total (tax included, rounds left out) the register showed. When the tax
   * worked out now gives a different total — Stripe Tax went down or came back since the
   * quote — nothing is rung up (409), so a sale always records the cash actually taken.
   */
  expectedItemsCents?: unknown;
  /** Server only (ringUpCash): the tax of a quote just made, used as is. Never from a request body. */
  presetTax?: { taxCents: number; calculationId: string; unavailable: boolean };
  /** POS-3 R2: rounds already paid at the counter (settleAtCounter) — lines on the receipt, no tax, no discount, no stock. Cash only. */
  rounds?: { bookingId: string; name: string; amountCents: number }[];
}): Promise<Result<SaleView & { payToken: string }>> {
  const rounds = opts.pay === 'cash' ? opts.rounds ?? [] : [];
  const roundsCents = rounds.reduce((n, r) => n + r.amountCents, 0);
  const noItems = rounds.length > 0 && Array.isArray(opts.lines) && opts.lines.length === 0;
  const p = noItems ? { ok: true as const, value: { lines: [] as PricedLine[], subtotalCents: 0 } } : await priceLines(opts.courseId, opts.lines);
  if (!p.ok) return p;
  const hasPack = p.value.lines.some(l => l.pack);
  if (hasPack && hasDiscount(opts.discount)) return fail(400, PACK_NO_DISCOUNT);
  // The pack's rounds are the customer's — found by their email when they book.
  if (hasPack && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(opts.customerEmail ?? '').trim())) return fail(400, 'Add the customer’s email — the round pack is theirs, found by it when they book.');
  const d = discountFor(p.value.subtotalCents, opts.discount);
  if (!d.ok) return d;
  const lines = [
    ...p.value.lines.map(({ taxCategory: _t, reference: _r, pack, ...l }) => ({ ...l, ...(pack ?? {}), bookingId: null as string | null })),
    ...rounds.map(r => ({ shopItemId: null, name: r.name.slice(0, 120), unitPriceCents: r.amountCents, quantity: 1, bookingId: r.bookingId })),
  ];
  // W2-7 part B: sales tax from Stripe Tax when the course has it on.
  let tax = { taxCents: 0, calculationId: '' };
  let taxUnavailable = false;
  if (opts.presetTax && opts.pay === 'cash') {
    tax = { taxCents: opts.presetTax.taxCents, calculationId: opts.presetTax.calculationId };
    taxUnavailable = opts.presetTax.unavailable;
  } else try {
    tax = await taxFor(opts.courseId, taxLines(p.value.lines, d.value.discountCents), opts.taxCalculationId);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sales_tax.quote.fail', courseId: opts.courseId, pay: opts.pay, error: err instanceof Error ? err.message : String(err) }));
    // Cash is never blocked (Cam 2026-10-29: "no tax on cash" when Stripe Tax is down) — taken without tax, marked on the sale.
    if (opts.pay !== 'cash') return fail(502, TAX_DOWN);
    taxUnavailable = true;
  }
  const totalCents = p.value.subtotalCents - d.value.discountCents + tax.taxCents + roundsCents;
  if (opts.pay === 'cash' && opts.expectedItemsCents != null && opts.expectedItemsCents !== '' && Number(opts.expectedItemsCents) !== totalCents - roundsCents) return fail(409, TOTAL_CHANGED);
  if (opts.pay !== 'cash' && totalCents <= 0) return fail(400, 'This sale comes to nothing — take it as cash instead.');
  if (opts.pay === 'reader' && totalCents < 50) return fail(400, 'Card payments start at $0.50 — take this one as cash.');
  if (opts.pay !== 'cash' && shopFeeFor(totalCents) > 0) return fail(400, 'Walk-up card payments are not set up for the shop fee yet.');
  let cashTenderedCents: number | null = null;
  if (opts.pay === 'cash' && opts.cashTenderedCents != null && opts.cashTenderedCents !== '') {
    const t = Number(opts.cashTenderedCents);
    if (!Number.isInteger(t) || t < totalCents || t > totalCents + MAX_SALE_CENTS) return fail(400, `The cash handed over has to cover the $${(totalCents / 100).toFixed(2)} total.`);
    cashTenderedCents = t;
  }

  const name = String(opts.customerName ?? '').trim().slice(0, 80);
  const phone = String(opts.customerPhone ?? '').trim().slice(0, 30);
  const email = String(opts.customerEmail ?? '').trim().toLowerCase().slice(0, 200);
  const payToken = opts.pay === 'link' ? randomUUID() : '';
  const sale = await prisma.$transaction(async tx => {
    const s = await tx.shopSale.create({
      data: {
        courseId: opts.courseId, totalCents, taxCents: tax.taxCents, taxCalculationId: tax.calculationId, taxUnavailable, soldBy: opts.soldBy, customerName: name, customerPhone: phone, customerEmail: email, payToken,
        status: opts.pay === 'cash' ? 'paid_cash' : 'open', paidAt: opts.pay === 'cash' ? new Date() : null,
        discountCents: d.value.discountCents, discountNote: d.value.note, cashTenderedCents, roundsCents,
        lines: { create: lines },
      },
      include: SALE_INCLUDE,
    });
    // Cash leaves the shelf now; a link sale only when it is paid. A custom amount takes no stock.
    if (opts.pay === 'cash') for (const l of lines) if (l.shopItemId) await takeStock(tx, l.shopItemId, l.quantity);
    return s;
  });
  if (opts.pay === 'cash') {
    // LEDGER-1: the cash taken — each round on its own booking, the items as one shop line.
    for (const rd of rounds) await recordMove({ courseId: opts.courseId, what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: rd.amountCents, bookingId: rd.bookingId, saleId: sale.id, actor: 'staff', note: opts.soldBy });
    await recordMove({ courseId: opts.courseId, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: totalCents - roundsCents, saleId: sale.id, actor: 'staff', note: opts.soldBy });
    await recordShopSaleTax(sale.id); // never throws; the hourly cron retries
  }
  return { ok: true, value: { ...saleView(sale), payToken } };
}

/** Why staff can't void or take cash for a sale in this status. */
export const whyNotOpen = (status: string) =>
  status === 'paying' ? 'The customer is paying right now — wait a moment and refresh.'
    : status === 'paid_card' ? 'This sale is already paid by card.'
    : status === 'paid_cash' ? 'This sale is already paid in cash.'
    : 'This sale was voided.';

/** Void an unpaid link sale, or take cash for it at the counter instead. */
export async function settleOpenSale(courseId: string, saleId: string, to: 'void' | 'paid_cash', voidNote = ''): Promise<Result<SaleView>> {
  // PRICE-3: a golfer's own online purchase (a round pack) is paid on their link, never marked paid at the counter.
  const ONLINE_ONLY = 'The golfer bought this online — it’s paid on their own link. Void it if it’s not wanted.';
  const r = await prisma.$transaction(async tx => {
    const done = await tx.shopSale.updateMany({
      where: { id: saleId, courseId, status: 'open', ...(to === 'paid_cash' ? { soldBy: { not: 'online' } } : {}) },
      // The token stays: the customer's page then says the sale was paid or cancelled.
      data: to === 'void' ? { status: 'void', voidedAt: new Date(), voidNote: voidNote.slice(0, 200) } : { status: 'paid_cash', paidAt: new Date() },
    });
    const sale = await tx.shopSale.findFirst({ where: { id: saleId, courseId }, include: { ...SALE_INCLUDE, lines: { select: { id: true, name: true, unitPriceCents: true, quantity: true, returnedQty: true, bookingId: true, shopItemId: true }, orderBy: { id: 'asc' } } } });
    if (!sale) return fail(404, 'Sale not found.');
    if (done.count === 0) return fail(409, sale.status === 'open' && sale.soldBy === 'online' ? ONLINE_ONLY : whyNotOpen(sale.status));
    if (to === 'paid_cash') for (const l of sale.lines) if (l.shopItemId) await takeStock(tx, l.shopItemId, l.quantity);
    return { ok: true as const, value: saleView(sale) };
  });
  if (r.ok && to === 'paid_cash') {
    await recordMove({ courseId, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: r.value.totalCents, saleId, actor: 'staff', note: 'pay link taken in cash' });
    await recordShopSaleTax(saleId);
  }
  return r;
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
export async function chargeSale(saleId: string, token: string, paymentMethodId: string, expectedTotalCents: number, terms: { text: string; agreed: boolean } = { text: '', agreed: false }): Promise<Result<{ status: 'paid_card' | 'processing' }>> {
  const sale = await saleForPayPage(saleId, token);
  if (!sale) return fail(404, 'This pay link is not valid any more. Ask the pro shop for a new one.');
  if (sale.status === 'paid_card' || sale.status === 'paid_cash') return fail(409, 'This sale is already paid. Thank you!');
  if (sale.status === 'void') return fail(409, 'The pro shop cancelled this sale.');
  // PRICE-4: a round pack is paid only after the golfer ticks its terms (the route builds them: lib/round-packs saleTerms).
  if (terms.text && !terms.agreed) return fail(400, 'Tick the box to agree to the round pack’s terms first.');
  if (!sale.course.stripeAccountId || !sale.course.stripeAccountActive) return fail(409, 'This course can’t take card payments yet — please pay at the pro shop.');
  if (Number(expectedTotalCents) !== sale.totalCents) return fail(409, 'The total changed since this page loaded — refresh to see it.');
  if (typeof paymentMethodId !== 'string' || !paymentMethodId.startsWith('pm_')) return fail(400, 'Card details are missing — try again.');
  const account = sale.course.stripeAccountId;

  // Claim: open, or a claim old enough that its request must be gone.
  const now = new Date();
  const claimed = await prisma.shopSale.updateMany({
    where: { id: saleId, payToken: token, OR: [{ status: 'open' }, { status: 'paying', chargeStartedAt: { lt: new Date(now.getTime() - STALE_CHARGE_MS) } }] },
    data: { status: 'paying', chargeStartedAt: now, ...(terms.text ? { termsAgreed: terms.text.slice(0, 4000), termsAgreedAt: now } : {}) },
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

/**
 * The sale's single PaymentIntent on the course's account: made once, then
 * reused. A pay-link sale's takes a card typed on the customer's phone; a
 * reader sale's (POS-3 R3) takes a card presented to the course's reader.
 */
export async function saleIntent(saleId: string, existingId: string, amountCents: number, courseName: string, account: string, method: 'card' | 'card_present' = 'card') {
  if (existingId) return stripe.paymentIntents.retrieve(existingId, {}, { stripeAccount: account });
  const fee = shopFeeFor(amountCents);
  const pi = await stripe.paymentIntents.create({
    amount: amountCents, currency: 'usd', payment_method_types: [method],
    application_fee_amount: fee > 0 ? fee : undefined,
    description: `Pro shop - ${courseName} - sale ${saleId}`,
    metadata: { shopSaleId: saleId, ...(method === 'card_present' ? { source: 'card_reader' } : {}) },
  }, { stripeAccount: account, idempotencyKey: method === 'card' ? `shop-sale-intent-${saleId}` : `shop-sale-reader-intent-${saleId}` });
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
  // POS-3 R3: a reader sale — stop the reader first, so a card tapped later can't pay a sale shown as unpaid.
  if (sale.readerId) {
    try {
      const r = await stripe.terminal.readers.retrieve(sale.readerId, {}, { stripeAccount: sale.course.stripeAccountId });
      const action = 'deleted' in r && r.deleted ? null : (r as Stripe.Terminal.Reader).action;
      if (action?.status === 'in_progress' && action.process_payment_intent?.payment_intent === sale.paymentIntentId) {
        await stripe.terminal.readers.cancelAction(sale.readerId, {}, { stripeAccount: sale.course.stripeAccountId });
      }
    } catch (err) {
      // Couldn't stop it: leave the sale as it is and try on the next look.
      console.error(JSON.stringify({ ev: 'shop_sale.reader_stop.fail', saleId, error: err instanceof Error ? err.message : String(err) }));
      return null;
    }
  }
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

export async function markCardPaid(saleId: string, stamp: Date, paymentIntentId: string) {
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
  // LEDGER-1: the card took it (link or reader); the PaymentIntent id makes a second call a no-op.
  const paid = await prisma.shopSale.findUnique({ where: { id: saleId }, select: { courseId: true, totalCents: true, readerId: true } });
  if (paid) await recordMove({ courseId: paid.courseId, what: 'shop', direction: 'in', method: paid.readerId ? 'card_present' : 'card', account: 'course', amountCents: paid.totalCents, stripeId: paymentIntentId, saleId, actor: paid.readerId ? 'staff' : 'golfer' });
  await recordShopSaleTax(saleId); // never throws; the hourly cron retries
}

// ── POS-3: refunds ──────────────────────────────────────────────────────────

const isPaid = (status: string) => status === 'paid_cash' || status === 'paid_card';

/**
 * Refund all or part of a paid walk-up sale. The amount is reserved on the
 * sale first (only if that much is still unrefunded — two refunds at once
 * can't both take the last of it). Cash is recorded and done; a card refund
 * goes through Stripe on the course's account (sendShopRefund). A full refund
 * can put the items back on the shelf.
 */
/**
 * Revamp 3 dead end 23 (Cam 2026-10-29): what a return of some items gives back — their
 * share of the items after the sale's discount, plus their share of its tax — and the
 * lines it covers. Null with a reason when the return isn't possible.
 */
export function returnAmount(sale: { discountCents: number; taxCents: number; lines: { id: string; unitPriceCents: number; quantity: number; returnedQty: number; bookingId: string | null; packRounds?: number; packRoundsUsed?: number }[] }, raw: unknown): { ok: true; cents: number; lines: { lineId: string; quantity: number }[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'Pick what is coming back.' };
  const items = sale.lines.filter(l => !l.bookingId);
  const subtotal = items.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  if (subtotal <= 0) return { ok: false, error: 'This sale has no items to return.' };
  const out: { lineId: string; quantity: number }[] = [];
  let gross = 0;
  for (const r of raw as { lineId?: unknown; quantity?: unknown }[]) {
    const line = items.find(l => l.id === r?.lineId);
    const q = Number(r?.quantity);
    if (!line) return { ok: false, error: 'That item isn’t on this sale.' };
    if (!Number.isInteger(q) || q < 1) return { ok: false, error: 'Enter how many are coming back.' };
    if (q > line.quantity - line.returnedQty) return { ok: false, error: `Only ${line.quantity - line.returnedQty} of that can still come back.` };
    // PRICE-3: a round pack comes back only with its rounds unused.
    if (line.packRounds && q > unusedPacks(line)) return { ok: false, error: unusedPacks(line) ? `Only ${unusedPacks(line)} of those packs are still unused.` : 'Rounds from this pack have been used — it can’t come back.' };
    if (out.some(o => o.lineId === line.id)) return { ok: false, error: 'Each item once, with its count.' };
    out.push({ lineId: line.id, quantity: q });
    gross += line.unitPriceCents * q;
  }
  const net = subtotal - sale.discountCents;
  const back = Math.round(gross * net / subtotal);
  const tax = net > 0 ? Math.round(sale.taxCents * back / net) : 0;
  return { ok: true, cents: back + tax, lines: out };
}

/** PRICE-3: how many of a pack line's packs have no round used yet. */
const unusedPacks = (l: { quantity: number; returnedQty: number; packRounds?: number; packRoundsUsed?: number }) =>
  l.packRounds ? Math.floor((l.packRounds * (l.quantity - l.returnedQty) - (l.packRoundsUsed ?? 0)) / l.packRounds) : l.quantity - l.returnedQty;

class ReturnRaceError extends Error {}

export async function refundSale(courseId: string, saleId: string, input: { amountCents?: unknown; reason?: unknown; restock?: unknown; lines?: unknown }, actor: string): Promise<Result<{ status: 'done' | 'pending'; sale: SaleView }>> {
  const s = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, include: { lines: { select: { id: true, unitPriceCents: true, quantity: true, returnedQty: true, bookingId: true, packRounds: true, packRoundsUsed: true } } } });
  if (!s) return fail(404, 'Sale not found.');
  if (!isPaid(s.status)) return fail(409, 'Only a paid sale can be refunded.');
  // PRICE-3: a refund by amount would leave a round pack's rounds live — packs come back by item.
  if (input.lines === undefined && s.lines.some(l => l.packRounds > 0 && l.quantity > l.returnedQty)) return fail(409, 'This sale has a round pack — return it by item, so its rounds end with the refund.');
  // POS-3 R2: green fees rung up here were paid at the counter on their own
  // bookings — they are not refunded from the register, only the items are.
  const items = s.totalCents - s.roundsCents;
  const left = items - s.refundedCents;
  if (left <= 0) return fail(409, s.roundsCents > 0 && items <= 0 ? 'Green fees are refunded from the tee sheet booking, not the register.' : 'This sale has already been refunded in full.');
  // A return by item: the amount follows from the items (their share of the discount and tax), and they go back on the shelf.
  const byItem = input.lines !== undefined ? returnAmount(s, input.lines) : null;
  if (byItem && !byItem.ok) return fail(400, byItem.error);
  const amountCents = byItem?.ok ? Math.min(byItem.cents, left) : input.amountCents == null || input.amountCents === '' ? left : Number(input.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 1) return fail(400, 'Enter the amount to refund.');
  if (amountCents > left) return fail(400, `At most $${(left / 100).toFixed(2)} can still be refunded on this sale${s.roundsCents ? ' (green fees are refunded from the tee sheet booking)' : ''}.`);
  const method = s.status === 'paid_card' ? 'card' : 'cash';
  // By amount, the items go back only when the whole sale is refunded in one go; a return by item restocks its items.
  const restock = byItem?.ok ? input.restock !== false : input.restock === true && s.refundedCents === 0 && amountCents === items;
  const returned = byItem?.ok ? byItem.lines : null;
  const reason = String(input.reason ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
  const refund = await prisma.$transaction(async tx => {
    const reserved = await tx.shopSale.updateMany({ where: { id: saleId, courseId, status: s.status, refundedCents: { lte: items - amountCents } }, data: { refundedCents: { increment: amountCents } } });
    if (!reserved.count) return null;
    const r = await tx.shopSaleRefund.create({ data: { saleId, courseId, amountCents, method, status: method === 'cash' ? 'done' : 'pending', reason, restocked: restock, createdBy: actor, ...(returned ? { returnedLines: returned } : {}) } });
    if (returned) {
      // Never more back than was sold: the count is checked again under the write.
      for (const rl of returned) {
        const ok = await tx.shopSaleLine.updateMany({ where: { id: rl.lineId, saleId, returnedQty: { lte: (s.lines.find(l => l.id === rl.lineId)?.quantity ?? 0) - rl.quantity } }, data: { returnedQty: { increment: rl.quantity } } });
        if (!ok.count) throw new ReturnRaceError();
        // PRICE-3: under the write — the rounds left must still cover what was used (a booking may have just taken one).
        const pk = await tx.shopSaleLine.findUnique({ where: { id: rl.lineId }, select: { packRounds: true, packRoundsUsed: true, quantity: true, returnedQty: true } });
        if (pk && pk.packRounds > 0 && pk.packRoundsUsed > pk.packRounds * (pk.quantity - pk.returnedQty)) throw new ReturnRaceError();
        if (restock) { const l = await tx.shopSaleLine.findUnique({ where: { id: rl.lineId }, select: { shopItemId: true } }); if (l?.shopItemId) await takeStock(tx, l.shopItemId, -rl.quantity); }
      }
    } else if (restock) {
      const lines = await tx.shopSaleLine.findMany({ where: { saleId }, select: { shopItemId: true, quantity: true } });
      for (const l of lines) if (l.shopItemId) await takeStock(tx, l.shopItemId, -l.quantity);
    }
    return r;
  }).catch(err => { if (err instanceof ReturnRaceError) return null; throw err; });
  if (!refund) return fail(409, 'Someone else just refunded part of this — refresh and try again.');
  if (method === 'cash') await recordMove({ courseId, what: 'shop', direction: 'out', method: 'cash', account: 'course', amountCents, saleId, actor: 'staff', note: reason || actor });
  let status: 'done' | 'pending' = 'done';
  if (method === 'card') {
    const r = await sendShopRefund(courseId, refund.id);
    if (!r.ok) return r;
    status = r.value.status;
  }
  if (status === 'done') await reverseShopRefundTax(refund.id); // never throws; the hourly cron retries
  const sale = await prisma.shopSale.findUniqueOrThrow({ where: { id: saleId }, include: SALE_INCLUDE });
  return { ok: true, value: { status, sale: saleView(sale) } };
}

/** Give a refund's amount back to the sale when Stripe definitely refused it. */
async function giveBackRefund(refundId: string, saleId: string, amountCents: number, error: string) {
  await prisma.$transaction(async tx => {
    const r = await tx.shopSaleRefund.updateMany({ where: { id: refundId, status: 'pending' }, data: { status: 'failed', error: error.slice(0, 300) } });
    if (!r.count) return;
    await tx.shopSale.update({ where: { id: saleId }, data: { refundedCents: { decrement: amountCents } } });
    const row = await tx.shopSaleRefund.findUniqueOrThrow({ where: { id: refundId } });
    // A return by item that didn't happen: its items count as sold again.
    const back = Array.isArray(row.returnedLines) ? row.returnedLines as { lineId: string; quantity: number }[] : null;
    if (back) {
      for (const rl of back) {
        await tx.shopSaleLine.updateMany({ where: { id: rl.lineId, saleId }, data: { returnedQty: { decrement: rl.quantity } } });
        if (row.restocked) { const l = await tx.shopSaleLine.findUnique({ where: { id: rl.lineId }, select: { shopItemId: true } }); if (l?.shopItemId) await takeStock(tx, l.shopItemId, rl.quantity); }
      }
      if (row.restocked) await tx.shopSaleRefund.update({ where: { id: refundId }, data: { restocked: false } });
    } else if (row.restocked) {
      // Items put back for a refund that didn't happen come off the shelf again.
      const lines = await tx.shopSaleLine.findMany({ where: { saleId }, select: { shopItemId: true, quantity: true } });
      for (const l of lines) if (l.shopItemId) await takeStock(tx, l.shopItemId, l.quantity);
      await tx.shopSaleRefund.update({ where: { id: refundId }, data: { restocked: false } });
    }
  });
}

/**
 * Ask Stripe for a card refund (first time, or again after an unsure answer).
 * Stripe forgets an idempotency key after 24 hours, so it is asked first
 * whether this refund already exists (each carries its row id in metadata).
 */
export async function sendShopRefund(courseId: string, refundId: string): Promise<Result<{ status: 'done' | 'pending' }>> {
  const r = await prisma.shopSaleRefund.findFirst({ where: { id: refundId, courseId }, include: { sale: { select: { id: true, paymentIntentId: true, course: { select: { stripeAccountId: true } } } } } });
  if (!r) return fail(404, 'Refund not found.');
  if (r.status === 'done') return { ok: true, value: { status: 'done' } };
  if (r.status === 'failed') return fail(409, 'This refund didn’t go through — start a new one.');
  const account = r.sale.course.stripeAccountId;
  if (!account || !r.sale.paymentIntentId) {
    await giveBackRefund(r.id, r.saleId, r.amountCents, 'This sale has no card payment to refund.');
    return fail(409, 'This sale has no card payment to refund.');
  }
  try {
    const earlier = await stripe.refunds.list({ payment_intent: r.sale.paymentIntentId, limit: 100 }, { stripeAccount: account });
    const found = earlier.data.find(x => x.metadata?.shopRefundId === r.id && x.status !== 'failed' && x.status !== 'canceled');
    const sr = found ?? await stripe.refunds.create(
      { payment_intent: r.sale.paymentIntentId, amount: r.amountCents, metadata: { shopRefundId: r.id, shopSaleId: r.saleId } },
      { stripeAccount: account, idempotencyKey: `shop-refund-${r.id}` },
    );
    await prisma.shopSaleRefund.update({ where: { id: r.id }, data: { status: 'done', stripeRefundId: sr.id, error: '' } });
    await recordMove({ courseId, what: 'shop', direction: 'out', method: 'card', account: 'course', amountCents: sr.amount, stripeId: sr.id, saleId: r.saleId, actor: 'staff', note: r.reason });
    return { ok: true, value: { status: 'done' } };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError || err instanceof Stripe.errors.StripeCardError) {
      await giveBackRefund(r.id, r.saleId, r.amountCents, err.message || 'Stripe refused the refund.');
      return fail(402, `Stripe refused the refund: ${err.message || 'no reason given'}. Nothing was refunded.`);
    }
    console.error(JSON.stringify({ ev: 'shop_refund.unsure', refundId: r.id, error: err instanceof Error ? err.message : String(err) }));
    await prisma.shopSaleRefund.update({ where: { id: r.id }, data: { error: 'Stripe didn’t answer.' } });
    return { ok: true, value: { status: 'pending' } };
  }
}

/**
 * Take a done refund off the sale's recorded sales tax (a reversal of the
 * sale's tax transaction on the course's account, keyed by the refund, so a
 * retry can't reverse it twice). The whole refund of a sale reverses all of
 * it; a part reverses that amount, tax included. Nothing to do when the sale
 * had no tax. Never throws; the hourly cron retries one that didn't go.
 */
export async function reverseShopRefundTax(refundId: string): Promise<void> {
  const r = await prisma.shopSaleRefund.findUnique({ where: { id: refundId }, include: { sale: { select: { id: true, totalCents: true, roundsCents: true, taxCents: true, taxTransactionId: true, course: { select: { stripeAccountId: true } } } } } });
  if (!r || r.status !== 'done' || r.taxReversalId || r.sale.taxCents <= 0 || !r.sale.course.stripeAccountId) return;
  // A sale whose tax wasn't recorded yet is recorded first (the cron would otherwise record it whole later).
  if (!r.sale.taxTransactionId) await recordShopSaleTax(r.sale.id);
  const sale = await prisma.shopSale.findUnique({ where: { id: r.sale.id }, select: { taxTransactionId: true } });
  if (!sale?.taxTransactionId) return;
  try {
    // The tax record holds the items only (rounds are untaxed), so "whole" is all of the items.
    const whole = r.amountCents === r.sale.totalCents - r.sale.roundsCents;
    const rev = await stripe.tax.transactions.createReversal(
      { mode: whole ? 'full' : 'partial', original_transaction: sale.taxTransactionId, reference: `shop-refund-${r.id}`,
        ...(whole ? {} : { flat_amount: -r.amountCents }), metadata: { shopRefundId: r.id } },
      { stripeAccount: r.sale.course.stripeAccountId, idempotencyKey: `tax-rev-shop-refund-${r.id}` },
    );
    await prisma.shopSaleRefund.update({ where: { id: r.id }, data: { taxReversalId: rev.id } });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sales_tax.reverse.fail', refundId: r.id, error: err instanceof Error ? err.message : String(err) }));
  }
}

/** Hourly: reverse the tax of done refunds that didn't get their reversal yet. */
export async function reversePendingShopRefundTax(limit = 50): Promise<number> {
  const pending = await prisma.shopSaleRefund.findMany({ where: { status: 'done', taxReversalId: '', sale: { taxCents: { gt: 0 } } }, select: { id: true }, take: limit, orderBy: { createdAt: 'asc' } });
  for (const r of pending) await reverseShopRefundTax(r.id);
  // Voided cash sales whose tax was recorded but not yet reversed (dead end 23).
  const voided = await prisma.shopSale.findMany({ where: { status: 'void', taxCents: { gt: 0 }, taxTransactionId: { not: '' }, voidTaxReversalId: '' }, select: { id: true }, take: limit });
  for (const v of voided) await reverseVoidTax(v.id);
  return pending.length + voided.length;
}

/**
 * Revamp 3 dead end 23 (Cam 2026-10-29: "Same day, before close-out"): a cash sale rung up
 * by mistake is voided, not refunded — so the day's totals and the close-out never show it
 * as a sale plus a refund. Only a paid cash sale, the course's same day, nothing refunded
 * on it, no green fees in it (those are undone on the tee sheet), and before the day's
 * drawer is counted. Its items go back on the shelf and its recorded tax is reversed.
 */
export async function voidCashSale(courseId: string, saleId: string): Promise<Result<SaleView>> {
  const s = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, include: { course: { select: { timezone: true, stripeAccountId: true } } } });
  if (!s) return fail(404, 'Sale not found.');
  if (s.status !== 'paid_cash' || !s.paidAt) return fail(409, s.status === 'paid_card' ? 'A card sale is refunded, not voided.' : 'Only a paid cash sale can be voided.');
  if (s.roundsCents > 0) return fail(409, 'This sale paid green fees — undo those on the tee sheet, and refund the items.');
  if (s.refundedCents > 0) return fail(409, 'Part of this sale was refunded — refund the rest instead.');
  if (await prisma.shopSaleLine.findFirst({ where: { saleId, packRoundsUsed: { gt: 0 } }, select: { id: true } })) return fail(409, 'Rounds from the round pack on this sale have been used — it can’t be voided.');
  const today = todayIn(s.course.timezone);
  if (todayIn(s.course.timezone, s.paidAt) !== today) return fail(409, 'A sale from an earlier day is refunded, not voided.');
  if (await prisma.registerClose.findFirst({ where: { courseId, day: today, createdAt: { gt: s.paidAt } }, select: { id: true } })) {
    return fail(409, 'Today’s drawer has been counted since this sale — refund it instead.');
  }
  const r = await prisma.$transaction(async tx => {
    const done = await tx.shopSale.updateMany({ where: { id: saleId, courseId, status: 'paid_cash', refundedCents: 0 }, data: { status: 'void', voidedAt: new Date() } });
    if (!done.count) return null;
    // PRICE-3: a booking that took a round in the same moment (it held this sale FOR SHARE, so it has committed) stops the void.
    if (await tx.shopSaleLine.findFirst({ where: { saleId, packRoundsUsed: { gt: 0 } }, select: { id: true } })) throw new ReturnRaceError();
    const lines = await tx.shopSaleLine.findMany({ where: { saleId }, select: { shopItemId: true, quantity: true, returnedQty: true } });
    for (const l of lines) if (l.shopItemId && l.quantity - l.returnedQty > 0) await takeStock(tx, l.shopItemId, -(l.quantity - l.returnedQty));
    return true;
  }).catch(err => { if (err instanceof ReturnRaceError) return null; throw err; });
  if (!r) return fail(409, 'This sale just changed — refresh and look again.');
  // The cash goes back in the drawer: the sale's whole total out (a void had nothing refunded on it).
  await recordMove({ courseId, what: 'shop', direction: 'out', method: 'cash', account: 'course', amountCents: s.totalCents, saleId, actor: 'staff', note: 'voided' });
  await reverseVoidTax(saleId);
  const sale = await prisma.shopSale.findUniqueOrThrow({ where: { id: saleId }, include: SALE_INCLUDE });
  return { ok: true, value: saleView(sale) };
}

/** A voided sale's recorded tax, reversed in full. Never throws; the hourly sweep retries. */
export async function reverseVoidTax(saleId: string): Promise<void> {
  const s = await prisma.shopSale.findUnique({ where: { id: saleId }, select: { status: true, taxCents: true, taxTransactionId: true, voidTaxReversalId: true, course: { select: { stripeAccountId: true } } } });
  if (!s || s.status !== 'void' || s.taxCents <= 0 || !s.taxTransactionId || s.voidTaxReversalId || !s.course.stripeAccountId) return;
  try {
    const rev = await stripe.tax.transactions.createReversal(
      { mode: 'full', original_transaction: s.taxTransactionId, reference: `shop-void-${saleId}`, metadata: { shopSaleId: saleId, voided: 'true' } },
      { stripeAccount: s.course.stripeAccountId, idempotencyKey: `tax-rev-shop-void-${saleId}` },
    );
    await prisma.shopSale.update({ where: { id: saleId }, data: { voidTaxReversalId: rev.id } });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sales_tax.void_reverse.fail', saleId, error: err instanceof Error ? err.message : String(err) }));
  }
}

/**
 * Revamp 3 dead end 15 (Cam 2026-10-29): sale history and lookup — the shop page showed
 * only the last 36 hours. A day (the course's), or a search across 90 days by customer,
 * item or receipt number. Newest first.
 */
export async function findSales(courseId: string, opts: { day?: string; q?: string }): Promise<Result<SaleView[]>> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) return fail(404, 'Course not found.');
  const today = todayIn(course.timezone);
  let from: Date | null, to: Date | null;
  if (opts.day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.day) || opts.day > today) return fail(400, 'Pick a day up to today.');
    from = teeTimeInstant(course.timezone, opts.day, '00:00');
    to = teeTimeInstant(course.timezone, addDaysStr(opts.day, 1), '00:00');
  } else {
    from = teeTimeInstant(course.timezone, addDaysStr(today, -89), '00:00');
    to = null;
  }
  if (!from) return fail(400, 'Bad day.');
  const q = (opts.q ?? '').trim().slice(0, 80);
  const contains = { contains: q, mode: 'insensitive' as const };
  const digits = q.replace(/\D/g, '');
  const sales = await prisma.shopSale.findMany({
    where: {
      courseId, status: { not: 'open' }, createdAt: { gte: from, ...(to ? { lt: to } : {}) },
      ...(q ? { OR: [
        { customerName: contains }, { customerEmail: contains },
        ...(digits.length >= 4 ? [{ customerPhone: { contains: digits } }] : []),
        { lines: { some: { name: contains } } },
        // The receipt shows the sale's id — its last characters are enough.
        { id: { endsWith: q.toLowerCase() } },
      ] } : {}),
    },
    orderBy: { createdAt: 'desc' }, take: 100, include: SALE_INCLUDE,
  });
  return { ok: true, value: sales.map(saleView) };
}

// Revenue page (Cam 2026-11-15, lanes/dashboard.md "Revenue (was Money)"): the three things
// the page needs that Money's routes didn't return. Read-only, one course, no money moves.
//
//  • todayVsAverage — money taken so far today against the average of the last 30 days
//    BY THE SAME TIME OF DAY. From the ledger (MoneyMove), by when it was paid: the course's
//    part (amount less GreenReserve's fee), less what was given back (a hold returned at
//    check-in nets out), membership dues left out (not one of the page's segments).
//    Tee-date "collected" can't say "by 10 AM", so this is its own figure: money taken.
//  • segments / howPaid — Food & beverage split out of the pro shop by the item's tax
//    category (food, snacks, candy, soft drinks, water) or its shop category's name; and
//    the ledger's money in by how it was paid.
//  • stripeDayDetail — for a day whose card money differs from Stripe, each payment that
//    makes the difference and why (a refund made in Stripe directly, one side missing it,
//    a different amount, or the same payment recorded on the next or previous day).
import { prisma } from './prisma';
import { stripe } from './stripe';
import { addDaysStr, todayIn } from './course-time';
import { walkUpNet } from './analytics';
import { dayStart, dayOf, sumDay, describeMoves, type LedgerRow } from './ledger-view';

// ─── Today against the 30-day average ───────────────────────────────────────

export const AVG_DAYS = 30;
export const LINE_FROM = 360, LINE_TO = 1200, LINE_STEP = 30;

export type LinePoint = { minute: number; todayCents: number | null; avgCents: number };
export type TodayVsAverage = { days: number; nowMinute: number; todayNowCents: number; avgNowCents: number; points: LinePoint[] };

// One formatter per time zone (building two per ledger row cost ~1 s per 9,000 rows).
const fmts = new Map<string, Intl.DateTimeFormat>();
/** The course-local day and minute of an instant. */
export function localDayMinute(tz: string, at: Date): { day: string; minute: number } {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); fmts.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000);

/**
 * Pure: the line from money already placed on its course-local day and minute.
 * `days` is how many days before today the average covers (0 = nothing to average).
 */
export function lineOf(moves: { day: string; minute: number; cents: number }[], today: string, days: number, nowMinute: number): TodayVsAverage {
  const first = addDaysStr(today, -days);
  const todayBy = new Array<number>(1440).fill(0), pastBy = new Array<number>(1440).fill(0);
  for (const m of moves) {
    const i = Math.max(0, Math.min(1439, m.minute));
    if (m.day === today) todayBy[i] += m.cents;
    else if (days > 0 && m.day >= first && m.day < today) pastBy[i] += m.cents;
  }
  for (let i = 1; i < 1440; i++) { todayBy[i] += todayBy[i - 1]; pastBy[i] += pastBy[i - 1]; }
  const avg = (i: number) => (days > 0 ? Math.round(pastBy[i] / days) : 0);
  const points: LinePoint[] = [];
  for (let t = LINE_FROM; t <= LINE_TO; t += LINE_STEP) points.push({ minute: t, todayCents: t <= nowMinute ? todayBy[t] : null, avgCents: avg(t) });
  return { days, nowMinute, todayNowCents: todayBy[nowMinute], avgNowCents: avg(nowMinute), points };
}

/** The ledger rows the Revenue page counts: the course's own money, dues aside. */
const counted = (courseId: string) => ({ courseId, account: 'course', what: { not: 'dues' } });
/** Pure: a row's signed value, the course's part. */
export const valueOf = (r: { direction: string; amountCents: number; platformFeeCents: number }) => (r.direction === 'out' ? -1 : 1) * (r.amountCents - r.platformFeeCents);

export async function todayVsAverage(courseId: string, tz: string, now: Date = new Date()): Promise<TodayVsAverage> {
  const today = todayIn(tz, now);
  const where = counted(courseId);
  const firstMove = await prisma.moneyMove.findFirst({ where: { ...where, direction: 'in' }, orderBy: { at: 'asc' }, select: { at: true } });
  // A course live for less than 30 days averages only the days it was taking money.
  const days = firstMove ? Math.max(0, Math.min(AVG_DAYS, daysBetween(dayOf(tz, firstMove.at), today))) : 0;
  const rows = await prisma.moneyMove.findMany({
    where: { ...where, at: { gte: dayStart(tz, addDaysStr(today, -days)), lt: dayStart(tz, addDaysStr(today, 1)) } },
    select: { at: true, direction: true, amountCents: true, platformFeeCents: true },
  });
  return lineOf(
    rows.map(r => ({ ...localDayMinute(tz, r.at), cents: valueOf(r) })),
    today, days, localDayMinute(tz, now).minute,
  );
}

// ─── Food & beverage, and how it was paid ───────────────────────────────────

const FNB_TAX = new Set(['food', 'snack', 'candy', 'soda', 'water']);
const FNB_CATEGORY = /\b(food|foods|drinks?|beverages?|snacks?|grill|bar|beer|wine|kitchen|caf[eé]|concessions?|halfway|f\s*&\s*b|fnb)\b/i;

/** Pure: whether a shop item is food or drink — its tax category, or its shop category's name. */
export function isFnb(taxCategory: string | null | undefined, category: string | null | undefined): boolean {
  return FNB_TAX.has(taxCategory ?? '') || FNB_CATEGORY.test(category ?? '');
}

type Line = { cents: number; fnb: boolean };
/** Pure: the F&B part of an amount, by the gross share of its F&B lines. */
export function fnbPart(netCents: number, lines: Line[]): number {
  const all = lines.reduce((s, l) => s + Math.max(0, l.cents), 0);
  if (all <= 0 || netCents <= 0) return 0;
  const f = lines.reduce((s, l) => s + (l.fnb ? Math.max(0, l.cents) : 0), 0);
  return Math.round(netCents * f / all);
}

/**
 * The F&B part of Money's pro-shop figures for a tee-date range: walk-up sales (by the
 * day paid, as `walkUpCents`) and items on collected rounds (as `shopOnRoundsCents`). Each
 * figure is split by its lines' gross share, so F&B + the rest add up to those figures.
 */
export async function fnbCents(courseId: string, tz: string, range: { from: string; to: string }, totals: { walkUpCents: number; shopOnRoundsCents: number }): Promise<number> {
  const [sales, bookings] = await Promise.all([
    prisma.shopSale.findMany({
      where: { courseId, status: { in: ['paid_cash', 'paid_card', 'paid_account'] }, paidAt: { gte: dayStart(tz, range.from), lt: dayStart(tz, addDaysStr(range.to, 1)) } },
      select: { totalCents: true, taxCents: true, refundedCents: true, roundsCents: true, lines: { select: { unitPriceCents: true, quantity: true, returnedQty: true, bookingId: true, shopItem: { select: { category: true, taxCategory: true } } } } },
    }),
    prisma.booking.findMany({
      where: { courseId, status: { not: 'cancelled' }, paymentStatus: { in: ['paid', 'paid_offline', 'on_account'] }, teeTime: { date: { gte: range.from, lte: range.to } } },
      select: { shopItems: { select: { unitPriceCents: true, quantity: true, taxCategory: true, shopItem: { select: { category: true } } } } },
    }),
  ]);
  let walk = 0;
  for (const s of sales) {
    const net = walkUpNet([s]).cents;
    const lines = s.lines.filter(l => !l.bookingId).map(l => ({ cents: l.unitPriceCents * Math.max(0, l.quantity - l.returnedQty), fnb: isFnb(l.shopItem?.taxCategory, l.shopItem?.category) }));
    walk += fnbPart(net, lines);
  }
  const roundLines = bookings.flatMap(b => b.shopItems.map(l => ({ cents: l.unitPriceCents * l.quantity, fnb: isFnb(l.taxCategory, l.shopItem?.category) })));
  const onRounds = fnbPart(totals.shopOnRoundsCents, roundLines);
  return Math.min(totals.walkUpCents + totals.shopOnRoundsCents, Math.min(walk, totals.walkUpCents) + onRounds);
}

export type Segments = { teeCents: number; cartCents: number; shopCents: number; eventCents: number; fnbCents: number; totalCents: number };
/**
 * Pure: the Revenue page's segments from Money's figures (lib/analytics) and the F&B part.
 * Tee is rounds kept less carts plus late-cancel fees kept; the shop is walk-up and items on
 * rounds less F&B. The total is their sum (collectedCents stays rounds only).
 */
export function segmentsOf(r: { collectedCents: number; cartCents: number; lateFeesKeptCents: number; walkUpCents: number; shopOnRoundsCents: number; eventCents: number }, fnb: number): Segments {
  const seg = {
    teeCents: r.collectedCents - r.cartCents + r.lateFeesKeptCents,
    cartCents: r.cartCents,
    shopCents: r.walkUpCents + r.shopOnRoundsCents - fnb,
    eventCents: r.eventCents,
    fnbCents: fnb,
  };
  return { ...seg, totalCents: seg.teeCents + seg.cartCents + seg.shopCents + seg.eventCents + seg.fnbCents };
}

export type HowPaid = { onlineCents: number; readerCents: number; cashCents: number; otherCents: number; totalCents: number };

/** Pure: money taken by how it was paid (the course's part, less what went back the same way). Card not at a reader counts as online. */
export function howPaidOf(rows: { method: string; direction: string; amountCents: number; platformFeeCents: number }[]): HowPaid {
  const h = { onlineCents: 0, readerCents: 0, cashCents: 0, otherCents: 0, totalCents: 0 };
  for (const r of rows) {
    const c = valueOf(r);
    if (r.method === 'card') h.onlineCents += c;
    else if (r.method === 'card_present') h.readerCents += c;
    else if (r.method === 'cash') h.cashCents += c;
    else h.otherCents += c;
    h.totalCents += c;
  }
  return h;
}

export async function howPaid(courseId: string, tz: string, range: { from: string; to: string }): Promise<HowPaid> {
  const rows = await prisma.moneyMove.findMany({
    where: { ...counted(courseId), at: { gte: dayStart(tz, range.from), lt: dayStart(tz, addDaysStr(range.to, 1)) } },
    select: { method: true, direction: true, amountCents: true, platformFeeCents: true },
  });
  return howPaidOf(rows);
}

// ─── Every segment, by payment day (the chart, "vs the period before", how it was paid) ───

export type AllSegments = {
  bucket: 'day' | 'week';
  /** Each day (or Monday-start week) of the range, oldest first, empty ones included. */
  series: { key: string; cents: number }[];
  /** By weekday (0 = Sunday): the total and how many of that weekday the range has, today left out (it isn't over). */
  byDow: { dow: number; cents: number; days: number }[];
  /** By course-local hour of payment. */
  byHour: { hour: number; cents: number }[];
  totalCents: number;
  /** The same length of time just before the range. */
  beforeTotalCents: number;
  paid: HowPaid;
};

const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const weekOf = (d: string) => addDaysStr(d, -((dowOf(d) + 6) % 7));

/**
 * Pure: the every-segment figures from ledger rows already placed on their course-local day and
 * hour. The same counting rule as todayVsAverage and howPaid (the course's part, less money given
 * back, dues and GreenReserve's own fee out), so every money-by-time figure on the page agrees.
 */
export function allOf(rows: { day: string; minute: number; method: string; direction: string; amountCents: number; platformFeeCents: number }[], range: { from: string; to: string }, today: string, beforeTotalCents: number): AllSegments {
  const bucket: AllSegments['bucket'] = daysBetween(range.from, range.to) > 45 ? 'week' : 'day';
  const keyOf = (d: string) => (bucket === 'week' ? weekOf(d) : d);
  const series = new Map<string, number>();
  for (let d = range.from; d <= range.to; d = addDaysStr(d, 1)) series.set(keyOf(d), series.get(keyOf(d)) ?? 0);
  const dow = Array.from({ length: 7 }, (_, i) => ({ dow: i, cents: 0, days: 0 }));
  for (let d = range.from; d <= range.to; d = addDaysStr(d, 1)) if (d !== today) dow[dowOf(d)].days++;
  const hour = new Map<number, number>();
  let total = 0;
  const inRange = rows.filter(r => r.day >= range.from && r.day <= range.to);
  for (const r of inRange) {
    const v = valueOf(r);
    total += v;
    series.set(keyOf(r.day), (series.get(keyOf(r.day)) ?? 0) + v);
    if (r.day !== today) dow[dowOf(r.day)].cents += v;
    const h = Math.floor(r.minute / 60);
    hour.set(h, (hour.get(h) ?? 0) + v);
  }
  return {
    bucket,
    series: [...series.entries()].map(([key, cents]) => ({ key, cents })),
    byDow: dow,
    byHour: [...hour.entries()].sort((a, b) => a[0] - b[0]).map(([h, cents]) => ({ hour: h, cents })),
    totalCents: total, beforeTotalCents, paid: howPaidOf(inRange),
  };
}

export async function allSegments(courseId: string, tz: string, range: { from: string; to: string }, before: { from: string; to: string }, now: Date = new Date()): Promise<AllSegments> {
  const read = (r: { from: string; to: string }) => prisma.moneyMove.findMany({
    where: { ...counted(courseId), at: { gte: dayStart(tz, r.from), lt: dayStart(tz, addDaysStr(r.to, 1)) } },
    select: { at: true, method: true, direction: true, amountCents: true, platformFeeCents: true },
  });
  const [rows, prev] = await Promise.all([read(range), read(before)]);
  return allOf(rows.map(r => ({ ...r, ...localDayMinute(tz, r.at) })), range, todayIn(tz, now), prev.reduce((s, r) => s + valueOf(r), 0));
}

// ─── Stripe mismatch, per payment ───────────────────────────────────────────

export type DiffKind = 'refund_in_stripe' | 'not_in_stripe' | 'not_here' | 'amount_differs' | 'other_day' | 'stripe_adjustment';
export type DiffItem = { stripeId: string; kind: DiffKind; /** The payment it belongs to (a refund's charge), '' when none. */ paymentStripeId: string; at: string; who: string; href: string | null; ourCents: number | null; stripeCents: number | null; note: string };
export type Mismatch = { ourCents: number; stripeCents: number; diffCents: number; payments: DiffItem[] };

/** One side's record of one Stripe object (a payment, a refund, a dispute movement), signed. */
export type Side = { key: string; day: string; at: string; cents: number; kind: 'charge' | 'refund' | 'dispute' | 'adjustment'; paymentIntent?: string | null };

/**
 * Pure: the payments that make a day differ. `ours` and `theirs` cover the day and the days
 * either side, so a payment recorded just across midnight reads as "other day", not missing.
 * `ourCharges` are the payment intents the ledger has a charge for (to tell a refund made
 * in Stripe on a payment we have from one we've never seen).
 */
export function diffItems(day: string, ours: Side[], theirs: Side[], ourCharges: Set<string>): { key: string; kind: DiffKind; ours: Side | null; theirs: Side | null }[] {
  const sum = (xs: Side[]) => {
    const m = new Map<string, Side>();
    for (const x of xs) { const c = m.get(x.key); m.set(x.key, c ? { ...c, cents: c.cents + x.cents } : { ...x }); }
    return m;
  };
  const a = sum(ours), b = sum(theirs);
  const out: { key: string; kind: DiffKind; ours: Side | null; theirs: Side | null }[] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const o = a.get(key) ?? null, t = b.get(key) ?? null;
    if (o?.day !== day && t?.day !== day) continue;
    if (o && t) {
      if (o.day !== t.day) out.push({ key, kind: 'other_day', ours: o, theirs: t });
      else if (o.cents !== t.cents) out.push({ key, kind: 'amount_differs', ours: o, theirs: t });
      continue;
    }
    if (o) { out.push({ key, kind: 'not_in_stripe', ours: o, theirs: null }); continue; }
    const kind: DiffKind = t!.kind === 'adjustment' ? 'stripe_adjustment'
      : t!.kind === 'refund' && t!.paymentIntent && ourCharges.has(t!.paymentIntent) ? 'refund_in_stripe' : 'not_here';
    out.push({ key, kind, ours: null, theirs: t });
  }
  return out.sort((x, y) => ((x.theirs ?? x.ours)!.at < (y.theirs ?? y.ours)!.at ? -1 : 1));
}

const NOTE: Record<DiffKind, string> = {
  refund_in_stripe: 'Refunded in Stripe directly. GreenReserve still has it as paid.',
  not_in_stripe: 'Recorded here as card money, but Stripe has no matching payment.',
  not_here: 'In Stripe, but not recorded in GreenReserve.',
  amount_differs: 'Stripe has a different amount for this payment.',
  other_day: 'The same payment, recorded on the next or previous day. Not a real difference.',
  stripe_adjustment: 'A Stripe balance adjustment (for example a failed refund returned to the balance). GreenReserve has no record of it.',
};

const CARD_TYPES = ['charge', 'payment', 'refund', 'payment_refund', 'adjustment', 'payment_failure_refund'];
// The same cap as the day list (ledger-view stripeByDay).
const MAX_TXNS = 10_000;
const STRIPE_TIMEOUT_MS = 10_000;
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null);

/**
 * The per-payment detail for one course-local day. `read` false: no active Stripe account,
 * Stripe couldn't be read, or too many movements to itemise — never a guess. `mismatch` null
 * with `read` true: the day matches Stripe.
 */
export type DayDetail = { read: boolean; mismatch: Mismatch | null };
export async function stripeDayDetail(courseId: string, day: string): Promise<DayDetail> {
  const unread: DayDetail = { read: false, mismatch: null };
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, stripeAccountId: true, stripeAccountActive: true } });
  if (!course?.stripeAccountActive || !course.stripeAccountId) return unread;
  const tz = course.timezone;
  const from = dayStart(tz, addDaysStr(day, -1)), to = dayStart(tz, addDaysStr(day, 2));

  const theirs: Side[] = [];
  try {
    let n = 0;
    for await (const t of stripe.balanceTransactions.list(
      { created: { gte: Math.floor(from.getTime() / 1000), lt: Math.floor(to.getTime() / 1000) }, limit: 100, expand: ['data.source'] },
      { stripeAccount: course.stripeAccountId, timeout: STRIPE_TIMEOUT_MS },
    )) {
      if (++n > MAX_TXNS) return unread;
      if (t.currency !== 'usd' || !CARD_TYPES.includes(t.type)) continue;
      const at = new Date(t.created * 1000);
      const src = t.source as unknown as Record<string, unknown> | string | null;
      const srcId = idOf(src) ?? t.id;
      const obj = typeof src === 'object' && src ? src : {};
      let key = srcId, kind: Side['kind'] = 'charge', pi: string | null = null;
      if (t.type === 'charge' || t.type === 'payment') { key = idOf(obj.payment_intent) ?? srcId; pi = key; }
      else if (t.type === 'adjustment') {
        // Dispute money (withdrawn, reinstated): the ledger keys it "<dispute>:withdrawn|reinstated".
        // Any other adjustment still counts (the day list counts it) and is listed on its own.
        if (obj.object === 'dispute') { kind = 'dispute'; key = `${srcId}:${t.amount < 0 ? 'withdrawn' : 'reinstated'}`; pi = idOf(obj.payment_intent); }
        else { kind = 'adjustment'; key = t.id; }
      } else { kind = 'refund'; pi = idOf(obj.payment_intent); }
      theirs.push({ key, day: dayOf(tz, at), at: at.toISOString(), cents: t.amount, kind, paymentIntent: pi });
    }
  } catch (err) {
    console.error(JSON.stringify({ ev: 'revenue.stripe_day_read.fail', error: err instanceof Error ? err.message : String(err) }));
    return unread;
  }

  const rows = await prisma.moneyMove.findMany({
    where: { courseId, account: 'course', method: { in: ['card', 'card_present'] }, at: { gte: from, lt: to } },
    select: { id: true, at: true, what: true, direction: true, method: true, account: true, amountCents: true, platformFeeCents: true, stripeId: true, bookingId: true, saleId: true, membershipId: true, eventPaymentId: true, actor: true, note: true },
  });
  const onDay = rows.filter(r => dayOf(tz, r.at) === day);
  const ourCents = sumDay(day, onDay).courseCardNetCents;
  const stripeCents = theirs.filter(t => t.day === day).reduce((s, t) => s + t.cents, 0);
  if (ourCents === stripeCents) return { read: true, mismatch: null };

  const ours: Side[] = rows.map(r => ({
    // A card row with no Stripe id can only ever be "not in Stripe".
    key: r.stripeId || `ledger:${r.id}`, day: dayOf(tz, r.at), at: r.at.toISOString(),
    cents: (r.direction === 'out' ? -1 : 1) * r.amountCents,
    kind: r.stripeId?.includes(':') ? 'dispute' : r.direction === 'out' ? 'refund' : 'charge',
  }));
  // A refund made in Stripe is usually on a payment from days or weeks before: look its charge up by id.
  const refundPis = [...new Set(theirs.filter(t => t.kind === 'refund' && t.paymentIntent).map(t => t.paymentIntent!))];
  const charged = refundPis.length ? await prisma.moneyMove.findMany({ where: { courseId, direction: 'in', stripeId: { in: refundPis } }, select: { stripeId: true } }) : [];
  const ourCharges = new Set(charged.map(r => r.stripeId!));
  const items = diffItems(day, ours, theirs, ourCharges);

  // Who and where: our own row, or for something only Stripe has, the charge it belongs to.
  const wanted = new Set(items.map(i => (i.ours ? i.key : i.theirs?.paymentIntent ?? '')).filter(Boolean));
  const known = await prisma.moneyMove.findMany({
    where: { courseId, stripeId: { in: [...wanted].filter(k => !k.startsWith('ledger:')) } },
    select: { id: true, at: true, what: true, direction: true, method: true, account: true, amountCents: true, platformFeeCents: true, stripeId: true, bookingId: true, saleId: true, membershipId: true, eventPaymentId: true, actor: true, note: true },
  });
  const plain = [...known, ...rows.filter(r => !r.stripeId && wanted.has(`ledger:${r.id}`))];
  const described = await describeMoves(courseId, plain);
  const byKey = new Map<string, LedgerRow>(described.map(d => [d.stripeId || `ledger:${d.id}`, d]));

  const payments: DiffItem[] = items.map(i => {
    const d = byKey.get(i.ours ? i.key : i.theirs?.paymentIntent ?? '');
    return {
      stripeId: i.key.startsWith('ledger:') ? '' : i.key,
      kind: i.kind,
      paymentStripeId: i.theirs?.kind === 'refund' || i.theirs?.kind === 'dispute' ? i.theirs.paymentIntent ?? '' : (i.theirs?.kind === 'charge' || (!i.theirs && i.ours?.kind === 'charge')) && !i.key.startsWith('ledger:') ? i.key : '',
      at: (i.theirs?.day === day ? i.theirs : i.ours ?? i.theirs)!.at,
      who: d?.who ?? '', href: d?.href ?? null,
      ourCents: i.ours?.cents ?? null, stripeCents: i.theirs?.cents ?? null,
      note: NOTE[i.kind],
    };
  });
  return { read: true, mismatch: { ourCents, stripeCents, diffCents: stripeCents - ourCents, payments } };
}

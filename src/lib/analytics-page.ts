// Analytics page data (Cam 2026-11-17, lanes/dashboard.md item 5; lanes/build.md "Analytics data").
// Read-only, one course, nothing moves. What the approved page needs that lib/analytics.ts didn't give:
//
//  • ledgerHeadline — the page's Revenue tile and chart: lib/revenue-extras allSegments, the exact object
//    the Revenue page shows as `all`, so the two pages can't disagree. Every money figure on Analytics comes
//    from the ledger (MoneyMove, the course's part: amount less GreenReserve's fee), never analytics.ts sums.
//  • noShowReport — no-shows by how they booked, spots filled again by how far ahead the golfer cancelled,
//    and late cancels. "Value" figures (lostValueCents) are what the booking was priced at: money that never
//    moved, so it can't come from the ledger and is never called revenue. Fees and refills ARE ledger money.
//  • stockValue — what's on the shelf (inventory at price, and at cost for the owner), and what isn't selling.
//
// Sets match lib/analytics.ts (tee-date basis, NO_SHOW_GRACE_MIN, called-off rounds kept out of cancellations),
// so the No-shows tab's rate is the same number as Analytics' own.
import { prisma } from './prisma';
import { DEFAULT_TZ, isValidTimezone } from './course-time';
import { teeToUtcMs } from './tee-time-utils';
import { holdsAtCutoff, bookingWindowHours } from './cancel-policy';
import { NO_SHOW_GRACE_MIN, previousRange, type Range } from './analytics';
import { allSegments, type AllSegments } from './revenue-extras';
import { Prisma, type BookingEventType } from '@prisma/client';

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const share = (b: { greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number }) => b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal;
/** The ledger kinds that are a fee for not playing: a hold kept, a late-cancel fee, a no-show fee. */
export const FEE_WHATS = ['no_show_fee', 'late_fee', 'hold'] as const;

async function courseTz(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, cancellationHours: true } });
  if (!c) return null;
  return { tz: c.timezone && isValidTimezone(c.timezone) ? c.timezone : DEFAULT_TZ, cancellationHours: c.cancellationHours };
}

/** Id lists in pieces: Postgres takes at most 32,767 bound values per statement (a busy course over a long range). */
export const chunks = <T>(xs: T[], n = 10_000): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The course's part of ledger money for these bookings and kinds, in less out, per booking. */
async function ledgerByBooking(courseId: string, bookingIds: string[], what: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!bookingIds.length) return out;
  const rows = (await Promise.all(chunks(bookingIds).map(ids => prisma.moneyMove.findMany({
    where: { courseId, account: 'course', what: { in: [...what] }, bookingId: { in: ids } },
    select: { bookingId: true, direction: true, amountCents: true, platformFeeCents: true },
  })))).flat();
  for (const r of rows) {
    const v = (r.amountCents - r.platformFeeCents) * (r.direction === 'out' ? -1 : 1);
    out.set(r.bookingId!, (out.get(r.bookingId!) ?? 0) + v);
  }
  return out;
}

// ─── The Revenue tile and chart ─────────────────────────────────────────────

export type LedgerHeadline = {
  range: Range; grossCents: number; refundsCents: number; netCents: number; series: AllSegments['series'];
  before: { range: Range; grossCents: number; series: AllSegments['series'] };
};

/** The Revenue page's own figure (allSegments) for these dates, and the period before for the dashed line. */
export async function ledgerHeadline(courseId: string, range: Range, now: Date = new Date()): Promise<LedgerHeadline | null> {
  const c = await courseTz(courseId);
  if (!c) return null;
  const prev = previousRange(range);
  const [cur, before] = await Promise.all([
    allSegments(courseId, c.tz, range, prev, now),
    allSegments(courseId, c.tz, prev, previousRange(prev), now),
  ]);
  return {
    range, grossCents: cur.grossCents, refundsCents: cur.refundsCents, netCents: cur.netCents, series: cur.series,
    before: { range: prev, grossCents: before.grossCents, series: before.series },
  };
}

// ─── No-shows, refills, late cancels ────────────────────────────────────────

/** Five rows (agreed with the Dashboard lane, 2026-11-17): online splits by card and fee; the counter by card only. */
export type HowKey = 'online_card_fee' | 'online_card_no_fee' | 'online_no_card' | 'counter_card' | 'counter_no_card';
export const HOW_KEYS: HowKey[] = ['online_card_fee', 'online_card_no_fee', 'online_no_card', 'counter_card', 'counter_no_card'];
export type LeadKey = '7d_plus' | '2_7d' | '24_48h' | 'under_24h';
export const LEAD_KEYS: LeadKey[] = ['7d_plus', '2_7d', '24_48h', 'under_24h'];

/** Pure: how far ahead a cancel was, by the page's four buckets. */
export function leadOf(hoursAhead: number): LeadKey {
  if (hoursAhead >= 168) return '7d_plus';
  if (hoursAhead >= 48) return '2_7d';
  if (hoursAhead >= 24) return '24_48h';
  return 'under_24h';
}

/** One booking as the report reads it. */
export type NsBooking = {
  id: string; teeTimeId: string; teeAt: number; status: string; players: number; source: string;
  checkedInAt: Date | null; createdAt: Date; cancelledAt: Date | null; splitFromId: string | null;
  cardSaved: boolean; feeOnNoShow: boolean; valueCents: number; calledOff: boolean;
  /** The round is paid (card, counter or account): never money lost, even if no one checked in. */
  paid: boolean;
  /** The late-cancel window this booking was made under (R-PAY-003). */
  windowHours: number;
};

/** Pure: how a booking was made, for the No-shows table. Counter = phone or walk-in. */
export function howOf(b: Pick<NsBooking, 'source' | 'cardSaved' | 'feeOnNoShow'>): HowKey {
  if (b.source !== 'online') return b.cardSaved ? 'counter_card' : 'counter_no_card';
  return !b.cardSaved ? 'online_no_card' : b.feeOnNoShow ? 'online_card_fee' : 'online_card_no_fee';
}

/**
 * Pure: which cancelled spots were filled again. A cancelled spot counts as filled again when the same tee
 * time got a new booking (not a split part, not itself cancelled) made after the cancel. Each new booking's
 * players fill spots once, earliest cancel first. Returns each (cancel, new booking, spots) pairing.
 */
export function refillsOf(bookings: Pick<NsBooking, 'id' | 'teeTimeId' | 'status' | 'players' | 'createdAt' | 'splitFromId'>[], cancels: Pick<NsBooking, 'id' | 'teeTimeId' | 'players' | 'cancelledAt'>[]): { cancelId: string; newId: string; spots: number }[] {
  const pairs: { cancelId: string; newId: string; spots: number }[] = [];
  const used = new Map<string, number>();
  const byTime = new Map<string, typeof bookings>();
  for (const b of bookings) if (b.status !== 'cancelled' && !b.splitFromId) byTime.set(b.teeTimeId, [...(byTime.get(b.teeTimeId) ?? []), b]);
  for (const list of byTime.values()) list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const order = cancels.filter(c => c.cancelledAt).sort((a, b) => a.cancelledAt!.getTime() - b.cancelledAt!.getTime());
  for (const c of order) {
    let need = c.players;
    for (const n of byTime.get(c.teeTimeId) ?? []) {
      if (need <= 0) break;
      if (n.createdAt.getTime() <= c.cancelledAt!.getTime()) continue;
      const free = n.players - (used.get(n.id) ?? 0);
      if (free <= 0) continue;
      const take = Math.min(free, need);
      used.set(n.id, (used.get(n.id) ?? 0) + take); need -= take;
      pairs.push({ cancelId: c.id, newId: n.id, spots: take });
    }
  }
  return pairs;
}

export type HowRow = { key: HowKey; bookings: number; noShows: number; ratePct: number | null; lostValueCents: number; recoveredCents: number; netCents: number };
export type NoShowReport = {
  range: Range; lateCancelHours: number;
  totals: { bookings: number; noShows: number; ratePct: number | null; lostValueCents: number; recoveredCents: number; lateCancelNetCents: number; netCents: number };
  byHow: HowRow[];
  refill: { buckets: { key: LeadKey; cancelledSpots: number; refilledSpots: number; pct: number | null }[]; under48hPct: number | null; unknownLead: number };
  lateCancels: { spots: number; lostValueCents: number; refilledSpots: number; refilledCents: number; feesCents: number; netCents: number };
};

/**
 * Pure: the report from bookings already flattened, and the ledger's money per booking.
 * `fees` = hold / late-cancel / no-show fee money; `rounds` = round money (for what a refill brought in).
 */
export function noShowOf(range: Range, all: NsBooking[], nowMs: number, lateCancelHours: number, fees: Map<string, number>, rounds: Map<string, number>): NoShowReport {
  const live = all.filter(b => b.status !== 'cancelled');
  const pastLive = live.filter(b => b.teeAt + NO_SHOW_GRACE_MIN * 60000 < nowMs);
  const isNoShow = (b: NsBooking) => !b.checkedInAt && b.status !== 'completed';
  // In the rate as lib/analytics.ts counts it, but a round already paid ("Collect payment") lost nothing.
  const lostOf = (b: NsBooking) => (b.paid ? 0 : b.valueCents);
  const rows = new Map<HowKey, HowRow>();
  for (const b of pastLive) {
    const k = howOf(b);
    const r = rows.get(k) ?? { key: k, bookings: 0, noShows: 0, ratePct: null, lostValueCents: 0, recoveredCents: 0, netCents: 0 };
    r.bookings++;
    if (isNoShow(b)) { r.noShows++; r.lostValueCents += lostOf(b); r.recoveredCents += fees.get(b.id) ?? 0; }
    rows.set(k, r);
  }
  const byHow = HOW_KEYS.filter(k => rows.has(k)).map(k => { const r = rows.get(k)!; return { ...r, ratePct: pct(r.noShows, r.bookings), netCents: r.recoveredCents - r.lostValueCents }; });

  const cancelled = all.filter(b => b.status === 'cancelled' && !b.calledOff);
  const pairs = refillsOf(all, cancelled);
  const players = new Map(all.map(b => [b.id, b.players]));
  const filled = new Map<string, number>(), refillMoney = new Map<string, number>();
  for (const p of pairs) {
    filled.set(p.cancelId, (filled.get(p.cancelId) ?? 0) + p.spots);
    // What the refilling booking's round brought in, for the spots it filled (its round money × spots ÷ its players).
    const n = players.get(p.newId) ?? 0;
    const cents = n > 0 ? ((rounds.get(p.newId) ?? 0) * p.spots) / n : 0;
    refillMoney.set(p.cancelId, (refillMoney.get(p.cancelId) ?? 0) + cents);
  }
  const buckets = new Map(LEAD_KEYS.map(k => [k, { key: k, cancelledSpots: 0, refilledSpots: 0, pct: null as number | null }]));
  let unknownLead = 0, under48 = 0, under48Filled = 0, lateRefill = 0;
  const late = { spots: 0, lostValueCents: 0, refilledSpots: 0, refilledCents: 0, feesCents: 0, netCents: 0 };
  for (const c of cancelled) {
    if (!c.cancelledAt) { unknownLead++; continue; }
    const hrs = (c.teeAt - c.cancelledAt.getTime()) / 3600000;
    const bk = buckets.get(leadOf(hrs))!;
    const got = filled.get(c.id) ?? 0;
    bk.cancelledSpots += c.players; bk.refilledSpots += got;
    if (hrs < 48) { under48 += c.players; under48Filled += got; }
    // Late = inside the window this booking was made under (the fee was charged on it), not today's setting.
    if (hrs < c.windowHours) {
      late.feesCents += fees.get(c.id) ?? 0;
      late.spots += c.players; late.lostValueCents += c.valueCents; late.refilledSpots += got;
      lateRefill += refillMoney.get(c.id) ?? 0;
    }
  }
  late.refilledCents = Math.round(lateRefill);
  late.netCents = late.refilledCents + late.feesCents - late.lostValueCents;
  for (const b of buckets.values()) b.pct = pct(b.refilledSpots, b.cancelledSpots);

  const noShows = pastLive.filter(isNoShow);
  const lost = noShows.reduce((s, b) => s + lostOf(b), 0);
  const recovered = noShows.reduce((s, b) => s + (fees.get(b.id) ?? 0), 0);
  return {
    range, lateCancelHours,
    totals: { bookings: pastLive.length, noShows: noShows.length, ratePct: pct(noShows.length, pastLive.length), lostValueCents: lost, recoveredCents: recovered, lateCancelNetCents: late.netCents, netCents: recovered - lost + late.netCents },
    byHow,
    refill: { buckets: [...buckets.values()], under48hPct: pct(under48Filled, under48), unknownLead },
    lateCancels: late,
  };
}

export async function noShowReport(courseId: string, range: Range, now: Date = new Date()): Promise<NoShowReport | null> {
  const c = await courseTz(courseId);
  if (!c) return null;
  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: range.from, lte: range.to } },
    select: {
      id: true, date: true, time: true,
      bookings: { select: {
        id: true, status: true, players: true, source: true, checkedInAt: true, createdAt: true, cancelledAt: true, splitFromId: true,
        greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, stripePaymentMethodId: true, stripeCustomerId: true,
        noShowFeeTotal: true, cancellationFeeTotal: true, lateFeeTimingAtBooking: true, cancellationHoursAtBooking: true, paymentStatus: true,
      } },
    },
  });
  const cancelledIds = teeTimes.flatMap(t => t.bookings.filter(b => b.status === 'cancelled').map(b => b.id));
  const events = (await Promise.all(chunks(cancelledIds).map(ids => prisma.bookingEvent.findMany({
    where: { courseId, type: 'booking_cancelled' satisfies BookingEventType, bookingId: { in: ids } },
    select: { bookingId: true, metadata: true },
  })))).flat();
  const calledOff = new Set(events.filter(e => { const m = e.metadata as { courseCalledOff?: unknown } | null; return m?.courseCalledOff === 'weather' || m?.courseCalledOff === 'closure'; }).map(e => e.bookingId));
  const all: NsBooking[] = teeTimes.flatMap(t => {
    const teeAt = teeToUtcMs(t.date, t.time, c.tz);
    return t.bookings.map(b => ({
      id: b.id, teeTimeId: t.id, teeAt, status: b.status, players: b.players, source: b.source,
      checkedInAt: b.checkedInAt, createdAt: b.createdAt, cancelledAt: b.cancelledAt, splitFromId: b.splitFromId,
      cardSaved: !!b.stripePaymentMethodId && !!b.stripeCustomerId,
      // A fee the course can keep when they don't come: a no-show fee, or a late fee stamped at booking whose
      // policy reaches a no-show (a hold taken at the cutoff and kept; "late cancel or no-show"). A plain
      // "late cancel" fee never reaches a no-show. cancellationFeeTotal stays on a live booking (cleared only on a free cancel).
      feeOnNoShow: b.noShowFeeTotal > 0 || (b.cancellationFeeTotal > 0 && (holdsAtCutoff(b) || b.lateFeeTimingAtBooking === 'late_cancel_or_no_show')),
      valueCents: share(b), calledOff: calledOff.has(b.id),
      paid: b.paymentStatus === 'paid' || b.paymentStatus === 'paid_offline' || b.paymentStatus === 'on_account',
      windowHours: bookingWindowHours(b, c),
    }));
  });
  // Ask the ledger only for what the report reads: fees on possible no-shows and on cancels, round money on refills.
  const feeIds = all.filter(b => b.status === 'cancelled' ? !b.calledOff : !b.checkedInAt && b.status !== 'completed').map(b => b.id);
  const refillIds = [...new Set(refillsOf(all, all.filter(b => b.status === 'cancelled' && !b.calledOff)).map(p => p.newId))];
  const [fees, rounds] = await Promise.all([ledgerByBooking(courseId, feeIds, FEE_WHATS), ledgerByBooking(courseId, refillIds, ['round'])]);
  return noShowOf(range, all, now.getTime(), c.cancellationHours, fees, rounds);
}

// ─── Pro shop stock ─────────────────────────────────────────────────────────

export const STALE_DAYS = 60;
export type StockItem = { id: string; name: string; inStock: number; retailValueCents: number; costValueCents?: number | null; lastSoldAt: string | null };
export type StockValue = {
  units: number; items: number; retailValueCents: number; costValueCents?: number; costUnknownItems?: number; uncountedItems: number;
  notSelling: StockItem[]; notSellingRetailCents: number; notSellingCostCents?: number; staleDays: number;
};

type StockRow = { id: string; name: string; stockCount: number | null; priceCents: number; costCents: number | null; createdAt: Date; hasOptions: boolean };

/** Pure: shelf value and what hasn't sold in `staleDays` (never sold counts once the item is that old). */
export function stockOf(rows: StockRow[], lastSold: Map<string, Date>, now: Date, opts: { cost: boolean }, staleDays = STALE_DAYS): StockValue {
  const cutoff = now.getTime() - staleDays * 86400000;
  let units = 0, items = 0, retail = 0, cost = 0, costUnknown = 0, uncounted = 0;
  const notSelling: StockItem[] = [];
  for (const r of rows) {
    if (r.hasOptions) continue; // a parent with options isn't sold itself; its options carry the stock
    if (r.stockCount == null) { uncounted++; continue; }
    if (r.stockCount <= 0) continue;
    units += r.stockCount; items++;
    const rv = r.stockCount * r.priceCents;
    const cv = r.costCents != null ? r.stockCount * r.costCents : null;
    retail += rv;
    if (cv == null) costUnknown++; else cost += cv;
    const last = lastSold.get(r.id) ?? null;
    const stale = last ? last.getTime() < cutoff : r.createdAt.getTime() < cutoff;
    if (stale) notSelling.push({ id: r.id, name: r.name, inStock: r.stockCount, retailValueCents: rv, ...(opts.cost ? { costValueCents: cv } : {}), lastSoldAt: last ? last.toISOString() : null });
  }
  notSelling.sort((a, b) => b.retailValueCents - a.retailValueCents);
  return {
    units, items, retailValueCents: retail, ...(opts.cost ? { costValueCents: cost, costUnknownItems: costUnknown } : {}), uncountedItems: uncounted,
    notSelling: notSelling.slice(0, 100), notSellingRetailCents: notSelling.reduce((s, i) => s + i.retailValueCents, 0),
    ...(opts.cost ? { notSellingCostCents: notSelling.reduce((s, i) => s + (i.costValueCents ?? 0), 0) } : {}),
    staleDays,
  };
}

export async function stockValue(courseId: string, opts: { cost: boolean }, now: Date = new Date()): Promise<StockValue> {
  const items = await prisma.shopItem.findMany({
    // The Stock screen's own rows (lib/shop-stock stockRows): active, sellable, under an active parent. A deleted
    // item that once sold is hidden with its count kept, and must not count as on the shelf.
    where: { courseId, active: true, options: { none: {} }, OR: [{ parentId: null }, { parent: { active: true } }] },
    select: { id: true, name: true, stockCount: true, priceCents: true, costCents: true, createdAt: true, _count: { select: { options: true } } },
    take: 5000,
  });
  const stocked = items.filter(i => (i.stockCount ?? 0) > 0).map(i => i.id);
  const lastSold = new Map<string, Date>();
  if (stocked.length) {
    // The latest paid sale of each stocked item, at the register or on a round. This course only, through the sale / booking.
    const rows = await prisma.$queryRaw<{ id: string; at: Date | null }[]>`
      SELECT x.id, MAX(x.at) AS at FROM (
        SELECT l."shopItemId" AS id, s."paidAt" AS at FROM "ShopSaleLine" l JOIN "ShopSale" s ON s.id = l."saleId"
         WHERE s."courseId" = ${courseId} AND s.status IN ('paid_cash', 'paid_card', 'paid_account') AND s."paidAt" IS NOT NULL AND l."shopItemId" IN (${Prisma.join(stocked)})
        UNION ALL
        SELECT i."shopItemId" AS id, COALESCE(b."paidAt", i."createdAt") AS at FROM "BookingShopItem" i JOIN "Booking" b ON b.id = i."bookingId"
         WHERE b."courseId" = ${courseId} AND b."paymentStatus" IN ('paid', 'paid_offline', 'on_account') AND i."shopItemId" IN (${Prisma.join(stocked)})
      ) x GROUP BY x.id`;
    for (const r of rows) if (r.at) lastSold.set(r.id, new Date(r.at));
  }
  return stockOf(items.map(i => ({ id: i.id, name: i.name, stockCount: i.stockCount, priceCents: i.priceCents, costCents: i.costCents, createdAt: i.createdAt, hasOptions: i._count.options > 0 })), lastSold, now, opts);
}

/** The pro shop's revenue for these dates from the ledger: shop and food & beverage (items on rounds included). */
export async function shopLedgerCents(courseId: string, range: Range, now: Date = new Date()): Promise<number | null> {
  const c = await courseTz(courseId);
  if (!c) return null;
  const a = await allSegments(courseId, c.tz, range, previousRange(range), now);
  return a.segments.shopCents + a.segments.fnbCents;
}

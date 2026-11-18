// RANGE-1 (Cam 2026-11-17: "ONE list is the only price anywhere"; 2026-11-18: "Sell range balls with tee times").
// A course's range buckets are its pro-shop items with `rangeBalls` set (how many balls) — any number, each with its
// own name and price. The register sells them as ordinary shop items (POS-2: stock, tax, receipts, the ledger). On a
// tee time — added online or at checkout — they ride INSIDE the round's own price, as CART-3's buckets did:
// Booking.rangeBallsTotal (part of totalAmount), paid with the round wherever the round is paid. Each booking keeps
// its buckets as booked in Booking.rangeBuckets, so a later price change never reaches it. The old Course
// small/medium/large price columns are no longer read. Browser-safe: no Prisma values, only types.
//
// A booking made before RANGE-1 has only rangeBallsSize ("small:2") + rangeBallsTotal: it reads as ONE line "as
// booked" at exactly that total — kept whole or taken off whole, never re-priced (no price is ever made up for it).
import type { Prisma } from '@prisma/client';
import { ballCounts, ballWords } from './range-balls';

export const MAX_BUCKETS = 20;
export const MAX_BUCKET_BALLS = 2000;
/** The key of a pre-RANGE-1 booking's buckets in a checkout change. */
export const BOOKED_KEY = 'booked';

export type BucketItem = { id: string; name: string; rangeBalls: number | null; priceCents: number; active: boolean };
export type BucketLine = { itemId: string | null; name: string; balls: number | null; unitCents: number; qty: number };
type BookingBuckets = { rangeBuckets?: unknown; rangeBallsSize?: string | null; rangeBallsTotal: number };

const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

/** Pure: a stored snapshot, or null when it isn't one (never half-read). */
export function parseLines(v: unknown): BucketLine[] | null {
  if (!Array.isArray(v)) return null;
  const out: BucketLine[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') return null;
    const x = r as Record<string, unknown>;
    if (!(x.itemId === null || typeof x.itemId === 'string') || typeof x.name !== 'string') return null;
    if (!(x.balls === null || isInt(x.balls, 1, MAX_BUCKET_BALLS)) || !isInt(x.unitCents, 0, 1_000_000) || !isInt(x.qty, 1, MAX_BUCKETS)) return null;
    out.push({ itemId: x.itemId as string | null, name: x.name, balls: x.balls as number | null, unitCents: x.unitCents, qty: x.qty });
  }
  return out;
}

export const linesTotal = (lines: BucketLine[]) => lines.reduce((s, l) => s + l.unitCents * l.qty, 0);

/**
 * Pure: a booking's buckets as lines. A RANGE-1 snapshot that adds up to rangeBallsTotal is read as is; anything
 * else with buckets or a range total (an older booking) is ONE "as booked" line at exactly rangeBallsTotal.
 */
export function linesOf(b: BookingBuckets): BucketLine[] {
  const lines = parseLines(b.rangeBuckets);
  if (lines && linesTotal(lines) === b.rangeBallsTotal) return lines;
  const words = ballWords(ballCounts(b.rangeBallsSize));
  if (!words && !(b.rangeBallsTotal > 0)) return [];
  return [{ itemId: null, name: words ? `Range balls (${words}, as booked)` : 'Range balls (as booked)', balls: null, unitCents: b.rangeBallsTotal, qty: 1 }];
}

/** Pure: the buckets in words for the ticket and the sheet, e.g. "2 Small · 1 Jumbo". */
export function bucketWords(b: BookingBuckets): string {
  const lines = parseLines(b.rangeBuckets);
  if (lines && linesTotal(lines) === b.rangeBallsTotal) return lines.map(l => `${l.qty} ${l.name}`).join(' · ');
  return ballWords(ballCounts(b.rangeBallsSize));
}

/** The course's buckets (active first, then by price). Options of an item are never buckets. */
export async function courseBuckets(db: Prisma.TransactionClient | { shopItem: Prisma.TransactionClient['shopItem'] }, courseId: string, activeOnly = true): Promise<BucketItem[]> {
  return db.shopItem.findMany({
    where: { courseId, rangeBalls: { not: null }, parentId: null, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { priceCents: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, rangeBalls: true, priceCents: true, active: true },
  });
}

/** Whether the course sells buckets with online bookings (and so which list the booking page gets). */
export const onlineRangeOn = (c: { hasDrivingRange: boolean; sellRangeOnline: boolean; rangeBallsFree: boolean }) => c.hasDrivingRange && c.sellRangeOnline && !c.rangeBallsFree;

export type LinesResult = { ok: true; lines: BucketLine[]; total: number } | { ok: false; status: number; code: string; error: string };
const no = (status: number, code: string, error: string): LinesResult => ({ ok: false, status, code, error });
const lineFor = (it: BucketItem, unitCents: number, qty: number): BucketLine => ({ itemId: it.id, name: it.name, balls: it.rangeBalls, unitCents, qty });

/**
 * Pure: an online booking's buckets from what the page sent ([{ id, qty, unitCents? }]) and the course's active list, at
 * the list price now. Anything not on the list is refused (409 'range') — never booked without what the golfer picked —
 * and so is a bucket whose shown price (unitCents) differs from the price it would be charged (409 'range').
 */
export function priceOnline(request: unknown, list: BucketItem[]): LinesResult {
  if (request === undefined || request === null) return { ok: true, lines: [], total: 0 };
  if (!Array.isArray(request) || request.length > 20) return no(400, 'range', 'Range balls weren’t understood — refresh the page.');
  const byId = new Map(list.filter(i => i.active && i.rangeBalls != null).map(i => [i.id, i]));
  // The one price an online bucket is charged at; the shown-price check below compares against this same function,
  // so if online bucket pricing ever changes (a member or promo price) the check follows it.
  const chargedCents = (it: BucketItem) => it.priceCents;
  const qty = new Map<string, number>();
  for (const r of request) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof x.id !== 'string' || !isInt(x.qty, 0, MAX_BUCKETS)) return no(400, 'range', `Range balls are 0 to ${MAX_BUCKETS} of each bucket.`);
    if (x.qty === 0) continue;
    if (!byId.has(x.id)) return no(409, 'range', 'That range bucket isn’t offered any more — refresh the page.');
    // The price the page showed (optional, so an older page still books at the list price): a price changed while the
    // page was open is refused, never charged silently.
    if (x.unitCents !== undefined && x.unitCents !== null) {
      if (!isInt(x.unitCents, 0, 1_000_000)) return no(400, 'range', 'Range balls weren’t understood — refresh the page.');
      if (x.unitCents !== chargedCents(byId.get(x.id)!)) return no(409, 'range', 'That range bucket’s price changed — refresh the page.');
    }
    const n = (qty.get(x.id) ?? 0) + x.qty;
    if (n > MAX_BUCKETS) return no(400, 'range', `Range balls are 0 to ${MAX_BUCKETS} of each bucket.`);
    qty.set(x.id, n);
  }
  const lines = [...qty.entries()].map(([id, n]) => lineFor(byId.get(id)!, chargedCents(byId.get(id)!), n));
  return { ok: true, lines, total: linesTotal(lines) };
}

/**
 * Pure: a checkout change ({ [itemId | 'booked']: qty }, only the keys that change). A bucket already on the booking
 * keeps its booked price for every one of it (more of it too); a new bucket is at the list price now ($0 while the
 * course's balls come with a round). The "as booked" line of an older booking is kept or taken off whole.
 */
export function applyChange(current: BucketLine[], change: unknown, list: BucketItem[], free: boolean): LinesResult {
  if (!change || typeof change !== 'object' || Array.isArray(change)) return no(400, 'range', 'Range balls weren’t understood — refresh.');
  const active = new Map(list.filter(i => i.active && i.rangeBalls != null).map(i => [i.id, i]));
  const next = current.map(l => ({ ...l }));
  for (const [key, raw] of Object.entries(change as Record<string, unknown>)) {
    if (!isInt(raw, 0, MAX_BUCKETS)) return no(400, 'range', `Buckets are 0 to ${MAX_BUCKETS} of each.`);
    const at = key === BOOKED_KEY ? next.findIndex(l => l.itemId === null) : next.findIndex(l => l.itemId === key);
    if (key === BOOKED_KEY) {
      if (at < 0) return no(409, 'range', 'This booking just changed — refresh and try again.');
      if (raw !== 0 && raw !== next[at].qty) return no(409, 'range', 'Buckets booked before the bucket list can only be kept or taken off.');
      if (raw === 0) next.splice(at, 1);
      continue;
    }
    if (at >= 0) {
      if (raw > next[at].qty && !active.has(key)) return no(409, 'range', `${next[at].name} isn’t sold any more — it can only be taken off.`);
      if (raw === 0) next.splice(at, 1); else next[at].qty = raw;
      continue;
    }
    if (raw === 0) continue;
    const it = active.get(key);
    if (!it) return no(409, 'range', 'That bucket isn’t on your bucket list any more — refresh.');
    next.push(lineFor(it, free ? 0 : it.priceCents, raw));
  }
  return { ok: true, lines: next, total: linesTotal(next) };
}

/** Pure: the JSON a booking stores for its lines; null = none (callers write Prisma.DbNull for it). */
export const snapshotOf = (lines: BucketLine[]): Prisma.InputJsonValue | null => (lines.length ? (lines.map(l => ({ ...l })) as unknown as Prisma.InputJsonValue) : null);

/**
 * Pure: everything an online booking decides about range balls — the page's request, the course's switch and its
 * list — in one place (POST /api/bookings calls only this). A page from before the list (it sends a bucket size) is
 * refused, and so are buckets asked for when the course doesn't sell them online: never booked without them.
 */
export function onlineBuckets(
  course: { hasDrivingRange: boolean; sellRangeOnline: boolean; rangeBallsFree: boolean },
  body: { rangeBallsSize?: unknown; rangeBuckets?: unknown },
  list: BucketItem[],
): LinesResult {
  if (body.rangeBallsSize !== undefined && body.rangeBallsSize !== null && String(body.rangeBallsSize) !== '') {
    return no(409, 'stale_page', 'This page is out of date — refresh it and pick your range balls again.');
  }
  const raw = body.rangeBuckets;
  if (raw === undefined || raw === null) return { ok: true, lines: [], total: 0 };
  if (!Array.isArray(raw)) return no(400, 'range', 'Range balls weren’t understood — refresh the page.');
  const wants = raw.some(r => !(r && typeof r === 'object' && (r as { qty?: unknown }).qty === 0));
  if (!wants) return { ok: true, lines: [], total: 0 };
  if (!onlineRangeOn(course)) return no(409, 'range', 'This course doesn’t sell range balls online — refresh the page.');
  return priceOnline(raw, list);
}

/** Whether a booking request asks for any bucket (so the route reads the list only then). */
export const asksForBuckets = (raw: unknown) => Array.isArray(raw) && raw.length > 0;

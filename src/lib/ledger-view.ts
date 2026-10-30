// LEDGER-2 (Cam 2026-10-30: "Days, then the rows"; CSV for the bookkeeper): what a
// course reads from its money ledger (lib/money-ledger, MoneyMove). Read-only.
//
//  • Days: one line per course-local day — card in, cash in, money given back, net,
//    GreenReserve's part — and whether the card money on the course's own Stripe
//    account matches what Stripe recorded that day (its balance transactions).
//  • Rows: every movement of one day, each linked to its booking, sale, member or event.
//  • CSV: every movement in a range, one line each.
//
// The Stripe match compares gross amounts (a balance transaction's `amount` is the
// whole charge or refund, before Stripe's and GreenReserve's fees). Cash, and charges on
// GreenReserve's own account (its separate booking fee), never reach the course's
// Stripe balance, so they are left out of it.
import { prisma } from './prisma';
import { stripe } from './stripe';
import { teeTimeInstant } from './booking-events';
import { addDaysStr, todayIn } from './course-time';

/** A season fits (the date picker's "This season" preset). */
export const LEDGER_MAX_DAYS = 366;
/** More rows than this in one read is refused, never cut short. */
export const LEDGER_MAX_ROWS = 20_000;

export type LedgerDay = {
  day: string;
  cardInCents: number; cashInCents: number; otherInCents: number; outCents: number; netCents: number;
  /** GreenReserve's part of the day: fees it took less fees it gave back. */
  platformCents: number;
  /** Card money on the course's Stripe account, by the ledger — compared with Stripe's. */
  courseCardNetCents: number;
  stripeNetCents: number | null;
  match: 'ok' | 'off' | 'none' | 'unknown';
  moves: number;
};

/** The UTC instant a course-local day starts. */
export function dayStart(tz: string, day: string): Date {
  return teeTimeInstant(tz, day, '00:00') ?? new Date(`${day}T00:00:00Z`);
}

/** The course-local day of an instant. */
export const dayOf = (tz: string, at: Date) => todayIn(tz, at);

const LABEL: Record<string, string> = {
  round: 'Round', hold: 'Cancellation hold', late_fee: 'Late-cancel fee', no_show_fee: 'No-show fee',
  booking_fee: 'GreenReserve booking fee', shop: 'Pro shop', dues: 'Membership dues', event: 'Event',
};
const METHOD: Record<string, string> = { card: 'Card', card_present: 'Card reader', cash: 'Cash', other: 'Check or other' };
export const moveLabel = (what: string) => LABEL[what] ?? what;
export const methodLabel = (m: string) => METHOD[m] ?? m;

type Row = { id: string; at: Date; what: string; direction: string; method: string; account: string; amountCents: number; platformFeeCents: number; stripeId: string | null; bookingId: string | null; saleId: string | null; membershipId: string | null; eventPaymentId: string | null; actor: string; note: string };

export class TooManyRows extends Error {}

async function movesIn(courseId: string, from: Date, to: Date): Promise<Row[]> {
  const rows = await prisma.moneyMove.findMany({
    where: { courseId, at: { gte: from, lt: to } }, orderBy: { at: 'asc' }, take: LEDGER_MAX_ROWS + 1,
    select: { id: true, at: true, what: true, direction: true, method: true, account: true, amountCents: true, platformFeeCents: true, stripeId: true, bookingId: true, saleId: true, membershipId: true, eventPaymentId: true, actor: true, note: true },
  });
  if (rows.length > LEDGER_MAX_ROWS) throw new TooManyRows();
  return rows;
}

/** Pure: a day's totals from its rows. */
export function sumDay(day: string, rows: Pick<Row, 'direction' | 'method' | 'account' | 'amountCents' | 'platformFeeCents'>[]): Omit<LedgerDay, 'stripeNetCents' | 'match'> {
  let cardIn = 0, cashIn = 0, otherIn = 0, out = 0, platform = 0, courseCard = 0;
  for (const r of rows) {
    const sign = r.direction === 'out' ? -1 : 1;
    if (r.direction === 'out') out += r.amountCents;
    else if (r.method === 'cash') cashIn += r.amountCents;
    else if (r.method === 'other') otherIn += r.amountCents;
    else cardIn += r.amountCents;
    platform += sign * r.platformFeeCents;
    if (r.account === 'course' && (r.method === 'card' || r.method === 'card_present')) courseCard += sign * r.amountCents;
  }
  return { day, cardInCents: cardIn, cashInCents: cashIn, otherInCents: otherIn, outCents: out, netCents: cardIn + cashIn + otherIn - out, platformCents: platform, courseCardNetCents: courseCard, moves: rows.length };
}

/** Pure: whether the ledger's card money for a day agrees with Stripe's. */
export function matchOf(ledgerCents: number, stripeCents: number | null): LedgerDay['match'] {
  if (stripeCents === null) return 'unknown';
  if (ledgerCents === 0 && stripeCents === 0) return 'none';
  return ledgerCents === stripeCents ? 'ok' : 'off';
}

/**
 * Stripe's own record of card money on the course's account, by course-local day:
 * charges and payments in, refunds and dispute money out (payouts and Stripe's fees
 * aside). Null when it can't be read (no account, Stripe down).
 */
async function stripeByDay(accountId: string | null, tz: string, from: Date, to: Date): Promise<Map<string, number> | null> {
  if (!accountId) return null;
  const by = new Map<string, number>();
  try {
    const list = stripe.balanceTransactions.list(
      { created: { gte: Math.floor(from.getTime() / 1000), lt: Math.floor(to.getTime() / 1000) }, limit: 100 },
      { stripeAccount: accountId },
    );
    let n = 0;
    for await (const t of list) {
      // Too many to add up here: say "not checked" rather than a wrong total.
      if (++n > 10_000) return null;
      if (t.currency !== 'usd') continue;
      // Card money moving: charges, refunds, dispute withdrawals and reinstatements.
      if (!['charge', 'payment', 'refund', 'payment_refund', 'adjustment', 'payment_failure_refund'].includes(t.type)) continue;
      const d = dayOf(tz, new Date(t.created * 1000));
      by.set(d, (by.get(d) ?? 0) + t.amount);
    }
    return by;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'ledger.stripe_read.fail', error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

/** The days from..to (inclusive), newest first, with the Stripe match. */
export async function ledgerDays(courseId: string, from: string, to: string): Promise<{ days: LedgerDay[]; stripeRead: boolean; stripeConnected: boolean; tz: string } | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, stripeAccountId: true, stripeAccountActive: true } });
  if (!course) return null;
  const tz = course.timezone;
  const start = dayStart(tz, from), end = dayStart(tz, addDaysStr(to, 1));
  const [rows, stripeDays] = await Promise.all([
    movesIn(courseId, start, end),
    stripeByDay(course.stripeAccountActive ? course.stripeAccountId : null, tz, start, end),
  ]);
  const byDay = new Map<string, Row[]>();
  for (const r of rows) { const d = dayOf(tz, r.at); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r); }
  const days: LedgerDay[] = [];
  for (let d = to; d >= from; d = addDaysStr(d, -1)) {
    const s = sumDay(d, byDay.get(d) ?? []);
    const stripeNet = stripeDays ? (stripeDays.get(d) ?? 0) : null;
    days.push({ ...s, stripeNetCents: stripeNet, match: matchOf(s.courseCardNetCents, stripeNet) });
  }
  return { days, stripeRead: !!stripeDays, stripeConnected: !!(course.stripeAccountActive && course.stripeAccountId), tz };
}

export type LedgerRow = Omit<Row, 'at'> & { at: string; label: string; methodLabel: string; who: string; href: string | null };

/** Every movement of one day, with what it was for and where it leads. */
export async function ledgerRows(courseId: string, day: string): Promise<LedgerRow[] | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) return null;
  const rows = await movesIn(courseId, dayStart(course.timezone, day), dayStart(course.timezone, addDaysStr(day, 1)));
  return describe(courseId, rows);
}

async function describe(courseId: string, rows: Row[]): Promise<LedgerRow[]> {
  const ids = (k: 'bookingId' | 'saleId' | 'membershipId' | 'eventPaymentId') => [...new Set(rows.map(r => r[k]).filter((x): x is string => !!x))];
  // Names only from this course's own rows.
  const [bookings, sales, members, events] = await Promise.all([
    prisma.booking.findMany({ where: { courseId, id: { in: ids('bookingId') } }, select: { id: true, golferName: true, teeTime: { select: { date: true, time: true } } } }),
    prisma.shopSale.findMany({ where: { courseId, id: { in: ids('saleId') } }, select: { id: true, customerName: true } }),
    prisma.courseMembership.findMany({ where: { courseId, id: { in: ids('membershipId') } }, select: { id: true, inviteName: true } }),
    prisma.courseEventPayment.findMany({ where: { courseId, id: { in: ids('eventPaymentId') } }, select: { id: true, label: true, eventId: true } }),
  ]);
  const b = new Map(bookings.map(x => [x.id, x])), s = new Map(sales.map(x => [x.id, x])), m = new Map(members.map(x => [x.id, x])), e = new Map(events.map(x => [x.id, x]));
  return rows.map(r => {
    const bk = r.bookingId ? b.get(r.bookingId) : undefined;
    const sl = r.saleId ? s.get(r.saleId) : undefined;
    const mb = r.membershipId ? m.get(r.membershipId) : undefined;
    const ev = r.eventPaymentId ? e.get(r.eventPaymentId) : undefined;
    const who = bk?.golferName || mb?.inviteName || ev?.label || (sl ? (sl.customerName || 'Walk-up sale') : '');
    const href = bk ? `/dashboard?date=${bk.teeTime.date}&q=${encodeURIComponent(bk.golferName)}`
      : mb ? `/dashboard/members?q=${encodeURIComponent(mb.inviteName)}`
      : ev ? `/dashboard/events?id=${ev.eventId}`
      : sl ? '/dashboard/shop' : null;
    return { ...r, at: r.at.toISOString(), label: moveLabel(r.what), methodLabel: methodLabel(r.method), who, href };
  });
}

const csvCell = (v: string | number) => {
  const t = String(v);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every movement in a range, one CSV line each (amounts in dollars, signed: money given back is negative). */
export async function ledgerCsv(courseId: string, from: string, to: string): Promise<string | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) return null;
  const tz = course.timezone;
  const rows = await describe(courseId, await movesIn(courseId, dayStart(tz, from), dayStart(tz, addDaysStr(to, 1))));
  const head = ['Date', 'Time', 'What', 'Method', 'In or out', 'Amount', 'GreenReserve part', 'Account', 'Who', 'Note', 'Stripe id'];
  const dollars = (c: number) => (c / 100).toFixed(2);
  const lines = rows.map(r => {
    const at = new Date(r.at);
    const time = at.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const sign = r.direction === 'out' ? -1 : 1;
    return [dayOf(tz, at), time, r.label, r.methodLabel, r.direction === 'out' ? 'Out' : 'In', dollars(sign * r.amountCents), dollars(sign * r.platformFeeCents), r.account === 'platform' ? 'GreenReserve' : 'Course', r.who, r.note, r.stripeId ?? ''].map(csvCell).join(',');
  });
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

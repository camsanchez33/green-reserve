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
  /** EARNED-1: Stripe's own processing fees on the day's card money (null = Stripe not read). */
  stripeFeeCents: number | null;
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
  booking_fee: 'GreenReserve booking fee', shop: 'Pro shop', dues: 'Membership dues', event: 'Event', account: 'Member account',
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
export function sumDay(day: string, rows: Pick<Row, 'direction' | 'method' | 'account' | 'amountCents' | 'platformFeeCents'>[]): Omit<LedgerDay, 'stripeNetCents' | 'stripeFeeCents' | 'match'> {
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
async function stripeByDay(accountId: string | null, tz: string, from: Date, to: Date): Promise<Map<string, { net: number; fee: number }> | null> {
  if (!accountId) return null;
  const by = new Map<string, { net: number; fee: number }>();
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
      const cur = by.get(d) ?? { net: 0, fee: 0 };
      cur.net += t.amount;
      // EARNED-1: only Stripe's own fee — GreenReserve's application fee is in the ledger already.
      for (const f of t.fee_details ?? []) if (f.type === 'stripe_fee' && f.currency === 'usd') cur.fee += f.amount;
      by.set(d, cur);
    }
    return by;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'ledger.stripe_read.fail', error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

/** The days from..to (inclusive), newest first, with the Stripe match. */
/** EARNED-1: what the course earned over the days — collected, less what went back, GreenReserve's part and Stripe's fees. */
export type Earned = { collectedCents: number; givenBackCents: number; greenReserveCents: number; stripeFeeCents: number | null; keptCents: number | null };
/** EARNED-1: what reached the course — Stripe payouts that arrived in the range, cash kept at the course, and what still waits in Stripe. */
export type PaidOut = { payoutsCents: number | null; payoutCount: number; cashCents: number; inStripeCents: number | null };

/** Pure: the range's earned figures from its days. Stripe's fees unknown → what the course kept is unknown too. */
export function earnedOf(days: Pick<LedgerDay, 'cardInCents' | 'cashInCents' | 'otherInCents' | 'outCents' | 'platformCents' | 'stripeFeeCents'>[]): Earned {
  const collected = days.reduce((n, d) => n + d.cardInCents + d.cashInCents + d.otherInCents, 0);
  const back = days.reduce((n, d) => n + d.outCents, 0);
  const gr = days.reduce((n, d) => n + d.platformCents, 0);
  const fees = days.some(d => d.stripeFeeCents === null) ? null : days.reduce((n, d) => n + (d.stripeFeeCents ?? 0), 0);
  return { collectedCents: collected, givenBackCents: back, greenReserveCents: gr, stripeFeeCents: fees, keptCents: fees === null ? null : collected - back - gr - fees };
}

/** Pure: cash kept at the course over the days (cash in less cash given back), from the rows' sums. */
export const cashKeptOf = (rows: Pick<Row, 'direction' | 'method' | 'amountCents'>[]) =>
  rows.reduce((n, r) => r.method === 'cash' ? n + (r.direction === 'out' ? -r.amountCents : r.amountCents) : n, 0);

/** Stripe payouts that arrived in the bank between the course-local days (inclusive), and the balance still in Stripe. */
async function stripePaidOut(accountId: string | null, tz: string, from: string, to: string): Promise<{ payoutsCents: number | null; payoutCount: number; inStripeCents: number | null }> {
  if (!accountId) return { payoutsCents: null, payoutCount: 0, inStripeCents: null };
  const opts = { stripeAccount: accountId };
  try {
    // A payout's arrival_date is a calendar day, sent as midnight UTC of that day — read it as a date, never through
    // the course's timezone (west of UTC that would land it on the day before).
    const gte = Date.parse(`${from}T00:00:00Z`) / 1000, lt = Date.parse(`${addDaysStr(to, 1)}T00:00:00Z`) / 1000;
    let cents = 0, count = 0, n = 0;
    for await (const p of stripe.payouts.list({ arrival_date: { gte, lt }, limit: 100 }, opts)) {
      if (++n > 2_000) return { payoutsCents: null, payoutCount: 0, inStripeCents: null };
      if (p.currency !== 'usd' || p.status === 'failed' || p.status === 'canceled') continue;
      const d = new Date(p.arrival_date * 1000).toISOString().slice(0, 10);
      if (d < from || d > to) continue;
      cents += p.amount; count++;
    }
    const bal = await stripe.balance.retrieve({}, opts);
    const usd = (list: { amount: number; currency: string }[]) => list.filter(x => x.currency === 'usd').reduce((t, x) => t + x.amount, 0);
    return { payoutsCents: cents, payoutCount: count, inStripeCents: usd(bal.available) + usd(bal.pending) };
  } catch (err) {
    console.error(JSON.stringify({ ev: 'ledger.payouts_read.fail', error: err instanceof Error ? err.message : String(err) }));
    return { payoutsCents: null, payoutCount: 0, inStripeCents: null };
  }
}

export async function ledgerDays(courseId: string, from: string, to: string, opts: { withPayouts?: boolean } = {}): Promise<{ days: LedgerDay[]; stripeRead: boolean; stripeConnected: boolean; tz: string; earned: Earned; paidOut: PaidOut | null } | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, stripeAccountId: true, stripeAccountActive: true } });
  if (!course) return null;
  const tz = course.timezone;
  const start = dayStart(tz, from), end = dayStart(tz, addDaysStr(to, 1));
  const account = course.stripeAccountActive ? course.stripeAccountId : null;
  const [rows, stripeDays, paid] = await Promise.all([
    movesIn(courseId, start, end),
    stripeByDay(account, tz, start, end),
    opts.withPayouts ? stripePaidOut(account, tz, from, to) : Promise.resolve(null),
  ]);
  const byDay = new Map<string, Row[]>();
  for (const r of rows) { const d = dayOf(tz, r.at); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r); }
  const days: LedgerDay[] = [];
  for (let d = to; d >= from; d = addDaysStr(d, -1)) {
    const s = sumDay(d, byDay.get(d) ?? []);
    const st = stripeDays ? (stripeDays.get(d) ?? { net: 0, fee: 0 }) : null;
    // A course with no card money on its own Stripe account pays Stripe nothing.
    const fee = st ? st.fee : s.courseCardNetCents === 0 && !account ? 0 : null;
    days.push({ ...s, stripeNetCents: st ? st.net : null, stripeFeeCents: fee, match: matchOf(s.courseCardNetCents, st ? st.net : null) });
  }
  const paidOut = paid ? { ...paid, cashCents: cashKeptOf(rows) } : null;
  return { days, stripeRead: !!stripeDays, stripeConnected: !!(course.stripeAccountActive && course.stripeAccountId), tz, earned: earnedOf(days), paidOut };
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

export const csvCell = (v: string | number) => {
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

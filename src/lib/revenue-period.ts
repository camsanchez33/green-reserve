// ADMIN-REDO Revenue (Cam 2026-11-11): the four periods the admin Revenue page
// picks between, on the PLATFORM clock (Eastern, lib/admin-day — the same one the
// Overview's startOfPlatformMonth uses). Pure: no database, no Stripe.
//
//   month       this month so far        vs last month to the same point
//   last_month  last month, whole        vs the month before, whole
//   30d         the 30 days to now       vs the 30 days before, to the same time of day
//   year        this year so far         vs last year to the same day and time
//
// "The same point" is a calendar point (day of the period + time of day), never a
// count of milliseconds, so a DST change between the two windows can't shift it by
// an hour, and a day the prior period doesn't have (Mar 31 → Feb, Feb 29 → last
// year) is clamped to the prior period's end. Every window is [start, end).
import { PLATFORM_TZ, dayKey, startOfPlatformDay } from './admin-day';

export type RevenuePeriodKind = 'month' | 'last_month' | '30d' | 'year';
export const REVENUE_PERIODS: RevenuePeriodKind[] = ['month', 'last_month', '30d', 'year'];

export type RevenueWindow = { start: Date; end: Date };
export type RevenuePeriod = {
  kind: RevenuePeriodKind;
  label: string;
  priorLabel: string;
  /** First and last platform day of the current window (YYYY-MM-DD, inclusive). */
  from: string;
  to: string;
  /** Platform days of the period that have started (today counts). */
  elapsedDays: number;
  /** Platform days in the whole current period. */
  totalDays: number;
  current: RevenueWindow;
  /** The prior window to the same elapsed point — what `priorCents` compares against. */
  prior: RevenueWindow;
  /** The WHOLE prior period — what the prior series covers. */
  priorWhole: RevenueWindow;
  /** First platform day of the whole prior period and its length in days. */
  priorFrom: string;
  priorDays: number;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map(m => m.slice(0, 3));

export function parseRevenuePeriod(v: string | null | undefined): RevenuePeriodKind {
  return (REVENUE_PERIODS as string[]).includes(v ?? '') ? (v as RevenuePeriodKind) : 'month';
}

/** Midnight (platform time) on the calendar day y-m-d; out-of-range days roll over like Date.UTC. */
function midnight(y: number, m: number, d: number, tz: string): Date {
  return startOfPlatformDay(new Date(Date.UTC(y, m - 1, d, 12)), tz);
}
const ymd = (s: string) => s.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const daysInYear = (y: number) => (new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1 ? 366 : 365);
/** Calendar days from day `a` to day `b` (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = ymd(a); const [by, bm, bd] = ymd(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
export function addDays(day: string, n: number): string {
  const [y, m, d] = ymd(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? '0');
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') % 24, mi: g('minute'), s: g('second') };
}
/** Milliseconds `tz` is ahead of UTC at `d`. */
function offsetMs(d: Date, tz: string): number {
  const x = parts(d, tz);
  return Date.UTC(x.y, x.m - 1, x.d, x.h, x.mi, x.s) - (d.getTime() - d.getUTCMilliseconds());
}
/** Wall-clock time of day at `d` in `tz`, as milliseconds since midnight. */
function wallMs(d: Date, tz: string): number {
  const x = parts(d, tz);
  return ((x.h * 60 + x.mi) * 60 + x.s) * 1000 + d.getUTCMilliseconds();
}
const min = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

/** Index of the platform day an instant falls on, counted from `fromDay`. */
export function dayIndex(at: Date, fromDay: string, tz: string = PLATFORM_TZ): number {
  return daysBetween(fromDay, dayKey(at, tz));
}

export function resolveRevenuePeriod(kind: RevenuePeriodKind, now: Date, tz: string = PLATFORM_TZ): RevenuePeriod {
  const today = dayKey(now, tz);
  const [y, m, d] = ymd(today);
  // The wall-clock time now (11pm stays 11pm on the prior day, even across a 23- or 25-hour DST day).
  const wall = wallMs(now, tz);
  const atSameTime = (yy: number, mm: number, dd: number, clampTo: Date) => {
    const mid = midnight(yy, mm, dd, tz);
    const guess = new Date(mid.getTime() + wall);
    return min(new Date(guess.getTime() - (offsetMs(guess, tz) - offsetMs(mid, tz))), clampTo);
  };

  if (kind === 'last_month') {
    const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
    const qy = pm === 1 ? py - 1 : py; const qm = pm === 1 ? 12 : pm - 1;
    const current = { start: midnight(py, pm, 1, tz), end: midnight(y, m, 1, tz) };
    const prior = { start: midnight(qy, qm, 1, tz), end: current.start };
    const total = daysInMonth(py, pm);
    return {
      kind, label: `${MONTHS[pm - 1]} ${py}`, priorLabel: `${MONTHS[qm - 1]} ${qy}`,
      from: `${py}-${String(pm).padStart(2, '0')}-01`, to: `${py}-${String(pm).padStart(2, '0')}-${String(total).padStart(2, '0')}`,
      elapsedDays: total, totalDays: total, current, prior, priorWhole: prior,
      priorFrom: `${qy}-${String(qm).padStart(2, '0')}-01`, priorDays: daysInMonth(qy, qm),
    };
  }

  if (kind === '30d') {
    const from = addDays(today, -29);
    const priorFrom = addDays(today, -59);
    const [fy, fm, fd] = ymd(from); const [pfy, pfm, pfd] = ymd(priorFrom);
    const [ly, lm, ld] = ymd(addDays(today, -30));
    const current = { start: midnight(fy, fm, fd, tz), end: now };
    const priorStart = midnight(pfy, pfm, pfd, tz);
    const prior = { start: priorStart, end: atSameTime(ly, lm, ld, current.start) };
    return {
      kind, label: 'Last 30 days', priorLabel: 'The 30 days before',
      from, to: today, elapsedDays: 30, totalDays: 30, current, prior,
      priorWhole: { start: priorStart, end: current.start }, priorFrom, priorDays: 30,
    };
  }

  if (kind === 'year') {
    const current = { start: midnight(y, 1, 1, tz), end: now };
    const priorStart = midnight(y - 1, 1, 1, tz);
    // Feb 29 has no day last year: clamp to Feb 28, end of day.
    const pd = Math.min(d, daysInMonth(y - 1, m));
    const priorEnd = pd < d ? midnight(y - 1, m, pd + 1, tz) : atSameTime(y - 1, m, pd, current.start);
    const elapsed = daysBetween(`${y}-01-01`, today) + 1;
    return {
      kind, label: `${y} so far`, priorLabel: `${y - 1} to ${SHORT[m - 1]} ${pd}`,
      from: `${y}-01-01`, to: today, elapsedDays: elapsed, totalDays: daysInYear(y),
      current, prior: { start: priorStart, end: min(priorEnd, current.start) },
      priorWhole: { start: priorStart, end: current.start }, priorFrom: `${y - 1}-01-01`, priorDays: daysInYear(y - 1),
    };
  }

  // month
  const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
  const current = { start: midnight(y, m, 1, tz), end: now };
  const priorStart = midnight(py, pm, 1, tz);
  const pd = Math.min(d, daysInMonth(py, pm));
  // Today is past the prior month's last day (Mar 31 vs Feb): the whole prior month.
  const priorEnd = pd < d ? current.start : atSameTime(py, pm, pd, current.start);
  return {
    kind, label: `${MONTHS[m - 1]} ${y}`, priorLabel: `${SHORT[pm - 1]} 1–${pd}, ${py}`,
    from: `${y}-${String(m).padStart(2, '0')}-01`, to: today, elapsedDays: d, totalDays: daysInMonth(y, m),
    current, prior: { start: priorStart, end: priorEnd },
    priorWhole: { start: priorStart, end: current.start },
    priorFrom: `${py}-${String(pm).padStart(2, '0')}-01`, priorDays: daysInMonth(py, pm),
  };
}

/** Cents per platform day from `fromDay`, `days` long, from per-day sums (YYYY-MM-DD); days outside are ignored. */
export function daySeries(rows: { day: string; cents: number }[], fromDay: string, days: number): number[] {
  const out = new Array<number>(days).fill(0);
  for (const r of rows) {
    const i = daysBetween(fromDay, r.day);
    if (i >= 0 && i < days) out[i] += r.cents;
  }
  return out;
}

/** Cents per platform day from `fromDay`, `days` long; rows outside are ignored. */
export function centsPerDay(rows: { at: Date; cents: number }[], fromDay: string, days: number, tz: string = PLATFORM_TZ): number[] {
  const out = new Array<number>(days).fill(0);
  for (const r of rows) {
    const i = dayIndex(r.at, fromDay, tz);
    if (i >= 0 && i < days) out[i] += r.cents;
  }
  return out;
}

// ---- GreenReserve's side of the ledger, in plain words ----

const NOUN: Record<string, string> = {
  round: 'Service fee', hold: 'Service fee', late_fee: 'Service fee', no_show_fee: 'Service fee',
  booking_fee: 'Booking fee', dues: 'Membership fee', shop: 'Shop fee', event: 'Event fee', account: 'Member account fee',
};
const ON: Record<string, string> = { hold: ' (cancellation hold)', late_fee: ' (late cancel)', no_show_fee: ' (no-show)' };

/** "Service fee collected", "Booking fee refunded", … for a MoneyMove row's GreenReserve part. */
export function platformMoveLabel(what: string, direction: string): string {
  return `${NOUN[what] ?? 'Fee'} ${direction === 'out' ? 'refunded' : 'collected'}${ON[what] ?? ''}`;
}

/** GreenReserve's signed part of a row: + taken, − given back. */
export const platformSigned = (r: { direction: string; platformFeeCents: number }) =>
  r.direction === 'out' ? -r.platformFeeCents : r.platformFeeCents;

/**
 * The Stripe dashboard page for a payment. A charge on the course's account is a
 * direct charge on a connected account: dashboard.stripe.com/<acct>[/test]/payments/<pi>;
 * one on GreenReserve's own account: dashboard.stripe.com[/test]/payments/<pi>.
 * Only PaymentIntents get a link — a refund id (re_…) or cash row has none.
 */
export function stripePaymentUrl(stripeId: string | null, account: string, connectedAccountId: string | null, testMode: boolean): string | null {
  if (!stripeId || !stripeId.startsWith('pi_')) return null;
  const mode = testMode ? '/test' : '';
  if (account === 'course') {
    if (!connectedAccountId) return null;
    return `https://dashboard.stripe.com/${connectedAccountId}${mode}/payments/${stripeId}`;
  }
  return `https://dashboard.stripe.com${mode}/payments/${stripeId}`;
}

/** The Stripe dashboard page for a payout to a course's bank: dashboard.stripe.com/<acct>[/test]/payouts/<po>. */
export function stripePayoutUrl(payoutId: string, connectedAccountId: string, testMode: boolean): string | null {
  if (!payoutId.startsWith('po_') || !connectedAccountId) return null;
  return `https://dashboard.stripe.com/${connectedAccountId}${testMode ? '/test' : ''}/payouts/${payoutId}`;
}

// ---- Payouts to a course's bank (owner only), from its own Stripe account ----

/** A payout as Stripe lists it (only the fields read here). */
export type PayoutIn = {
  id: string; amount: number; currency: string; status: string; arrival_date: number;
  failure_message?: string | null; failure_code?: string | null;
  reversed_by?: unknown; original_payout?: unknown;
};
export type PayoutProblem = { kind: 'failed' | 'reversed' | 'canceled'; payoutId: string; amountCents: number; date: string; reason: string };

/**
 * Stripe's arrival_date is a calendar day sent as midnight UTC: read it as a date, never
 * through a timezone (ledger-view does the same). This is the [gte, lt) range of seconds
 * that covers the platform days from..to inclusive.
 */
export function payoutArrivalRange(from: string, to: string): { gte: number; lt: number } {
  return { gte: Date.parse(`${from}T00:00:00Z`) / 1000, lt: Date.parse(`${addDays(to, 1)}T00:00:00Z`) / 1000 };
}

/**
 * One course's payouts in the window: what reached its bank, and the ones that didn't.
 * US dollars only. A payout Stripe paid and then reversed is a problem ('reversed': the
 * whole amount was taken back) and is NOT counted as paid out; the reversing payout
 * itself (original_payout set) is neither.
 */
export function summarisePayouts(list: PayoutIn[]): { paidCents: number; paidCount: number; problems: PayoutProblem[] } {
  let paidCents = 0, paidCount = 0;
  const problems: PayoutProblem[] = [];
  for (const p of list) {
    if (p.currency !== 'usd' || p.original_payout) continue;
    const date = new Date(p.arrival_date * 1000).toISOString().slice(0, 10);
    if (p.status === 'failed') problems.push({ kind: 'failed', payoutId: p.id, amountCents: p.amount, date, reason: p.failure_message || p.failure_code || 'The bank sent it back.' });
    else if (p.status === 'canceled') problems.push({ kind: 'canceled', payoutId: p.id, amountCents: p.amount, date, reason: 'Canceled before it reached the bank.' });
    else if (p.status === 'paid' && p.reversed_by) problems.push({ kind: 'reversed', payoutId: p.id, amountCents: p.amount, date, reason: 'Reversed after it was paid — the whole amount was taken back.' });
    else if (p.status === 'paid' && p.amount > 0) { paidCents += p.amount; paidCount++; }
  }
  return { paidCents, paidCount, problems };
}

/** "YYYY-MM" of the platform month an instant falls in. */
export const platformMonthKey = (at: Date, tz: string = PLATFORM_TZ) => dayKey(at, tz).slice(0, 7);

/**
 * Revenue goal pace inputs for the platform month containing `now` (Cam via Build 2026-11-12):
 * dayOfPeriod is fractional like goal-pace's elapsedDays — day 12 at noon is 11.5 — on the platform clock.
 */
export function monthPace(now: Date, tz: string = PLATFORM_TZ): { month: string; dayOfPeriod: number; daysInPeriod: number } {
  const [y, m, d] = dayKey(now, tz).split('-').map(Number);
  const sinceMidnight = (now.getTime() - startOfPlatformDay(now, tz).getTime()) / 86_400_000;
  return { month: `${y}-${String(m).padStart(2, '0')}`, dayOfPeriod: Math.min(d, d - 1 + Math.max(0, Math.min(1, sinceMidnight))), daysInPeriod: daysInMonth(y, m) };
}

/** A goal month the owner may set: "YYYY-MM", this platform month or later. */
export function goalMonthOk(month: string, now: Date, tz: string = PLATFORM_TZ): 'ok' | 'bad' | 'past' {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'bad';
  return month < platformMonthKey(now, tz) ? 'past' : 'ok';
}

// ADMIN-REDO Financial analytics (Cam 2026-11-12): the month windows behind /api/admin/finance,
// on the platform clock (Eastern, lib/admin-day). Pure.
//
//   y12  the 12 months up to and including this one
//   m6   the 6 months up to and including this one
//   m3   the 3 months up to and including this one
//   ytd  January to this month (prior: last year to the same day)
//
// The last month runs to now (partial). The prior window is the same stretch just before, and
// while the period runs it stops at the same calendar point: the same day of the month and wall
// time, N months earlier (clamped to that month's length). Every window is [start, end).
import { PLATFORM_TZ, dayKey, startOfPlatformDay } from './admin-day';

export type FinancePeriodKind = 'y12' | 'm6' | 'm3' | 'ytd';
export const FINANCE_PERIODS: FinancePeriodKind[] = ['y12', 'm6', 'm3', 'ytd'];
export const parseFinancePeriod = (v: string | null | undefined): FinancePeriodKind =>
  (FINANCE_PERIODS as string[]).includes(v ?? '') ? (v as FinancePeriodKind) : 'y12';

export type FinanceMonth = { month: string; start: Date; end: Date; partial: boolean };
export type FinancePeriod = {
  kind: FinancePeriodKind;
  /** Platform days, inclusive. */
  from: string; to: string; priorFrom: string; priorTo: string;
  months: FinanceMonth[];
  current: { start: Date; end: Date };
  prior: { start: Date; end: Date };
  /** The month just before the first one, whole. */
  monthBefore: FinanceMonth;
};

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** y/m with m possibly out of 1..12, normalised. */
const norm = (y: number, m: number): [number, number] => { const t = y * 12 + (m - 1); return [Math.floor(t / 12), (t % 12 + 12) % 12 + 1]; };
const midnight = (y: number, m: number, d: number, tz: string) => startOfPlatformDay(new Date(Date.UTC(y, m - 1, d, 12)), tz);
const monthStart = (y: number, m: number, tz: string) => { const [yy, mm] = norm(y, m); return midnight(yy, mm, 1, tz); };

function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? '0');
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') % 24, mi: g('minute'), s: g('second') };
}
const offsetMs = (d: Date, tz: string) => { const x = parts(d, tz); return Date.UTC(x.y, x.m - 1, x.d, x.h, x.mi, x.s) - (d.getTime() - d.getUTCMilliseconds()); };

/** The same wall-clock time as `now`, on day `d` of month y/m (clamped to the month's length). */
function sameWallTime(now: Date, y: number, m: number, d: number, tz: string): Date {
  const [yy, mm] = norm(y, m);
  const x = parts(now, tz);
  const wall = ((x.h * 60 + x.mi) * 60 + x.s) * 1000 + now.getUTCMilliseconds();
  const dd = Math.min(d, daysIn(yy, mm));
  const mid = midnight(yy, mm, dd, tz);
  const guess = new Date(mid.getTime() + wall);
  return new Date(guess.getTime() - (offsetMs(guess, tz) - offsetMs(mid, tz)));
}

export function resolveFinancePeriod(kind: FinancePeriodKind, now: Date, tz: string = PLATFORM_TZ): FinancePeriod {
  const [y, m, d] = dayKey(now, tz).split('-').map(Number);
  const n = kind === 'y12' ? 12 : kind === 'm6' ? 6 : kind === 'm3' ? 3 : m;
  const months: FinanceMonth[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const [yy, mm] = norm(y, m - i);
    const start = monthStart(yy, mm, tz);
    const end = i === 0 ? now : monthStart(yy, mm + 1, tz);
    months.push({ month: `${yy}-${pad(mm)}`, start, end, partial: i === 0 });
  }
  const current = { start: months[0].start, end: now };
  // Prior: the n months before, through the same calendar point (n months before now). Year to
  // date compares with last year to date: Jan 1 last year to the same day and time last year.
  const back = kind === 'ytd' ? 12 : n;
  const [py, pm] = norm(y, m - back);
  const priorEnd = sameWallTime(now, py, pm, d, tz);
  const priorStartYM = kind === 'ytd' ? [y - 1, 1] as [number, number] : norm(y, m - n - (n - 1));
  const prior = { start: monthStart(priorStartYM[0], priorStartYM[1], tz), end: priorEnd < current.start ? priorEnd : current.start };
  const [by, bm] = norm(y, m - n);
  const monthBefore: FinanceMonth = { month: `${by}-${pad(bm)}`, start: monthStart(by, bm, tz), end: months[0].start, partial: false };
  return {
    kind,
    from: dayKey(current.start, tz), to: dayKey(now, tz),
    priorFrom: dayKey(prior.start, tz), priorTo: dayKey(new Date(prior.end.getTime() - 1), tz),
    months, current, prior, monthBefore,
  };
}

// ---- GreenReserve's money by source ----

/** Where a MoneyMove row's GreenReserve part comes from. */
export type RevenueSource = 'serviceFees' | 'noShowLateFees' | 'membershipDues' | 'other';
export function revenueSource(what: string): RevenueSource {
  if (what === 'round' || what === 'booking_fee' || what === 'hold') return 'serviceFees';
  if (what === 'no_show_fee' || what === 'late_fee') return 'noShowLateFees';
  if (what === 'dues' || what === 'account') return 'membershipDues';
  return 'other'; // shop, event
}

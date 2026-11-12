// Financial analytics (ADMIN-REDO, Cam approved the mockup 2026-11-12): the page's pure rules. Every figure is the
// route's (GreenReserve's side of the MoneyMove ledger, Expenses prorated per month) — the page only adds them up,
// takes profit and margin, and never estimates. Run: npx tsx scripts/admin-finance-test.ts

export type Per = 'y12' | 'm6' | 'm3' | 'ytd';
export const PERIODS: { v: Per; label: string; vs: string }[] = [
  { v: 'y12', label: 'Last 12 months', vs: 'the 12 months before' },
  { v: 'm6', label: 'Last 6 months', vs: 'the 6 months before' },
  { v: 'm3', label: 'Last 3 months', vs: 'the 3 months before' },
  { v: 'ytd', label: 'This year', vs: 'last year by today' },
];

export const SOURCES = ['serviceFees', 'noShowLateFees', 'membershipDues', 'other'] as const; // other = pro shop and event fees
export type Source = typeof SOURCES[number];
export const CATEGORIES = ['infra', 'tools', 'legal', 'other'] as const; // Expenses' four (src/lib/expenses.ts)
export type Category = typeof CATEGORIES[number];

export interface Month {
  month: string; partial: boolean; bookings: number;
  revenue: { cents: number; bySource: Record<Source, number> };
  expenses: { cents: number; byCategory: Record<Category, number> };
  liveCourses: number | null; newLiveCourses: number;
  byCourse: { courseId: string; name: string; bookings: number; revenueCents: number }[];
}
export interface FinanceData {
  period: { kind: string; from: string; to: string; priorFrom: string; priorTo: string };
  months: Month[];
  monthBefore: { revenue: Month['revenue'] | number; expenses: Month['expenses'] | number } | null;
  prior: { revenueCents: number; expensesCents: number; bookings: number };
}

/** The route answered the period asked for, with a well-formed series. */
export function isAnswer(per: Per, d: unknown): d is FinanceData {
  const x = d as FinanceData | null;
  return !!x && x.period?.kind === per && Array.isArray(x.months) && !!x.prior && typeof x.prior.revenueCents === 'number';
}

export interface Totals { revenue: number; expenses: number; profit: number; margin: number | null; bookings: number }
/** Profit is revenue − expenses; margin is profit ÷ revenue, none without revenue. */
export function totals(revenue: number, expenses: number, bookings = 0): Totals {
  const profit = revenue - expenses;
  return { revenue, expenses, profit, margin: revenue > 0 ? (profit / revenue) * 100 : null, bookings };
}
export function windowTotals(months: Month[]): Totals {
  return totals(months.reduce((s, m) => s + m.revenue.cents, 0), months.reduce((s, m) => s + m.expenses.cents, 0), months.reduce((s, m) => s + m.bookings, 0));
}

/** A percentage change, or null when the prior is zero or negative (never drawn across zero). */
export const pct = (now: number, was: number): number | null => (was > 0 ? ((now - was) / was) * 100 : null);
/** A margin moves in points, not in percent of a percent (a −40% margin going to −20% is not "down 50%"). */
export const pointsChange = (now: number | null, was: number | null): number | null => (now === null || was === null ? null : now - was);

/** "Nov" or "Nov so far" for a running month; "Nov 2025" when the window spans two years and the month is not this year's. */
export function monthLabel(month: string, partial: boolean, withYear = false): string {
  const d = new Date(month + '-15T12:00:00Z');
  const base = d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return partial ? `${base} so far` : base;
}
export const spansYears = (months: Month[]) => months.length > 0 && months[0].month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4);

/** A smooth path through points (Catmull-Rom style, tension .12 as the mockup). */
export function curve(pts: [number, number][]): string {
  return pts.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const a = pts[i - 1], b = p, c0 = pts[i - 2] ?? a, c3 = pts[i + 1] ?? b, t = 0.12;
    return ` C${(a[0] + (b[0] - c0[0]) * t).toFixed(1)} ${(a[1] + (b[1] - c0[1]) * t).toFixed(1)} ${(b[0] - (c3[0] - a[0]) * t).toFixed(1)} ${(b[1] - (c3[1] - a[1]) * t).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }).join('');
}

/** Round dollar levels for the chart's left axis: up to four steps from 0 to above the top value. */
export function ticks(maxCents: number): number[] {
  if (maxCents <= 0) return [];
  const raw = maxCents / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(s => s >= raw) ?? 10 * mag;
  return [1, 2, 3, 4].map(i => i * step).filter(v => v <= maxCents * 1.15);
}

const SOURCE_WORDS: Record<Source, string> = { serviceFees: 'Booking service fees', noShowLateFees: 'No-show & late-cancel fees', membershipDues: 'Membership dues fees', other: 'Pro shop & event fees' };
/** Cents from a month's total, whether the route sends the object or the plain number. */
export const centsOf = (v: { cents: number } | number | undefined | null) => (typeof v === 'number' ? v : v?.cents ?? 0);
export const sourceLabel = (k: Source) => SOURCE_WORDS[k];

/** A CSV cell: quoted, inner quotes doubled, and a leading = + - @ written as text so a spreadsheet never runs it. */
export const cell = (v: string | number) => {
  const s = String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};
const dollars = (c: number) => (c / 100).toFixed(2);
/** Months, oldest first: month, bookings, revenue (and by source), expenses (and by category), profit, margin. */
export function toCsv(months: Month[], catLabel: (k: Category) => string): string {
  const head = ['Month', 'Bookings', 'Revenue', ...SOURCES.map(sourceLabel), 'Expenses', ...CATEGORIES.map(catLabel), 'Profit', 'Margin %'];
  const rows = months.map(m => {
    const t = totals(m.revenue.cents, m.expenses.cents);
    return [m.month + (m.partial ? ' (so far)' : ''), m.bookings, dollars(m.revenue.cents), ...SOURCES.map(s => dollars(m.revenue.bySource[s] ?? 0)),
      dollars(m.expenses.cents), ...CATEGORIES.map(c => dollars(m.expenses.byCategory[c] ?? 0)), dollars(t.profit), t.margin === null ? '' : t.margin.toFixed(1)];
  });
  return [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

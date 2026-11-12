// Expenses (ADMIN-REDO, Cam approved the mockup 2026-11-12): the page's pure rules, counted from the Expense rows
// with the ONE proration in src/lib/expenses.ts — never estimated. Months and years run on the platform clock
// (America/New_York, src/lib/admin-day.ts). Run: npx tsx scripts/admin-expenses-test.ts
import { sumExpensesForPeriodCents, monthlyEquivalentCents } from '@/lib/expenses';
import { dayKey, startOfPlatformMonth, startOfPlatformMonthsAgo } from '@/lib/admin-day';

export interface Exp {
  id: string; name: string; category: string; amountCents: number; cadence: string;
  startedAt: string; endedAt: string | null;
}

const DAY = 86_400_000;

/** Running on `at`: started by then and not yet ended. */
export const activeOn = (e: Exp, at: Date) =>
  new Date(e.startedAt).getTime() <= at.getTime() && (!e.endedAt || new Date(e.endedAt).getTime() > at.getTime());

/** What keeps GreenReserve running a month as of `at`: monthly costs, plus yearly ones over 12. One-time costs are not monthly. */
export const monthlyCostsOn = (list: Exp[], at: Date) =>
  list.filter(e => activeOn(e, at)).reduce((s, e) => s + monthlyEquivalentCents(e), 0);

/** The same moment one calendar month earlier (Mar 31 → Feb 28/29). */
export function monthEarlier(d: Date): Date {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() - 1);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
}

/** The same moment one year earlier (Feb 29 → Feb 28). */
export function yearEarlier(d: Date): Date {
  const x = new Date(d);
  const m = x.getUTCMonth();
  x.setUTCFullYear(x.getUTCFullYear() - 1);
  if (x.getUTCMonth() !== m) x.setUTCDate(0);
  return x;
}

/** A percentage change, or null when there is nothing to compare with (never drawn across a zero or negative prior). */
export const pct = (now: number, was: number): number | null => (was > 0 ? ((now - was) / was) * 100 : null);

export interface Cards {
  monthly: number; monthlyPrior: number;
  monthSoFar: number; monthStart: Date; monthEnd: Date; elapsedShare: number;
  year: number; yearPrior: number;
}

/** The three cards, all in cents. */
export function cards(list: Exp[], now: Date): Cards {
  const monthStart = startOfPlatformMonth(now);
  const monthEnd = startOfPlatformMonthsAgo(now, -1);
  const etMonth = Number(dayKey(now).slice(5, 7)) - 1;
  const yearStart = startOfPlatformMonthsAgo(now, etMonth);
  const lastYearStart = startOfPlatformMonthsAgo(now, etMonth + 12);
  return {
    monthly: monthlyCostsOn(list, now),
    monthlyPrior: monthlyCostsOn(list, monthEarlier(now)),
    monthSoFar: sumExpensesForPeriodCents(list, monthStart, now),
    monthStart, monthEnd,
    elapsedShare: (now.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime()),
    year: sumExpensesForPeriodCents(list, yearStart, now),
    yearPrior: sumExpensesForPeriodCents(list, lastYearStart, yearEarlier(now)),
  };
}

/** The calendar date an expense was entered for (the form saves noon UTC, so the UTC date is the date picked). */
export const startDay = (iso: string) => iso.slice(0, 10);

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);

/**
 * The next time a running cost is paid again: the start date's day each month (or each year), clamped to a shorter
 * month (started the 31st → Feb 28). Null for a one-time cost or one that has ended.
 */
export function nextRenewal(e: Exp, now: Date): { day: string; inDays: number } | null {
  if (e.endedAt || (e.cadence !== 'monthly' && e.cadence !== 'annual')) return null;
  const today = dayKey(now);
  const [y0, m0, d0] = startDay(e.startedAt).split('-').map(Number);
  const step = e.cadence === 'annual' ? 12 : 1;
  for (let k = step; k < 12 * 200; k += step) {
    const y = y0 + Math.floor((m0 - 1 + k) / 12), m = ((m0 - 1 + k) % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d0, last)).padStart(2, '0')}`;
    if (day >= today) return { day, inDays: daysBetween(today, day) };
  }
  return null;
}

export type FilterKey = 'active' | 'ended' | 'monthly' | 'annual' | 'once' | 'all';
export const FILTERS: { key: FilterKey; label: string; test: (e: Exp) => boolean }[] = [
  { key: 'active', label: 'Active', test: e => !e.endedAt },
  { key: 'ended', label: 'Ended', test: e => !!e.endedAt },
  { key: 'monthly', label: 'Monthly', test: e => e.cadence === 'monthly' && !e.endedAt },
  { key: 'annual', label: 'A year', test: e => e.cadence === 'annual' && !e.endedAt },
  { key: 'once', label: 'One time', test: e => e.cadence === 'one-time' },
  { key: 'all', label: 'All', test: () => true },
];

/** Biggest monthly cost first, then the biggest amount. */
export const byCost = (a: Exp, b: Exp) => monthlyEquivalentCents(b) - monthlyEquivalentCents(a) || b.amountCents - a.amountCents;

/** "$12.50" → 1250; anything that isn't a positive amount → null. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(parseFloat(t) * 100);
  return c > 0 ? c : null;
}

/** One line of a cost's history, as Build's /api/admin/expenses/[id]/history answers it (newest first). */
export interface HistoryRow {
  at: string; by: string; kind: 'added' | 'changed' | 'ended' | 'restarted';
  changes?: { field: string; from: string | number | null; to: string | number | null }[];
}

const FIELD_WORDS: Record<string, string> = { name: 'Name', amountCents: 'Amount', category: 'Category', cadence: 'How often', startedAt: 'Started', endedAt: 'Finished' };

/** "Amount changed $30.00 → $45.00 · Cam" — the dated log, no explanation text. */
export function historyLine(
  h: HistoryRow, cat: (k: string) => string, cadence: Record<string, string>,
  usd: (cents: number) => string, day: (d: string) => string,
): string {
  const by = h.by ? ` · ${h.by}` : '';
  if (h.kind === 'added') return `Added${by}`;
  if (h.kind === 'ended') return `Finished${by}`;
  if (h.kind === 'restarted') return `Restarted${by}`;
  const show = (field: string, v: string | number | null): string => {
    if (v === null || v === '') return '—';
    if (field === 'amountCents') return usd(Number(v));
    if (field === 'category') return cat(String(v));
    if (field === 'cadence') return cadence[String(v)] ?? String(v);
    if (field === 'startedAt' || field === 'endedAt') return day(String(v).slice(0, 10));
    return String(v);
  };
  const parts = (h.changes ?? []).map(c => `${FIELD_WORDS[c.field] ?? c.field} changed ${show(c.field, c.from)} → ${show(c.field, c.to)}`);
  return (parts.join(' · ') || 'Changed') + by;
}

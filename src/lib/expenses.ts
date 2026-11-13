// EXPENSE TRACKER (RUN_QUEUE "EXPENSE TRACKER / real P&L") — the manual half
// of the P&L: GreenReserve's own fixed operating costs (Vercel, Neon, Resend,
// Twilio, domain, legal…). Automatic Stripe processing costs are NOT here —
// those come live from Stripe (see platform-stripe.ts). This module owns the
// ONE definition of how a recurring cost prorates into an arbitrary period,
// so the revenue page and any future Overview P&L header agree by construction.

import { dayKey, startOfPlatformDay, startOfPlatformDaysAgo, startOfPlatformMonth, startOfPlatformMonthsAgo } from './admin-day';

export const EXPENSE_CATEGORIES = ['infra', 'tools', 'legal', 'other'] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const EXPENSE_CADENCES = ['monthly', 'annual', 'one-time'] as const;
export type ExpenseCadence = typeof EXPENSE_CADENCES[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  infra: 'Infrastructure',
  tools: 'Tools & services',
  legal: 'Legal & professional',
  other: 'Other',
};
export const EXPENSE_CADENCE_LABEL: Record<ExpenseCadence, string> = {
  monthly: 'Monthly',
  annual: 'Annual',
  'one-time': 'One-time',
};

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}
export function isExpenseCadence(v: unknown): v is ExpenseCadence {
  return typeof v === 'string' && (EXPENSE_CADENCES as readonly string[]).includes(v);
}

// Calendar months on the platform clock (Eastern, lib/admin-day). Fix from the #385 review: a
// monthly cost counts as EXACTLY its amount in every full calendar month (it used to prorate over a
// mean year, so $100/mo came to $101.85 in a 31-day month and a budget equal to the monthly costs
// read red). Only a part-month (the cost starts or ends inside it, or the window covers part of
// it) prorates, by the days of that month it covers (a DST day is still one day). An annual cost is a twelfth of its amount a
// month, the same rate monthlyEquivalentCents shows.
export interface ProratableExpense {
  amountCents: number;
  cadence: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
}

/** [start, end) intersected with the expense's own lifespan, or null when they don't overlap. */
function activeOverlap(expense: ProratableExpense, from: Date, to: Date): { start: Date; end: Date } | null {
  // The start is a calendar date (the form saves it as noon UTC): the cost is paid from the start
  // of that day, so a cost dated the 1st covers the whole month. An unreadable date is ignored
  // (the cost counts from the window's start), as before. The end is an instant (End = now).
  const raw = new Date(expense.startedAt);
  const started = Number.isNaN(raw.getTime()) ? null : startOfPlatformDay(raw);
  const ended = expense.endedAt ? new Date(expense.endedAt) : null;
  const start = started && started > from ? started : from;
  const end = ended && ended < to ? ended : to;
  return end.getTime() > start.getTime() ? { start, end } : null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Days from `monthStart` to `t` on the platform calendar: whole days (a 23- or 25-hour DST day is
 *  still one day) plus the elapsed part of t's own day. */
function dayPosition(t: Date, monthStart: Date): number {
  const day = startOfPlatformDay(t);
  const next = startOfPlatformDaysAgo(t, -1);
  return Math.round((day.getTime() - monthStart.getTime()) / MS_PER_DAY) + (t.getTime() - day.getTime()) / (next.getTime() - day.getTime());
}

/** The recurring cost's cents in [from, to), unrounded: per calendar month, its rate × the days of that month covered ÷ its days. */
function recurringCents(expense: ProratableExpense, from: Date, to: Date): number {
  const o = activeOverlap(expense, from, to);
  if (!o) return 0;
  const perMonth = expense.cadence === 'annual' ? expense.amountCents / 12 : expense.amountCents; // monthly (default)
  let total = 0;
  for (let m = startOfPlatformMonth(o.start); m.getTime() < o.end.getTime(); ) {
    const next = startOfPlatformMonthsAgo(m, -1);
    const days = dayPosition(next, m);
    const a = o.start.getTime() > m.getTime() ? dayPosition(o.start, m) : 0;
    const b = o.end.getTime() < next.getTime() ? dayPosition(o.end, m) : days;
    if (b > a) total += perMonth * ((b - a) / days);
    m = next;
  }
  return total;
}

// The cents this expense contributes to the window [periodStart, periodEnd),
// respecting when it started/ended:
//  - one-time: the full amount, booked on its startedAt day — counts only if
//    that day falls inside the window (an unrepeated cost belongs to one period).
//  - monthly / annual: its amount (annual: a twelfth) for each full calendar month of
//    the window it was active; a part-month by the share of that month it covers.
export function prorateExpenseCents(expense: ProratableExpense, periodStart: Date, periodEnd: Date): number {
  if (expense.cadence === 'one-time') {
    const started = new Date(expense.startedAt);
    return started >= periodStart && started < periodEnd ? expense.amountCents : 0;
  }
  return Math.round(recurringCents(expense, periodStart, periodEnd));
}

export function sumExpensesForPeriodCents(expenses: ProratableExpense[], periodStart: Date, periodEnd: Date): number {
  return expenses.reduce((sum, e) => sum + prorateExpenseCents(e, periodStart, periodEnd), 0);
}

/**
 * ADMIN-C Money → Expenses: what a running cost comes to in a month — the
 * monthly amount, an annual one over 12. A one-time cost has no monthly rate
 * (0); it lands whole in the period it started (prorateExpenseCents).
 */
export function monthlyEquivalentCents(expense: Pick<ProratableExpense, 'amountCents' | 'cadence'>): number {
  if (expense.cadence === 'annual') return Math.round(expense.amountCents / 12);
  if (expense.cadence === 'one-time') return 0;
  return expense.amountCents;
}

/**
 * The month's costs for a cap bar (goal-pace), from the #385 review: what's been spent so far, and a
 * projection of only what is actually scheduled — a cost with an end date later this month is
 * projected to that end, not the whole month, and one starting later this month from its start.
 * Feed it straight to goalPace:
 *   goalPace({ progress: p.progress, fixed: p.fixed, scheduled: p.scheduled, share: p.share, target, kind: 'cap', daysElapsed })
 * progress = recurring costs so far; fixed = one-time costs so far (never projected); scheduled =
 * what else is on the books for the whole month — the recurring costs, plus one-time costs dated
 * later this month (known, so counted as they are); share = the elapsed part of the month.
 */
export function monthCostPace(
  expenses: ProratableExpense[],
  now: Date,
): { soFar: number; progress: number; fixed: number; scheduled: number; share: number; projected: number; monthStart: Date; monthEnd: Date } {
  const monthStart = startOfPlatformMonth(now);
  const monthEnd = startOfPlatformMonthsAgo(now, -1);
  const recurring = expenses.filter(e => e.cadence !== 'one-time');
  const progress = recurring.reduce((s, e) => s + prorateExpenseCents(e, monthStart, now), 0);
  const oneTime = expenses.filter(e => e.cadence === 'one-time');
  const fixed = oneTime.reduce((s, e) => s + prorateExpenseCents(e, monthStart, now), 0);
  const scheduled = recurring.reduce((s, e) => s + prorateExpenseCents(e, monthStart, monthEnd), 0)
    + oneTime.reduce((s, e) => s + prorateExpenseCents(e, now, monthEnd), 0);
  const share = dayPosition(now, monthStart) / dayPosition(monthEnd, monthStart); // by days, like the costs
  return { soFar: progress + fixed, progress, fixed, scheduled, share, projected: scheduled + fixed, monthStart, monthEnd };
}

/**
 * End dates are inclusive for people and exclusive for the books (Cam via Build 2026-11-12): "ends
 * Nov 21" means the cost runs THROUGH Nov 21, so what's saved is the instant it stops — the start
 * of Nov 22, Eastern. A page that lets someone pick an end date saves endedAtForLastDay(day), and
 * shows lastDayOf(endedAt). (End = now is already an instant and needs neither.)
 */
export function endedAtForLastDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const noon = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(noon.getTime()) || dayKey(noon, 'UTC') !== day) return null; // e.g. 2026-02-30
  return startOfPlatformDaysAgo(noon, -1);
}

/** The last day an expense was paid for (YYYY-MM-DD, Eastern): the day before the instant it stopped.
 *  Null for no end or an unreadable one, so a page can render it safely. */
export function lastDayOf(endedAt: Date | string | null | undefined): string | null {
  if (endedAt == null || endedAt === '') return null;
  const t = new Date(endedAt).getTime();
  return Number.isNaN(t) ? null : dayKey(new Date(t - 1));
}

// EXPENSE TRACKER (RUN_QUEUE "EXPENSE TRACKER / real P&L") — the manual half
// of the P&L: GreenReserve's own fixed operating costs (Vercel, Neon, Resend,
// Twilio, domain, legal…). Automatic Stripe processing costs are NOT here —
// those come live from Stripe (see platform-stripe.ts). This module owns the
// ONE definition of how a recurring cost prorates into an arbitrary period,
// so the revenue page and any future Overview P&L header agree by construction.

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

// The Gregorian mean year — used so a "monthly" cost prorates to the same
// annualized total no matter which months a period happens to span (no
// 28-vs-31-day drift). A monthly cost is amount×12 over a mean year.
const DAYS_PER_YEAR = 365.2425;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ProratableExpense {
  amountCents: number;
  cadence: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
}

// The cents this expense contributes to the window [periodStart, periodEnd),
// respecting when it started/ended:
//  - one-time: the full amount, booked on its startedAt day — counts only if
//    that day falls inside the window (an unrepeated cost belongs to one period).
//  - monthly / annual: a daily rate × the number of days the expense was
//    actually active within the window. A cost that started mid-period or
//    ended mid-period only accrues for its overlapping days.
export function prorateExpenseCents(expense: ProratableExpense, periodStart: Date, periodEnd: Date): number {
  const started = new Date(expense.startedAt);
  const ended = expense.endedAt ? new Date(expense.endedAt) : null;

  if (expense.cadence === 'one-time') {
    return started >= periodStart && started < periodEnd ? expense.amountCents : 0;
  }

  // Active-overlap window: clamp the period to the expense's own lifespan.
  const overlapStart = started > periodStart ? started : periodStart;
  const overlapEnd = ended && ended < periodEnd ? ended : periodEnd;
  const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / MS_PER_DAY;
  if (overlapDays <= 0) return 0;

  const dailyRate = expense.cadence === 'annual'
    ? expense.amountCents / DAYS_PER_YEAR
    : expense.amountCents * 12 / DAYS_PER_YEAR; // monthly (default)

  return Math.round(dailyRate * overlapDays);
}

export function sumExpensesForPeriodCents(expenses: ProratableExpense[], periodStart: Date, periodEnd: Date): number {
  return expenses.reduce((sum, e) => sum + prorateExpenseCents(e, periodStart, periodEnd), 0);
}

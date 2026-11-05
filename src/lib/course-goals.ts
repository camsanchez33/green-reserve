// HOME-2 (Cam 2026-11-05, "if you want to track goals track them here … set goals for certain
// metrics"): the numbers a course can set a monthly goal on. ONE list, read by the Home card,
// the goals route and lib/home-board's monthGoals(). Every actual is an existing definition
// (computeAnalytics, src/lib/analytics.ts) — never a new sum. Client-safe: no Prisma.
export const GOAL_METRICS = [
  { key: 'collected', label: 'Money collected', unit: 'cents', money: true, def: 'Paid rounds this month, as Analytics counts collected.' },
  { key: 'rounds', label: 'Rounds played', unit: 'count', money: false, def: 'Players on paid rounds this month.' },
  { key: 'booked', label: 'Players booked', unit: 'count', money: false, def: 'Players booked on this month’s tee times, ahead included.' },
  { key: 'fill', label: 'Tee sheet filled', unit: 'pct', money: false, def: 'Spots booked of spots offered, this month so far.' },
  { key: 'new_golfers', label: 'New golfers', unit: 'count', money: false, def: 'Golfers on their first round at the course this month.' },
] as const;

export type GoalMetric = typeof GOAL_METRICS[number]['key'];
export const isGoalMetric = (v: unknown): v is GoalMetric => typeof v === 'string' && GOAL_METRICS.some(m => m.key === v);
export const goalMetric = (k: GoalMetric) => GOAL_METRICS.find(m => m.key === k)!;

/** The highest target each unit accepts — typo guards, not business rules. */
export const GOAL_MAX = { cents: 100_000_000_00, count: 1_000_000, pct: 100 } as const;

/** A target's own words: "$60,000", "1,200", "75%". */
export function formatGoal(metric: GoalMetric, v: number): string {
  const u = goalMetric(metric).unit;
  if (u === 'cents') return `$${Math.round(v / 100).toLocaleString('en-US')}`;
  if (u === 'pct') return `${Math.round(v)}%`;
  return Math.round(v).toLocaleString('en-US');
}

/** What's still needed each remaining day (today included) — null for a percent, which isn't a running total. */
export function neededPerDay(metric: GoalMetric, target: number, actual: number, daysLeft: number): number | null {
  if (goalMetric(metric).unit === 'pct' || daysLeft <= 0) return null;
  return Math.max(0, Math.ceil((target - actual) / daysLeft));
}

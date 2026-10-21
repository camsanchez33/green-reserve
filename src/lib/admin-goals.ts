// AW-4b (Cam 2026-10-21): Admin → Goals. A goal is a measure, a target and a
// date. Live courses are counted now; online bookings and fees are counted from
// the goal's start to its date (or to now, while it runs). The route gates who
// sees and changes them; nothing here checks who is asking.
import { prisma } from './prisma';
import { paidWindow } from './admin-today';

export const GOAL_METRICS = {
  courses_live: { label: 'Live courses', unit: 'count' },
  online_rounds: { label: 'Online bookings', unit: 'count' },
  fees: { label: 'GreenReserve fees', unit: 'cents' },
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;
export const isGoalMetric = (m: unknown): m is GoalMetric => typeof m === 'string' && m in GOAL_METRICS;

/** Where a goal stands: on pace when the share done is at least the share of time gone. */
export function goalPace(current: number, target: number, startsAt: Date, dueAt: Date, now: Date): { status: 'met' | 'on_pace' | 'behind' | 'missed'; daysLeft: number } {
  const daysLeft = Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000));
  if (current >= target) return { status: 'met', daysLeft };
  if (now >= dueAt) return { status: 'missed', daysLeft: 0 };
  const span = dueAt.getTime() - startsAt.getTime();
  const timeShare = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - startsAt.getTime()) / span)) : 1;
  return { status: target > 0 && current / target >= timeShare ? 'on_pace' : 'behind', daysLeft };
}

export async function goalCurrent(metric: GoalMetric, startsAt: Date, dueAt: Date, now: Date): Promise<number> {
  if (metric === 'courses_live') return prisma.course.count({ where: { active: true, archivedAt: null } });
  const end = now < dueAt ? now : dueAt;
  if (end <= startsAt) return 0;
  if (metric === 'online_rounds') {
    return prisma.booking.count({ where: { source: 'online', status: { not: 'cancelled' }, createdAt: { gte: startsAt, lt: end } } });
  }
  return (await paidWindow(startsAt, end)).feesCents;
}

export async function listGoals(now: Date) {
  const goals = await prisma.adminGoal.findMany({ orderBy: { dueAt: 'asc' } });
  return Promise.all(goals.map(async g => {
    const metric = isGoalMetric(g.metric) ? g.metric : 'courses_live';
    const current = await goalCurrent(metric, g.startsAt, g.dueAt, now);
    return {
      id: g.id, metric, label: GOAL_METRICS[metric].label, unit: GOAL_METRICS[metric].unit,
      target: g.target, current, startsAt: g.startsAt.toISOString(), dueAt: g.dueAt.toISOString(),
      createdBy: g.createdBy, ...goalPace(current, g.target, g.startsAt, g.dueAt, now),
    };
  }));
}

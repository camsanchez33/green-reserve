// DASH-D Home (Cam 2026-11-01, mockups S1 + "week-ahead heat map and month vs goal"):
// the parts of Home that aren't today's numbers — the note the last shift left, the
// course conditions, the next seven days by hour, and the month against its goal.
// Server-only. Money (the goal) uses computeAnalytics()'s collected figure, never a new sum.
import { prisma } from './prisma';
import { timeSpots } from './day-fill';
import { todayIn, addDaysStr } from './course-time';
import { computeAnalytics } from './analytics';
import { cleanConditions, type CourseConditions } from './course-conditions';
import { GOAL_METRICS, type GoalMetric } from './course-goals';

export const SHIFT_NOTE_MAX = 1000;
const LIVE = { status: { in: ['confirmed', 'completed'] } };

export type ShiftNoteRow = { id: string; body: string; authorName: string; createdAt: string };

/** Notes still open (not marked done), newest first — the last few days only, so a forgotten note doesn't sit there for ever. */
export async function openShiftNotes(courseId: string, now = new Date()): Promise<ShiftNoteRow[]> {
  const since = new Date(now.getTime() - 3 * 86400000);
  const rows = await prisma.shiftNote.findMany({
    where: { courseId, doneAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' }, take: 5,
    select: { id: true, body: true, authorName: true, createdAt: true },
  });
  return rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function courseConditions(courseId: string): Promise<{ detail: CourseConditions; alert: string; updatedAt: string | null; detailAt: string | null }> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { conditions: true, conditionsDetail: true, conditionsDetailAt: true, conditionsUpdatedAt: true } });
  const at = [c?.conditionsDetailAt, c?.conditionsUpdatedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  // detailAt is the four choices' own time — what the booking page's 18 hours run from (golferConditionLines).
  return { detail: cleanConditions(c?.conditionsDetail), alert: c?.conditions ?? '', updatedAt: at ? at.toISOString() : null, detailAt: c?.conditionsDetailAt ? c.conditionsDetailAt.toISOString() : null };
}

/** The next 7 days (today first), per tee-time hour: players booked and spots offered (lib/day-fill's rule). */
export async function weekAhead(courseId: string, tz: string | null | undefined, now = new Date()) {
  const today = todayIn(tz, now);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(today, i));
  const times = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: days[0], lte: days[6] } },
    select: { date: true, time: true, status: true, playersAvailable: true, bookings: { where: LIVE, select: { players: true } } },
  });
  const hours = [...new Set(times.filter(t => t.status !== 'blocked' || t.bookings.length > 0).map(t => Number(t.time.slice(0, 2))))].sort((a, b) => a - b);
  const cell = new Map<string, { booked: number; offered: number }>();
  for (const t of times) {
    const k = `${t.date}|${Number(t.time.slice(0, 2))}`;
    const c = cell.get(k) ?? { booked: 0, offered: 0 };
    // ACC-1: one rule for players of spots (lib/day-fill) — a blocked time counts only for a group already on it.
    const n = t.bookings.reduce((s, b) => s + b.players, 0);
    if (t.status === 'blocked' && n === 0) continue;
    c.booked += n;
    c.offered += timeSpots(t, n);
    cell.set(k, c);
  }
  return {
    hours,
    days: days.map(date => ({ date, cells: hours.map(h => cell.get(`${date}|${h}`) ?? { booked: 0, offered: 0 }) })),
  };
}

const monthOf = (date: string) => date.slice(0, 7);
const daysInMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
function prevMonth(month: string) { const [y, m] = month.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; }


type A = Awaited<ReturnType<typeof computeAnalytics>>;
/** Each metric's actual, from computeAnalytics' own figures (lib/course-goals lists them). */
const actualOf: Record<GoalMetric, (a: A) => number> = {
  collected: a => a.revenue.collectedCents,
  rounds: a => a.revenue.roundsPlayed,
  booked: a => a.behavior.players,
  fill: a => a.utilization.fillPct ?? 0,
  new_golfers: a => a.customers.newCustomers,
};

export type GoalRow = { metric: GoalMetric; target: number; actual: number; lastMonth: number };

/**
 * HOME-2 (Cam 2026-11-05): this month's goals on the metrics the course chose. Money ones only with
 * money (money.payments). "Players booked" reads the whole month (tee times ahead count); every
 * other metric reads the month to date. A month with no CourseGoal row for collected falls back to
 * its old CourseMonthGoal amount, so a goal set before this shipped still shows.
 */
export async function monthGoals(courseId: string, tz: string | null | undefined, opts: { money: boolean }, now = new Date()) {
  const today = todayIn(tz, now);
  const month = monthOf(today);
  const last = prevMonth(month);
  const end = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  const allowed = GOAL_METRICS.filter(m => opts.money || !m.money).map(m => m.key) as GoalMetric[];
  const [rows, legacy] = await Promise.all([
    prisma.courseGoal.findMany({ where: { courseId, month }, select: { metric: true, target: true } }),
    opts.money ? prisma.courseMonthGoal.findUnique({ where: { courseId_month: { courseId, month } }, select: { cents: true } }) : Promise.resolve(null),
  ]);
  const targets = new Map<GoalMetric, number>();
  for (const r of rows) if (r.target != null && (allowed as string[]).includes(r.metric)) targets.set(r.metric as GoalMetric, r.target);
  if (legacy?.cents != null && !rows.some(r => r.metric === 'collected')) targets.set('collected', legacy.cents);
  const set = allowed.filter(m => targets.has(m));
  if (set.length === 0) return { month, daysLeft, lastMonth: last, goals: [] as GoalRow[], metrics: allowed };
  const [mtd, full, prev] = await Promise.all([
    computeAnalytics(courseId, { from: `${month}-01`, to: today }, now),
    set.includes('booked') ? computeAnalytics(courseId, { from: `${month}-01`, to: end(month) }, now) : Promise.resolve(null),
    computeAnalytics(courseId, { from: `${last}-01`, to: end(last) }, now),
  ]);
  const goals: GoalRow[] = set.map(metric => ({
    metric, target: targets.get(metric)!,
    actual: actualOf[metric](metric === 'booked' && full ? full : mtd),
    lastMonth: actualOf[metric](prev),
  }));
  return { month, daysLeft, lastMonth: last, goals, metrics: allowed };
}

export type HomeEvent = { id: string; name: string; date: string; startTime: string; format: string; onList: number; capacity: number | null };
/**
 * HOME-3 (Cam 2026-11-12, "maybe an events coming up thing"): the next planned events from today — name, day,
 * start and how full (players on the list of the spots offered, as the event's own strip counts them). No money.
 */
export async function upcomingEvents(courseId: string, tz: string | null | undefined, take = 3, now = new Date()): Promise<HomeEvent[]> {
  const today = todayIn(tz, now);
  const rows = await prisma.courseEvent.findMany({
    where: { courseId, status: 'planned', date: { gte: today } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take,
    select: { id: true, name: true, date: true, startTime: true, format: true, players: true, _count: { select: { entrants: { where: { status: 'in' } } } } },
  });
  return rows.map(e => ({ id: e.id, name: e.name, date: e.date, startTime: e.startTime, format: e.format, onList: e._count.entrants, capacity: e.players > 0 ? e.players : null }));
}

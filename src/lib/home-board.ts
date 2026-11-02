// DASH-D Home (Cam 2026-11-01, mockups S1 + "week-ahead heat map and month vs goal"):
// the parts of Home that aren't today's numbers — the note the last shift left, the
// course conditions, the next seven days by hour, and the month against its goal.
// Server-only. Money (the goal) uses computeAnalytics()'s collected figure, never a new sum.
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { computeAnalytics } from './analytics';
import { cleanConditions, type CourseConditions } from './course-conditions';

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

export async function courseConditions(courseId: string): Promise<{ detail: CourseConditions; alert: string; updatedAt: string | null }> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { conditions: true, conditionsDetail: true, conditionsDetailAt: true, conditionsUpdatedAt: true } });
  const at = [c?.conditionsDetailAt, c?.conditionsUpdatedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  return { detail: cleanConditions(c?.conditionsDetail), alert: c?.conditions ?? '', updatedAt: at ? at.toISOString() : null };
}

/** The next 7 days (today first), per tee-time hour: players booked and spots offered. Blocked times offer nothing. */
export async function weekAhead(courseId: string, tz: string | null | undefined, now = new Date()) {
  const today = todayIn(tz, now);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(today, i));
  const times = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: days[0], lte: days[6] }, status: { not: 'blocked' } },
    select: { date: true, time: true, playersAvailable: true, bookings: { where: LIVE, select: { players: true } } },
  });
  const hours = [...new Set(times.map(t => Number(t.time.slice(0, 2))))].sort((a, b) => a - b);
  const cell = new Map<string, { booked: number; offered: number }>();
  for (const t of times) {
    const k = `${t.date}|${Number(t.time.slice(0, 2))}`;
    const c = cell.get(k) ?? { booked: 0, offered: 0 };
    c.booked += t.bookings.reduce((s, b) => s + b.players, 0);
    c.offered += t.playersAvailable;
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

/**
 * This month against its goal: collected so far (computeAnalytics, month to date), the goal,
 * days left (today included), what's needed a day from here, and last month's daily average.
 * goalCents is null when no goal is set for the month.
 */
export async function monthGoal(courseId: string, tz: string | null | undefined, now = new Date()) {
  const today = todayIn(tz, now);
  const month = monthOf(today);
  const last = prevMonth(month);
  const [goal, mtd, prev] = await Promise.all([
    prisma.courseMonthGoal.findUnique({ where: { courseId_month: { courseId, month } }, select: { cents: true } }),
    computeAnalytics(courseId, { from: `${month}-01`, to: today }, now),
    computeAnalytics(courseId, { from: `${last}-01`, to: `${last}-${String(daysInMonth(last)).padStart(2, '0')}` }, now),
  ]);
  const collectedCents = mtd.revenue.collectedCents;
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  const goalCents = goal?.cents ?? null;
  return {
    month, goalCents, collectedCents, daysLeft,
    neededPerDayCents: goalCents != null ? Math.max(0, Math.ceil((goalCents - collectedCents) / daysLeft)) : null,
    lastMonth: last, lastMonthPerDayCents: Math.round(prev.revenue.collectedCents / daysInMonth(last)),
  };
}

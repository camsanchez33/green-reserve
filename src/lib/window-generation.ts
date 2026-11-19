// Tee times for a longer booking window (Build 2026-11-19, after #510). The nightly run (cron generate-tee-times,
// 03:00 UTC) makes every course's widest window plus one day (and one extra), but a window made longer during the day stayed empty
// past the old end until that night: golfers in the new days saw nothing to book. Every route that can lengthen a
// window (operator Settings: public, member and resident; membership tiers: advanceBookingDays and windowPublic;
// admin course-settings; a schedule save, which switches Resident pricing on when it adds a resident rate and so can
// open a resident window already set) reads the horizon before its write and calls this ONE helper inside after().
//
//  - Only when the horizon actually grew; a shorter or unchanged window does nothing.
//  - Only for this course (scoped by its id; nothing else is read or written).
//  - Skips a course with no active schedule: generateTeeTimes with no schedule deletes every open time on the day,
//    and a course that adds its times by hand must never lose them to a window save.
//  - Makes only the new days: from one day before the old horizon's end as counted from the course's today (the
//    03:00-UTC nightly run counted from the day before for a course west of UTC, so its range ended a day earlier)
//    to the new end. Never a day already gone: a past day's open times feed Analytics and demand pricing. Days are
//    generated from the far end back, so the furthest new days come first.
//  - A 120 s budget: past it the rest is left to the nightly run, logged, never thrown.
import { prisma } from './prisma';
import { generateTeeTimes, regenerationDays } from './tee-sheet-engine';
import { todayIn, addDaysStr } from './course-time';
import { withPriceSwitch } from './pricing-switch';
import { after } from 'next/server';

export const WINDOW_GENERATION_BUDGET_MS = 120_000;

/** Course fields that set how far ahead someone books: operator Settings, and the admin editor (no resident window there). */
export const OPERATOR_WINDOW_FIELDS = ['publicAdvanceDays', 'memberAdvanceDays', 'residentAdvanceDays', 'hasResidentPricing'] as const;
export const ADMIN_WINDOW_FIELDS = ['publicAdvanceDays', 'memberAdvanceDays', 'hasResidentPricing'] as const;
export const touchesWindow = (fields: readonly string[], data: Record<string, unknown>) => fields.some(k => k in data);
/** A membership edit that can change its window. */
export const tierWindowChange = (updates: Record<string, unknown>) => updates.advanceBookingDays != null || updates.windowPublic !== undefined;

/** The course's generation horizon now, read before a write that may lengthen a window. */
export const windowHorizonDays = regenerationDays;

export type LongerWindowResult =
  | { ran: false; reason: 'not_longer' | 'no_schedule' | 'no_course' | 'failed' }
  | { ran: true; days: number; failedDays: number; complete: boolean; from: string; to: string };

export async function generateForLongerWindow(
  courseId: string,
  beforeDays: number,
  opts: { now?: Date; clock?: () => number; budgetMs?: number } = {},
): Promise<LongerWindowResult> {
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, timezone: true } });
    if (!course) return { ran: false, reason: 'no_course' };
    const afterDays = await regenerationDays(courseId);
    if (afterDays <= beforeDays) return { ran: false, reason: 'not_longer' };
    const schedule = await prisma.teeTimeSchedule.findFirst({ where: { courseId, active: true }, select: { id: true } });
    if (!schedule) return { ran: false, reason: 'no_schedule' };

    const clock = opts.clock ?? Date.now;
    const budget = opts.budgetMs ?? WINDOW_GENERATION_BUDGET_MS;
    const started = clock();
    const today = todayIn(course.timezone, opts.now);
    const first = Math.max(0, beforeDays - 1);
    const from = addDaysStr(today, first);
    const to = addDaysStr(today, afterDays - 1);
    let days = 0, failedDays = 0;
    for (let i = afterDays - 1; i >= first; i--) {
      if (clock() - started > budget) {
        console.warn(JSON.stringify({ ev: 'window_generation.budget', courseId, days, left: i - first + 1 }));
        return { ran: true, days, failedDays, complete: false, from, to };
      }
      const date = addDaysStr(today, i);
      try { await generateTeeTimes(courseId, date); days++; }
      catch (err) {
        failedDays++;
        console.error(JSON.stringify({ ev: 'window_generation.day_failed', courseId, date, error: err instanceof Error ? err.message : String(err) }));
      }
    }
    console.log(JSON.stringify({ ev: 'window_generation.done', courseId, days, failedDays, from, to }));
    return { ran: true, days, failedDays, complete: true, from, to };
  } catch (err) {
    console.error(JSON.stringify({ ev: 'window_generation.failed', courseId, error: err instanceof Error ? err.message : String(err) }));
    return { ran: false, reason: 'failed' };
  }
}

/**
 * withPriceSwitch for a schedule save, plus the window it may open: a new resident rate switches Resident pricing on
 * after the save's own rebuild ran with it off, so a resident window already set would stay empty until 03:00 UTC.
 * Reads the horizon first and generates any new days inside after(); only once the save succeeded.
 */
export async function withPriceSwitchAndWindow<T>(courseId: string, write: () => Promise<T>): Promise<T> {
  const before = await windowHorizonDays(courseId);
  const result = await withPriceSwitch(courseId, write);
  after(() => generateForLongerWindow(courseId, before));
  return result;
}

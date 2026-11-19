// Tee times for a longer booking window (Build 2026-11-19, after #510). The nightly run (cron generate-tee-times,
// 03:00 UTC) makes every course's widest window plus one day, but a window made longer during the day stayed empty
// past the old end until that night: golfers in the new days saw nothing to book. Every route that can lengthen a
// window (operator Settings: public, member and resident; membership tiers: advanceBookingDays and windowPublic;
// admin course-settings) reads the horizon before its write and calls this ONE helper inside after() with it.
//
//  - Only when the horizon actually grew; a shorter or unchanged window does nothing.
//  - Only for this course (scoped by its id; nothing else is read or written).
//  - Skips a course with no active schedule: generateTeeTimes with no schedule deletes every open time on the day,
//    and a course that adds its times by hand must never lose them to a window save.
//  - Starts one day before the course's today, which is the date the 03:00-UTC nightly run started from for courses
//    west of UTC, so no day between the nightly run's range and the new end is skipped. Days are generated from the
//    far end back, so the newly opened days, the only ones the nightly run has not made, come first.
//  - A 120 s budget: past it the rest is left to the nightly run, logged, never thrown.
import { prisma } from './prisma';
import { generateTeeTimes, regenerationDays } from './tee-sheet-engine';
import { todayIn, addDaysStr } from './course-time';

export const WINDOW_GENERATION_BUDGET_MS = 120_000;

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
    const from = addDaysStr(today, -1);
    const to = addDaysStr(today, afterDays - 1);
    let days = 0, failedDays = 0;
    for (let i = afterDays - 1; i >= -1; i--) {
      if (clock() - started > budget) {
        console.warn(JSON.stringify({ ev: 'window_generation.budget', courseId, days, left: i + 2 }));
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

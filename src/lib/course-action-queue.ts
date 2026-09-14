// COURSES_SHEET_SPEC CS-1 §4 — the Overview action queue's course rows for
// check-in calls. One row per course whose check-in is due or overdue; the
// stats route merges these with the inquiry rows and dedupes against any
// course already in the queue for a worse reason (payments broken).
import { checkInSignal, type CheckinCallLike, type CheckinCourseLike } from './course-checkin';
import type { ActionQueueRow } from './inquiry-action-queue';

export type QueueCourse = CheckinCourseLike & {
  id: string;
  name: string;
  operator?: { name?: string | null } | null;
  calls?: CheckinCallLike[] | null;
};

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });

export function buildCourseCheckInRows(courses: QueueCourse[], now: Date = new Date()): ActionQueueRow[] {
  const rows: ActionQueueRow[] = [];
  for (const c of courses) {
    const sig = checkInSignal(c, c.calls ?? [], now);
    if (sig.state !== 'overdue' && sig.state !== 'due') continue;
    const who = c.operator?.name?.trim() || 'the operator';
    rows.push({
      id: `ci-${c.id}`,
      who: c.name,
      why: sig.state === 'overdue'
        ? `Check-in call overdue by ${sig.days} day${sig.days === 1 ? '' : 's'}`
        : `Check-in due ${sig.at ? fmtDay(sig.at) : 'soon'}`,
      doThis: `Call ${who} — agenda is on the course page.`,
      ageDays: sig.state === 'overdue' ? sig.days : 0,
      actionLabel: 'Open',
      href: `/admin/courses/${c.id}`,
    });
  }
  return rows.sort((a, b) => b.ageDays - a.ageDays);
}

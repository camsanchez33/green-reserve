// COURSES_SHEET_SPEC CS-1 §2 — check-in calls with live courses.
//
// Cadence (decision B3, in code like the agenda): the first check-in 14 days
// after go-live, then every 90 days. A scheduled check-in `Call` (kind
// 'checkin', outcome 'scheduled') wins over the bare `Course.nextCheckInAt`
// date and carries its time. Shared by the courses sheet, the course page's
// check-in card, and the Overview action queue.
import { daysSince } from './inquiry-status';

export const CHECKIN_FIRST_DAYS = 14;
export const CHECKIN_EVERY_DAYS = 90;
/** "Due" = within this many days of the check-in date. */
export const CHECKIN_DUE_WINDOW_DAYS = 3;

export type CheckinAgendaItem = { key: string; label: string; short: string; always: true };

export const CHECKIN_AGENDA: CheckinAgendaItem[] = [
  { key: 'volume', label: "How's booking volume feel vs before", short: 'Volume', always: true },
  { key: 'checkins', label: 'Card check-in at the counter — any friction', short: 'Check-in', always: true },
  { key: 'noshows', label: 'No-shows and cancellations', short: 'No-shows', always: true },
  { key: 'members', label: 'Members signing in with the code OK', short: 'Members', always: true },
  { key: 'page', label: 'Anything to change on the page (photos, copy, prices)', short: 'Page', always: true },
  { key: 'payouts', label: 'Payouts landing on schedule', short: 'Payouts', always: true },
  { key: 'ask', label: 'What would make this better for you', short: 'Their ask', always: true },
];

export type CheckinCallLike = {
  id?: string;
  kind?: string;
  scheduledAt: string | Date;
  outcome: string;
  completedAt?: string | Date | null;
  durationMin?: number;
  direction?: string;
  phone?: string;
  answersJson?: string | null;
  notes?: string | null;
};

export type CheckinCourseLike = {
  nextCheckInAt?: string | Date | null;
};

const ms = (d: string | Date) => new Date(d).getTime();
const DAY = 86_400_000;

/** The scheduled check-in call, if there is one (soonest first). */
export function scheduledCheckIn<T extends CheckinCallLike>(calls: T[]): T | null {
  return calls
    .filter(c => (c.kind ?? 'checkin') === 'checkin' && c.outcome === 'scheduled')
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt))[0] ?? null;
}

/** When we next check in: the scheduled call's time, else the bare date, else null. */
export function nextCheckIn(course: CheckinCourseLike, calls: CheckinCallLike[]): Date | null {
  const call = scheduledCheckIn(calls);
  if (call) return new Date(call.scheduledAt);
  return course.nextCheckInAt ? new Date(course.nextCheckInAt) : null;
}

export type CheckInState = 'none' | 'scheduled' | 'due' | 'overdue';

export type CheckInSignal = {
  state: CheckInState;
  at: Date | null;
  /** Days past (overdue) or until (scheduled/due) the check-in; 0 when none. */
  days: number;
  /** True when a real Call carries the time, false when it is only the bare date. */
  hasCall: boolean;
};

export function checkInSignal(course: CheckinCourseLike, calls: CheckinCallLike[], now: Date = new Date()): CheckInSignal {
  const call = scheduledCheckIn(calls);
  const at = call ? new Date(call.scheduledAt) : course.nextCheckInAt ? new Date(course.nextCheckInAt) : null;
  if (!at) return { state: 'none', at: null, days: 0, hasCall: false };
  const diffDays = (at.getTime() - now.getTime()) / DAY;
  if (diffDays < 0) return { state: 'overdue', at, days: daysSince(at, now), hasCall: !!call };
  const until = Math.ceil(diffDays);
  return { state: until <= CHECKIN_DUE_WINDOW_DAYS ? 'due' : 'scheduled', at, days: until, hasCall: !!call };
}

/** The most recent talked call of either kind — a discovery call from the linked inquiry counts. */
export function lastContact(calls: CheckinCallLike[]): { at: Date; kind: string } | null {
  const talked = calls
    .filter(c => c.outcome === 'talked')
    .map(c => ({ at: new Date(c.completedAt ?? c.scheduledAt), kind: c.kind ?? 'checkin' }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return talked[0] ?? null;
}

export function fmtLastContact(lc: { at: Date; kind: string } | null): string {
  if (!lc) return 'Never talked';
  const d = lc.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return `Last talked: ${d} (${lc.kind === 'discovery' ? 'discovery call' : 'check-in'})`;
}

/** The date the next check-in lands on after a talked check-in: now + 90 days. */
export function nextCheckInAfterTalk(now: Date = new Date()): Date {
  return new Date(now.getTime() + CHECKIN_EVERY_DAYS * DAY);
}

/** The first check-in date for a course that just went live: now + 14 days. */
export function firstCheckInAfterGoLive(now: Date = new Date()): Date {
  return new Date(now.getTime() + CHECKIN_FIRST_DAYS * DAY);
}

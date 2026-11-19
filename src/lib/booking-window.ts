// BOOKING WINDOWS (RUN_QUEUE) — how far ahead each audience can see and book
// the tee sheet. One derivation, used by the tee-times APIs, booking
// creation, the course page's date picker and tee-time generation, so the
// four can never disagree.
//
//   public / anonymous  → Course.publicAdvanceDays (default 7)
//   recognized member   → their tier's advanceBookingDays, else
//                         Course.memberAdvanceDays (default 14)
//   logged-in resident  → Course.residentAdvanceDays (null = the public window), only with Resident pricing on
//                         (GOLFER-LOGIN-1 2b, Build 2026-11-19). A member who is also a resident gets the longer.
//
// "N days ahead" is inclusive: today plus the next N calendar days. Dates are
// the tee sheet's YYYY-MM-DD strings. Revamp 3 fix 8 (Cam 2026-10-29): "today"
// is the COURSE's today when its timezone is given — a UTC day opened the next
// day at 8 PM for an Eastern course. Without one it stays the UTC day.
import { todayIn, addDaysStr } from './course-time';

export const DEFAULT_PUBLIC_WINDOW_DAYS = 7;
export const DEFAULT_MEMBER_WINDOW_DAYS = 14;
/** Tee-time generation always runs at least this far ahead (the pre-existing cron horizon). */
export const MIN_GENERATION_DAYS = 8;

const DAY = 86_400_000;

export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Today for the window: the course's day when its timezone is known, else the UTC day. */
function windowToday(now: Date, tz?: string | null): string {
  return tz ? todayIn(tz, now) : utcToday(now);
}

/** Whole days from today (the course's, given its timezone) to `date`; negative for the past. */
export function dayOffset(date: string, now: Date = new Date(), tz?: string | null): number {
  const [ty, tm, td] = windowToday(now, tz).split('-').map(Number);
  const a = Date.UTC(ty, tm - 1, td);
  const [y, m, d] = date.split('-').map(Number);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / DAY);
}

export function withinWindow(date: string, windowDays: number, now: Date = new Date(), tz?: string | null): boolean {
  return dayOffset(date, now, tz) <= Math.max(0, windowDays);
}

export function lastBookableDate(windowDays: number, now: Date = new Date(), tz?: string | null): string {
  return addDaysStr(windowToday(now, tz), Math.max(0, windowDays));
}

export type WindowCourse = { publicAdvanceDays?: number | null; memberAdvanceDays?: number | null; residentAdvanceDays?: number | null; hasResidentPricing?: boolean | null };

/** The resident window in days, or null when it doesn't apply (no value set, or Resident pricing off — the switch is the
 *  whole resident program: lib/pricing-switch residentPricingOn, read inline here because this file runs in the browser). */
export function residentWindowDays(course: WindowCourse): number | null {
  return course.hasResidentPricing && course.residentAdvanceDays != null ? course.residentAdvanceDays : null;
}
/** windowPublic (Memberships item 3): the membership books as far ahead as the public, no further. */
export type WindowTier = { advanceBookingDays?: number | null; windowPublic?: boolean | null } | null | undefined;

/**
 * The window for a viewer: a member's tier, a tierless member's course default, or the public window; a logged-in
 * resident (`opts.resident`: a resident card good on the date) gets the longer of that and the resident window.
 * `ownWindow`: the viewer has a window of their own past the public one, so a round's shorter public window doesn't
 * hold for them (a member not on the public window, or a resident window longer than the public).
 */
export function windowFor(course: WindowCourse, member: { tier?: WindowTier } | null, opts: { resident?: boolean } = {}): { days: number; scope: 'public' | 'member'; ownWindow: boolean } {
  const pub = course.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS;
  let win: { days: number; scope: 'public' | 'member'; ownWindow: boolean } = { days: pub, scope: 'public', ownWindow: false };
  if (member) {
    win = member.tier?.windowPublic
      ? { days: pub, scope: 'member', ownWindow: false }
      : { days: member.tier?.advanceBookingDays ?? course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS, scope: 'member', ownWindow: true };
  }
  const res = opts.resident ? residentWindowDays(course) : null;
  if (res != null && res > pub && res > win.days) win = { days: res, scope: 'member', ownWindow: true };
  return win;
}

/** How many days of tee times a course needs generated: its widest window, plus one. Never below the old 8. */
export function generationHorizonDays(course: WindowCourse, tiers: { advanceBookingDays?: number | null; windowPublic?: boolean | null }[] = []): number {
  const widest = Math.max(
    course.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS,
    course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS,
    residentWindowDays(course) ?? 0,
    // A membership on the public window books no further than the public (its advanceBookingDays is unused).
    ...tiers.map(t => (t.windowPublic ? 0 : t.advanceBookingDays ?? 0)),
  );
  // Hard cap so no future writer can turn one course's window into a runaway cron loop.
  return Math.min(366, Math.max(MIN_GENERATION_DAYS, widest + 1));
}

/** The 403 body the tee-times APIs return for a date past the viewer's window. */
export function outsideWindowBody(days: number, scope: 'public' | 'member', course: WindowCourse & { hasMemberPricing?: boolean | null; timezone?: string | null }, now: Date = new Date()) {
  const memberDays = course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS;
  return {
    error: 'outside_window' as const,
    windowDays: days,
    scope,
    lastDate: lastBookableDate(days, now, course.timezone),
    memberWindowDays: memberDays,
    membersBookEarlier: scope === 'public' && !!course.hasMemberPricing && memberDays > days,
  };
}

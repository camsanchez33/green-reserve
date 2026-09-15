// BOOKING WINDOWS (RUN_QUEUE) — how far ahead each audience can see and book
// the tee sheet. One derivation, used by the tee-times APIs, booking
// creation, the course page's date picker and tee-time generation, so the
// four can never disagree.
//
//   public / anonymous  → Course.publicAdvanceDays (default 7)
//   recognized member   → their tier's advanceBookingDays, else
//                         Course.memberAdvanceDays (default 14)
//
// "N days ahead" is inclusive: today plus the next N calendar days. Dates are
// the tee sheet's YYYY-MM-DD strings, compared on the same UTC-day basis the
// tee-times APIs already use for "today".

export const DEFAULT_PUBLIC_WINDOW_DAYS = 7;
export const DEFAULT_MEMBER_WINDOW_DAYS = 14;
/** Tee-time generation always runs at least this far ahead (the pre-existing cron horizon). */
export const MIN_GENERATION_DAYS = 8;

const DAY = 86_400_000;

export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from today (UTC) to `date`; negative for the past. */
export function dayOffset(date: string, now: Date = new Date()): number {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = date.split('-').map(Number);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / DAY);
}

export function withinWindow(date: string, windowDays: number, now: Date = new Date()): boolean {
  return dayOffset(date, now) <= Math.max(0, windowDays);
}

export function lastBookableDate(windowDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() + Math.max(0, windowDays) * DAY).toISOString().slice(0, 10);
}

export type WindowCourse = { publicAdvanceDays?: number | null; memberAdvanceDays?: number | null };
export type WindowTier = { advanceBookingDays?: number | null } | null | undefined;

/** The window for a viewer: a member's tier, a tierless member's course default, or the public window. */
export function windowFor(course: WindowCourse, member: { tier?: WindowTier } | null): { days: number; scope: 'public' | 'member' } {
  if (member) {
    const tierDays = member.tier?.advanceBookingDays;
    return { days: tierDays ?? course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS, scope: 'member' };
  }
  return { days: course.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS, scope: 'public' };
}

/** How many days of tee times a course needs generated: its widest window, plus one. Never below the old 8. */
export function generationHorizonDays(course: WindowCourse, tiers: { advanceBookingDays?: number | null }[] = []): number {
  const widest = Math.max(
    course.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS,
    course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS,
    ...tiers.map(t => t.advanceBookingDays ?? 0),
  );
  // Hard cap so no future writer can turn one course's window into a runaway cron loop.
  return Math.min(366, Math.max(MIN_GENERATION_DAYS, widest + 1));
}

/** The 403 body the tee-times APIs return for a date past the viewer's window. */
export function outsideWindowBody(days: number, scope: 'public' | 'member', course: WindowCourse & { hasMemberPricing?: boolean | null }, now: Date = new Date()) {
  const memberDays = course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS;
  return {
    error: 'outside_window' as const,
    windowDays: days,
    scope,
    lastDate: lastBookableDate(days, now),
    memberWindowDays: memberDays,
    membersBookEarlier: scope === 'public' && !!course.hasMemberPricing && memberDays > days,
  };
}

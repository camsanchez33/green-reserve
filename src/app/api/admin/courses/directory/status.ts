// ADMIN-REDO Golf Courses: a course's status, pure so scripts/admin-courses-status-test.ts can pin it.
// Live (on the public site) · At risk (live RISK_DAYS+ days, no booking in RISK_DAYS) · Onboarding
// (never been live) · Offline (was live, taken down) — computeCourseHealth's "was it ever live" test.

export const RISK_DAYS = 14;
const DAY = 86_400_000;

export type CourseStatus = 'live' | 'risk' | 'onboarding' | 'offline' | 'archived';

export type StatusInput = {
  archivedAt: Date | null; active: boolean; liveStatus: string;
  firstWentLiveAt: Date | null; welcomeEmailSentAt: Date | null; createdAt: Date;
};

export function courseStatus(c: StatusInput, lastBooking: Date | null, now: Date): CourseStatus {
  if (c.archivedAt) return 'archived';
  const live = c.active && c.liveStatus === 'live';
  if (!live) return c.firstWentLiveAt || c.welcomeEmailSentAt ? 'offline' : 'onboarding';
  const since = c.firstWentLiveAt ?? c.welcomeEmailSentAt ?? c.createdAt;
  const cutoff = now.getTime() - RISK_DAYS * DAY;
  return since.getTime() <= cutoff && (!lastBooking || lastBooking.getTime() < cutoff) ? 'risk' : 'live';
}

/** ONE HOME PER COURSE (Cam 2026-11-12): Golf Courses lists a course only once it has been live —
 *  Live, At risk, Offline. An onboarding course lives on Onboarding until the day it goes live. */
export function onGolfCourses(s: CourseStatus): boolean {
  return s === 'live' || s === 'risk' || s === 'offline';
}

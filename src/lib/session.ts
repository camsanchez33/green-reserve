import { cookies } from 'next/headers';
import { getOperatorSession } from './auth';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { ALL_KEYS, deniedMessage, resolveStaffPermissions, type PermissionKey } from './staff-permissions';

export const ACTIVE_COURSE_COOKIE = 'gr_active_course';

// SD-1: staff run the tee sheet; they do not configure the course. "Staff (tee
// sheet access)" was a label the API never enforced — a staff login (which has
// no 2FA) could change fees, add or delete staff, and un-list the course. Every
// write on a configuration route returns this; reads stay open because the
// tee-sheet page needs the course's config to render.
export const STAFF_FORBIDDEN = 'Staff accounts run the tee sheet but cannot change course settings — ask the course operator.';

export interface ResolvedSession {
  courseId: string;
  email: string;
  operatorId: string | null;  // null for staff
  staffId: string | null;     // null for operators
  isStaff: boolean;
  /** SP-A: what this login may do. Owners have every key. */
  permissions: PermissionKey[];
}

/** SP-A: true when the login holds the permission (owners always do). */
export function can(session: Pick<ResolvedSession, 'isStaff' | 'permissions'>, key: PermissionKey): boolean {
  return !session.isStaff || session.permissions.includes(key);
}

/**
 * SP-A: the server-side gate. Returns a 403 to send back, or null when allowed.
 * The client hides what a login can't do; this is the control.
 */
export function requirePermission(session: Pick<ResolvedSession, 'isStaff' | 'permissions'>, key: PermissionKey): NextResponse | null {
  return can(session, key) ? null : NextResponse.json({ error: deniedMessage(key), permission: key }, { status: 403 });
}

/**
 * Resolves the courseId for both operator and staff sessions.
 * Use this in all dashboard API routes instead of getOperatorSession() directly.
 *
 * Operators can now have more than one course (Course.operatorId is no longer
 * unique). Single-course operators behave exactly as before. Multi-course
 * operators pick the active one via the gr_active_course cookie (set by the
 * dashboard's course switcher) — falls back to the oldest course if the
 * cookie is missing, stale, or points at a course this operator doesn't own.
 */
export async function resolveDashboardSession(): Promise<ResolvedSession | null> {
  const session = await getOperatorSession();
  if (!session) return null;

  if (session.kind === 'staff') {
    // HOTFIX after the SD review: the staff JWT was trusted for its whole
    // 7-day life. An operator who deactivated or deleted a staff account was
    // not actually locking them out — the cookie kept working, and the
    // sliding refresh kept reissuing it. Read the row on every request, like
    // the admin session does.
    const row = await prisma.courseStaff.findUnique({ where: { id: session.staffId }, select: { active: true, courseId: true, permissions: true, permissionsSetAt: true } });
    if (!row || !row.active) return null;
    return {
      courseId: row.courseId,
      email: session.email,
      operatorId: null,
      staffId: session.staffId,
      isStaff: true,
      permissions: resolveStaffPermissions(row),
    };
  }

  // SD-5 session versioning: a token minted before the last password change
  // or reset is dead, whatever its expiry. Tokens from before this shipped
  // carry no version and count as 0.
  const operator = await prisma.courseOperator.findUnique({
    where: { id: session.operatorId },
    select: { sessionVersion: true, course: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!operator) return null;
  if ((session.sv ?? 0) !== operator.sessionVersion) return null;
  const courses = operator.course;
  if (courses.length === 0) return null;

  let courseId = courses[0].id;
  if (courses.length > 1) {
    const cookieStore = await cookies();
    const active = cookieStore.get(ACTIVE_COURSE_COOKIE)?.value;
    if (active && courses.some(c => c.id === active)) courseId = active;
  }

  return {
    courseId,
    email: session.email,
    operatorId: session.operatorId,
    staffId: null,
    isStaff: false,
    permissions: [...ALL_KEYS],
  };
}

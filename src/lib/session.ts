import { cookies } from 'next/headers';
import { getOperatorSession, type DashboardSession } from './auth';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { ALL_KEYS, deniedMessage, type PermissionKey } from './staff-permissions';
import { resolveMemberPermissions } from './team-access';

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

const SEEN_EVERY_MS = 15 * 60 * 1000;

/**
 * AW-4b: "Staff seen" on the admin Today page — the last time anyone from the
 * course used the dashboard. One conditional write, a no-op inside 15 minutes.
 * Awaited (a route's un-awaited write dies with the function) and never fatal:
 * a failed write must not sign anyone out.
 */
export async function touchStaffSeen(courseId: string, now = new Date()) {
  try {
    // Raw SQL on purpose: Prisma's update would also bump Course.updatedAt,
    // which the sitemap and Admin → System read as "the course changed".
    // The column is zone-less UTC, so the instants are written and compared in UTC.
    await prisma.$executeRaw`UPDATE "Course" SET "staffLastSeenAt" = (${now}::timestamptz AT TIME ZONE 'UTC')
      WHERE "id" = ${courseId} AND ("staffLastSeenAt" IS NULL OR "staffLastSeenAt" < (${new Date(now.getTime() - SEEN_EVERY_MS)}::timestamptz AT TIME ZONE 'UTC'))`;
  } catch (e) {
    console.error('[session] staffLastSeenAt write failed', e);
  }
}

/**
 * Team "last active" for one staff login: written only when the stored time is
 * over 15 minutes old (read with the row, so most requests write nothing).
 * Never fatal, like touchStaffSeen.
 */
async function touchPersonActive(staffId: string, last: Date | null, now = new Date()) {
  if (last && now.getTime() - last.getTime() < SEEN_EVERY_MS) return;
  try {
    await prisma.courseStaff.updateMany({
      where: { id: staffId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - SEEN_EVERY_MS) } }] },
      data: { lastActiveAt: now },
    });
  } catch (e) {
    console.error('[session] lastActiveAt write failed', e);
  }
}

/**
 * Audit 2026-11-24 L1/M4: the gr_operator session, but only while it is still live — the login exists,
 * a staff login is still on, and the token's sessionVersion matches the row (a password change, reset,
 * sign-out, disable or remove bumps it). For the few routes that need no course (an owner with none
 * yet, the course switcher, the verify email); every other route uses resolveDashboardSession, which
 * checks the same. getOperatorSession() alone only checks the signature, so a killed cookie still worked.
 */
export async function liveOperatorSession(): Promise<DashboardSession | null> {
  const session = await getOperatorSession();
  if (!session) return null;
  if (session.kind === 'staff') {
    const row = await prisma.courseStaff.findUnique({ where: { id: session.staffId }, select: { active: true, removedAt: true, sessionVersion: true } });
    if (!row || !row.active || row.removedAt || (session.sv ?? 0) !== row.sessionVersion) return null;
    return session;
  }
  const row = await prisma.courseOperator.findUnique({ where: { id: session.operatorId }, select: { sessionVersion: true } });
  if (!row || (session.sv ?? 0) !== row.sessionVersion) return null;
  return session;
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
    // Team (Cam 2026-11-17): the person's role is read with the row, so a role
    // or override change applies on their next request, like disable does.
    const row = await prisma.courseStaff.findUnique({
      where: { id: session.staffId },
      select: {
        active: true, removedAt: true, sessionVersion: true, courseId: true, permissions: true, permissionsSetAt: true, lastActiveAt: true,
        roleId: true, grantKeys: true, revokeKeys: true, courseRole: { select: { courseId: true, permissions: true } },
      },
    });
    if (!row || !row.active || row.removedAt) return null;
    // Team: disable, remove and a password reset bump the version, so older tokens die (pre-Team tokens count as 0).
    if ((session.sv ?? 0) !== row.sessionVersion) return null;
    await touchStaffSeen(row.courseId);
    await touchPersonActive(session.staffId, row.lastActiveAt);
    return {
      courseId: row.courseId,
      email: session.email,
      operatorId: null,
      staffId: session.staffId,
      isStaff: true,
      permissions: resolveMemberPermissions(row),
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

  await touchStaffSeen(courseId);
  return {
    courseId,
    email: session.email,
    operatorId: session.operatorId,
    staffId: null,
    isStaff: false,
    permissions: [...ALL_KEYS],
  };
}

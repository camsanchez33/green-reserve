import { cookies } from 'next/headers';
import { getOperatorSession } from './auth';
import { prisma } from './prisma';

export const ACTIVE_COURSE_COOKIE = 'gr_active_course';

export interface ResolvedSession {
  courseId: string;
  email: string;
  operatorId: string | null;  // null for staff
  staffId: string | null;     // null for operators
  isStaff: boolean;
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
    return {
      courseId: session.courseId,
      email: session.email,
      operatorId: null,
      staffId: session.staffId,
      isStaff: true,
    };
  }

  const courses = await prisma.course.findMany({
    where: { operatorId: session.operatorId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
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
  };
}

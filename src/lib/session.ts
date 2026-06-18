import { getOperatorSession } from './auth';
import { prisma } from './prisma';

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

  // Operator — look up their course
  const operator = await prisma.courseOperator.findUnique({
    where: { id: session.operatorId },
    select: { course: { select: { id: true } } },
  });
  if (!operator?.course?.id) return null;

  return {
    courseId: operator.course.id,
    email: session.email,
    operatorId: session.operatorId,
    staffId: null,
    isStaff: false,
  };
}

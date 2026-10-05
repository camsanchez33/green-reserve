import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';
import { resolveDashboardSession } from '@/lib/session';
import { ALL_KEYS } from '@/lib/staff-permissions';

// Lists every course this operator owns, plus which one is currently active
// (per resolveDashboardSession's cookie logic) — feeds the dashboard's course
// switcher. Staff belong to exactly one course and never see a switcher.
export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // SD-1: the sidebar hides the configuration tabs for staff — no point
  // offering doors that now 403.
  // SP-A: the login's permissions ride along — the sidebar, the tee sheet and
  // every page hide what this login can't do (the routes enforce it).
  if (session.kind !== 'operator') {
    const staff = await resolveDashboardSession();
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ courses: [], activeCourseId: null, isStaff: true, permissions: staff.permissions });
  }

  const courses = await prisma.course.findMany({
    where: { operatorId: session.operatorId },
    select: { id: true, name: true, slug: true, active: true, liveStatus: true },
    orderBy: { createdAt: 'asc' },
  });

  const resolved = await resolveDashboardSession();

  return NextResponse.json({ courses, activeCourseId: resolved?.courseId ?? courses[0]?.id ?? null, isStaff: false, permissions: ALL_KEYS });
}

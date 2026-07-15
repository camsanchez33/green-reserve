import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';
import { resolveDashboardSession } from '@/lib/session';

// Lists every course this operator owns, plus which one is currently active
// (per resolveDashboardSession's cookie logic) — feeds the dashboard's course
// switcher. Staff belong to exactly one course and never see a switcher.
export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.kind !== 'operator') return NextResponse.json({ courses: [], activeCourseId: null });

  const courses = await prisma.course.findMany({
    where: { operatorId: session.operatorId },
    select: { id: true, name: true, slug: true, active: true, liveStatus: true },
    orderBy: { createdAt: 'asc' },
  });

  const resolved = await resolveDashboardSession();

  return NextResponse.json({ courses, activeCourseId: resolved?.courseId ?? courses[0]?.id ?? null });
}

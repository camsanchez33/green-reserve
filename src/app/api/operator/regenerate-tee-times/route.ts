import { NextResponse } from 'next/server';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';

export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const today = todayIn(course.timezone); // SD-3: the course's today
  let created = 0;
  const errors: string[] = [];

  for (let i = 0; i < 8; i++) {
    const dateStr = addDaysStr(today, i);
    try {
      created += await generateTeeTimes(course.id, dateStr);
    } catch (err) {
      errors.push(`${dateStr}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ success: true, created, errors });
}

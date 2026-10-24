import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { registerRounds } from '@/lib/register';
import { todayIn, clockIn } from '@/lib/course-time';

// POS-3 R2: what the register can take green fees for today — the groups that
// still owe, and the next open tee times for a walk-in. Rounds are paid in
// cash at the register (sheet.counter_payment, as "Paid at the counter" on the
// tee sheet). The course is always the session's.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  for (const key of ['shop.sell', 'sheet.counter_payment'] as const) { const denied = requirePermission(session, key); if (denied) return denied; }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const date = todayIn(course?.timezone);
  return NextResponse.json({ date, ...(await registerRounds(session.courseId, date, clockIn(course?.timezone))) });
}

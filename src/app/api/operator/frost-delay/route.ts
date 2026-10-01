import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { todayIn } from '@/lib/course-time';
import { planFrostDelay, applyFrostDelay, isFrostTime } from '@/lib/frost-delay';

// B-9 frost delay. POST { date, newStart, apply }: without `apply` it returns the
// plan (who moves where, who doesn't fit) and changes nothing; with `apply: true`
// it re-plans from the current sheet and applies that. Staff can run it — it is
// a counter action, like blocking a time.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { date?: unknown; newStart?: unknown; apply?: unknown };
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  const newStart = typeof body.newStart === 'string' ? body.newStart.slice(0, 5) : '';
  if (!date || !isFrostTime(newStart)) return NextResponse.json({ error: 'Pick the day and the new first tee time.' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, name: true } });
  if (date < todayIn(course?.timezone)) return NextResponse.json({ error: 'That day has already passed.' }, { status: 409 });

  const plan = await planFrostDelay(session.courseId, date, newStart);
  if (body.apply !== true) return NextResponse.json({ plan });
  if (plan.moves.length === 0 && plan.unplaced.length === 0 && plan.blockTeeTimeIds.length === 0) {
    return NextResponse.json({ error: `There are no tee times before ${newStart} on that day.` }, { status: 409 });
  }
  const result = await applyFrostDelay(session.courseId, plan, course?.name ?? 'The course');
  console.log(JSON.stringify({ ev: 'frost_delay.applied', courseId: session.courseId, date, newStart, moved: result.moved.length, unplaced: result.unplaced.length, blocked: result.blocked, by: session.email }));
  return NextResponse.json(result);
}

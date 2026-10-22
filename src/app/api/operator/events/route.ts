import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { createEvent, previewEvent, EventError, type EventInput } from '@/lib/course-events';
import { todayIn } from '@/lib/course-time';

// W2-9 Events: the course's outings, tournaments and league nights. Everything
// here needs "Run events" (owner, and staff given it); writes also need the
// current agreement (AG-3 §3).

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'events.manage');
  if (denied) return { res: denied };
  return { session };
}

export async function GET() {
  const g = await gate();
  if ('res' in g) return g.res;
  const courseId = g.session.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, holes: true } });
  const today = todayIn(course?.timezone);
  const [events, products, nines] = await Promise.all([
    prisma.courseEvent.findMany({
      where: { courseId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 500,
      include: {
        tasks: { select: { dueDate: true, doneAt: true } },
        _count: { select: { entrants: { where: { status: 'in' } }, teeTimes: true } },
      },
    }),
    prisma.courseProduct.findMany({ where: { courseId, active: true }, select: { id: true, label: true, holes: true }, orderBy: { sortOrder: 'asc' } }),
    // Sharing the course: a shotgun can use some of the nines.
    prisma.nine.findMany({ where: { courseId }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return NextResponse.json({
    today,
    courseHoles: course?.holes ?? 18,
    products,
    nines,
    events: events.map(({ tasks, _count, ...e }) => ({
      ...e,
      entrantCount: _count.entrants,
      heldCount: _count.teeTimes,
      tasksOpen: tasks.filter(t => !t.doneAt).length,
      tasksOverdue: tasks.filter(t => !t.doneAt && t.dueDate && t.dueDate < today).length,
    })),
  });
}

/** Create an event — or, with `preview: true`, say what it would hold without saving. */
export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as EventInput & { preview?: boolean };
  try {
    if (body.preview) return NextResponse.json({ preview: await previewEvent(g.session.courseId, body) });
    const agreementBlock = await requireAgreementCurrent(g.session.courseId); if (agreementBlock) return agreementBlock;
    const r = await createEvent(g.session.courseId, body, g.session.email);
    return NextResponse.json({ event: r.event, hold: r.hold });
  } catch (err) {
    if (err instanceof EventError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

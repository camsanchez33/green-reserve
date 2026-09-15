import { NextRequest, NextResponse } from 'next/server';
import { todayIn, clockIn } from '@/lib/course-time';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { windowFor, withinWindow, outsideWindowBody } from '@/lib/booking-window';

/**
 * Maps a Prisma TeeTime row (camelCase, real availability counts) onto the
 * snake_case shape the golfer-facing UI was built against (courses/[slug]/page.tsx
 * reads green_fee, cart_fee, players_available, walking_allowed, status).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDbTeeTime(t: any) {
  const spotsLeft = t.playersAvailable - t.playersBooked;
  const status = spotsLeft <= 1 ? 'almost_full' : spotsLeft <= 2 ? 'limited' : 'available';
  return {
    id: t.id,
    course_id: t.courseId,
    date: t.date,
    time: t.time,
    holes: t.holes,
    players_available: spotsLeft,
    // MP-3 B2c — THE `any` HOLE AGAIN. This mapper takes `t: any` (with an
    // explicit eslint-disable), so the renamed columns produced NO compile
    // error: t.greenFee simply read undefined and every tee time on the
    // public course page would have rendered with no price. Found by grepping the old
    // names after tsc went green — the same way B2b's normalize-course was.
    // Cents at rest, dollars on the wire (the UI formats dollars).
    green_fee: centsToDollarsOr0(t.greenFeeCents),
    cart_fee: centsToDollarsOr0(t.cartFeeCents),
    walking_allowed: t.walkingAllowed,
    status,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  const dbCourse = await prisma.course.findUnique({ where: { slug } });
  if (!dbCourse || !dbCourse.active || dbCourse.liveStatus !== 'live') {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  // BOOKING WINDOWS: the public sees the sheet only as far ahead as the course
  // allows. Enforced here, not just in the picker — the picker reads this.
  const win = windowFor(dbCourse, null);
  if (!withinWindow(date, win.days)) {
    return NextResponse.json(outsideWindowBody(win.days, win.scope, dbCourse), { status: 403 });
  }

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: dbCourse.id, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
  });

  // SD-3: strip slots that have passed on the COURSE's clock. TeeTime.time is
  // course-local, so comparing it against a UTC clock hid or showed the
  // wrong hours for any course outside UTC.
  const todayLocal = todayIn(dbCourse.timezone);
  const nowLocal = clockIn(dbCourse.timezone);
  const visible = date === todayLocal
    ? teeTimes.filter(t => t.time > nowLocal)
    : teeTimes;

  return NextResponse.json(visible.map(normalizeDbTeeTime));
}

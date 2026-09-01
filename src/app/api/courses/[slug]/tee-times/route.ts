import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';

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

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: dbCourse.id, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
  });

  // If the requested date is today, strip out tee times that have already passed.
  // Use UTC+0 time from the server — consistent regardless of server timezone.
  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().split('T')[0];
  const currentTimeStr = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`;

  const visible = date === todayUtc
    ? teeTimes.filter(t => t.time > currentTimeStr)
    : teeTimes;

  return NextResponse.json(visible.map(normalizeDbTeeTime));
}

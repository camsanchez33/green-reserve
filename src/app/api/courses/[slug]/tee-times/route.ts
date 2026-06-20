import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    green_fee: t.greenFee,
    cart_fee: t.cartFee,
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
  return NextResponse.json(teeTimes.map(normalizeDbTeeTime));
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeDbTeeTime } from '@/lib/public-tee-times';
import { verifyViewToken } from '@/lib/preview-token';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  // The course's preview link or the admin's look (verifyViewToken); approving stays preview-only.
  const tokenCourseId = (await verifyViewToken(token))?.courseId;
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
    include: { product: { select: { label: true, walkingPolicy: true, minPlayers: true, maxPlayers: true, publicAdvanceDays: true, teeSetRatings: { select: { rating: true, slope: true, teeSet: { select: { sortOrder: true } } } } } } },
  });

  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().split('T')[0];
  const currentTimeStr = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`;
  const visible = date === todayUtc
    ? teeTimes.filter(t => t.time > currentTimeStr)
    : teeTimes;

  // The same mapping as the live page (lib/public-tee-times), so the preview shows the booking rules golfers get.
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { walkingAllowed: true, cartRequired: true, minPlayers: true, maxPlayers: true, publicAdvanceDays: true, timezone: true, lastMinuteOn: true, lastMinuteHours: true, lastMinutePct: true, lastMinuteCounter: true, lastMinuteStack: true } });
  return NextResponse.json(visible.map(t => normalizeDbTeeTime(t, course ?? undefined)));
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPreviewToken } from '@/lib/preview-token';

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
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  const tokenCourseId = await verifyPreviewToken(token);
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
  });

  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().split('T')[0];
  const currentTimeStr = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`;
  const visible = date === todayUtc
    ? teeTimes.filter(t => t.time > currentTimeStr)
    : teeTimes;

  return NextResponse.json(visible.map(normalizeDbTeeTime));
}

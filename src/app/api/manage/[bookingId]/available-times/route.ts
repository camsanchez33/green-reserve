import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const token = req.nextUrl.searchParams.get('token') || '';

  const ip = clientIp(req);
  const ok = await rateLimit('manage:times:' + ip, 30, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { checkInToken: true, courseId: true, teeTimeId: true, players: true, teeTime: { select: { date: true } } },
  });
  if (!booking || booking.checkInToken !== token) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }

  const teeTimes = await prisma.teeTime.findMany({
    where: {
      courseId: booking.courseId,
      date: booking.teeTime.date,
      status: { not: 'blocked' },
      id: { not: booking.teeTimeId },
    },
    orderBy: { time: 'asc' },
  });

  const available = teeTimes
    .filter(t => t.playersAvailable - t.playersBooked >= booking.players)
    .map(t => ({
      id: t.id,
      time: t.time,
      holes: t.holes,
      spotsLeft: t.playersAvailable - t.playersBooked,
      greenFee: t.greenFee,
      cartFee: t.cartFee,
    }));

  return NextResponse.json(available);
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { getGolferSession } from '@/lib/auth';

const TOKEN_GRACE_MS = 24 * 60 * 60 * 1000; // 24h after tee time

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const token = req.nextUrl.searchParams.get('token') || '';
  const golferSession = await getGolferSession();

  if (!golferSession) {
    const ip = clientIp(req);
    const ok = await rateLimit('manage:get:' + ip, 30, 300);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course: {
        select: {
          name: true, slug: true, address: true, city: true, state: true,
          timezone: true, cancellationHours: true, brandColor: true,
        },
      },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  const authorized = golferSession
    ? booking.golferAccountId === golferSession.golferId
    : booking.checkInToken === token;
  if (!authorized) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }

  const tz = booking.course.timezone || 'America/New_York';
  const teeMs = teeToUtcMs(booking.teeTime.date, booking.teeTime.time, tz);
  if (Date.now() > teeMs + TOKEN_GRACE_MS) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const cutoffMs = teeMs - booking.course.cancellationHours * 60 * 60 * 1000;
  const windowOpen = Date.now() < cutoffMs;

  return NextResponse.json({
    bookingId: booking.id,
    golferName: booking.golferName,
    courseName: booking.course.name,
    courseSlug: booking.course.slug,
    courseAddress: `${booking.course.address}, ${booking.course.city}, ${booking.course.state}`,
    brandColor: booking.course.brandColor,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    holes: booking.teeTime.holes,
    players: booking.players,
    greenFeeTotal: booking.greenFeeTotal,
    cartFeeTotal: booking.cartFeeTotal,
    rangeBallsTotal: booking.rangeBallsTotal,
    accessFeeTotal: booking.accessFeeTotal,
    totalAmount: booking.totalAmount,
    cancellationHours: booking.course.cancellationHours,
    cancellationFeeTotal: booking.cancellationFeeTotal,
    cancellationFeeCharged: booking.paymentStatus === 'cancellation_fee_charged',
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    windowOpen,
  });
}

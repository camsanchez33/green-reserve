import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const ip = clientIp(req);
  const ok = await rateLimit('receipt:' + ip, 30, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course: { select: { name: true, slug: true, city: true, state: true } },
    },
  });

  if (!booking || booking.checkInToken !== token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    bookingId: booking.id,
    golferName: booking.golferName,
    courseName: booking.course.name,
    courseSlug: booking.course.slug,
    courseLocation: [booking.course.city, booking.course.state].filter(Boolean).join(', '),
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    holes: booking.teeTime.holes,
    players: booking.players,
    cartSelected: booking.cartSelected,
    greenFeeTotal: booking.greenFeeTotal,
    cartFeeTotal: booking.cartFeeTotal,
    rangeBallsTotal: booking.rangeBallsTotal,
    accessFeeTotal: booking.accessFeeTotal,
    totalAmount: booking.totalAmount,
    status: booking.status,
    cancellationFeeTotal: booking.cancellationFeeTotal,
    cancellationFeeCharged: !!booking.cancellationFeeChargeId,
    createdAt: booking.createdAt,
  });
}

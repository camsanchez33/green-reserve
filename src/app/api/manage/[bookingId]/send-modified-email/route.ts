import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBookingModifiedEmail } from '@/lib/email';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { token } = await req.json() as { token?: string };
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course: { select: { name: true } },
    },
  });

  if (!booking || booking.checkInToken !== token) {
    return NextResponse.json({ error: 'Invalid' }, { status: 404 });
  }

  await sendBookingModifiedEmail({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    holes: booking.teeTime.holes,
    players: booking.players,
    greenFeeTotal: booking.greenFeeTotal,
    cartFeeTotal: booking.cartFeeTotal,
    rangeBallsTotal: booking.rangeBallsTotal,
    accessFeeTotal: booking.accessFeeTotal,
    totalAmount: booking.totalAmount,
    bookingId: booking.id,
    checkInToken: booking.checkInToken,
  }).catch(console.error);

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { performCheckIn } from '@/lib/checkin-booking';

// Public, token-gated check-in endpoint — the golfer doesn't need to be
// logged in (they may be checking in from a different device than they
// booked on). The checkInToken in the URL (sent in the reminder/confirmation
// emails) is the only proof of ownership; treat it like a magic link.
async function authorize(bookingId: string, token: string | null) {
  if (!token) return null;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course: { select: { name: true, address: true, city: true, state: true } },
    },
  });
  if (!booking || booking.checkInToken !== token) return null;
  return booking;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const token = req.nextUrl.searchParams.get('token');
  const booking = await authorize(bookingId, token);
  if (!booking) return NextResponse.json({ error: 'Invalid or expired check-in link.' }, { status: 404 });

  return NextResponse.json({
    golferName: booking.golferName,
    courseName: booking.course.name,
    courseAddress: `${booking.course.address}, ${booking.course.city}, ${booking.course.state}`,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    players: booking.players,
    holes: booking.teeTime.holes,
    status: booking.status,
    totalAmount: booking.totalAmount,
    greenFeeTotal: booking.greenFeeTotal,
    cartFeeTotal: booking.cartFeeTotal,
    rangeBallsTotal: booking.rangeBallsTotal,
    accessFeeTotal: booking.accessFeeTotal,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { token } = await req.json();
  const booking = await authorize(bookingId, token);
  if (!booking) return NextResponse.json({ error: 'Invalid or expired check-in link.' }, { status: 404 });

  const result = await performCheckIn(bookingId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

// GET /api/admin/tee-sheet?courseId=X&date=Y
export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  const date = req.nextUrl.searchParams.get('date');
  if (!courseId || !date) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId, date },
    orderBy: { time: 'asc' },
    include: {
      bookings: {
        where: { status: 'confirmed' },
        select: { id: true, golferName: true, golferEmail: true, golferPhone: true, players: true, totalAmount: true, paymentStatus: true, createdAt: true },
      },
    },
  });

  return NextResponse.json(teeTimes);
}

// PATCH — block/unblock or cancel booking
export async function PATCH(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  if (body.action === 'cancel_booking') {
    const booking = await prisma.booking.findUnique({ where: { id: body.bookingId } });
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    await prisma.$transaction([
      prisma.booking.update({ where: { id: body.bookingId }, data: { status: 'cancelled' } }),
      prisma.teeTime.update({ where: { id: booking.teeTimeId }, data: { playersBooked: { decrement: booking.players }, playersAvailable: { increment: booking.players } } }),
    ]);
    return NextResponse.json({ success: true });
  }

  if (body.action === 'block' || body.action === 'unblock') {
    await prisma.teeTime.update({
      where: { id: body.teeTimeId },
      data: { status: body.action === 'block' ? 'blocked' : 'available' },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST — manually add a booking
export async function POST(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { teeTimeId, golferName, golferEmail, golferPhone, players } = await req.json();
  if (!teeTimeId || !golferName || !golferEmail || !players) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const teeTime = await prisma.teeTime.findUnique({ where: { id: teeTimeId } });
  if (!teeTime) return NextResponse.json({ error: 'Tee time not found' }, { status: 404 });
  if (teeTime.playersAvailable < players) return NextResponse.json({ error: 'Not enough spots' }, { status: 400 });

  const greenFeeTotal = Math.round(teeTime.greenFee * players * 100);
  const cartFeeTotal = Math.round(teeTime.cartFee * players * 100);
  const accessFeeTotal = 150 * players;
  const totalAmount = greenFeeTotal + cartFeeTotal + accessFeeTotal;

  const [booking] = await prisma.$transaction([
    prisma.booking.create({
      data: {
        teeTimeId,
        courseId: teeTime.courseId,
        golferName,
        golferEmail,
        golferPhone: golferPhone || '',
        players,
        appliedRate: 'standard',
        greenFeeTotal,
        cartFeeTotal,
        accessFeeTotal,
        totalAmount,
        paymentStatus: 'manual',
        status: 'confirmed',
      },
    }),
    prisma.teeTime.update({
      where: { id: teeTimeId },
      data: { playersBooked: { increment: players }, playersAvailable: { decrement: players } },
    }),
  ]);

  return NextResponse.json({ success: true, bookingId: booking.id });
}

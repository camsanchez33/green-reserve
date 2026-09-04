import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dollarsToCentsOr0 } from '@/lib/money';
import { teeTimeToWire } from '@/lib/schedule-wire';
import { resolveDashboardSession } from '@/lib/session';
import { setTeeTimeBlocked } from '@/lib/schedule-service';

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const withBookings = searchParams.get('withBookings') === '1';

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: session.courseId, date },
    orderBy: { time: 'asc' },
    include: withBookings ? { bookings: { where: { status: { in: ['confirmed', 'completed'] } }, orderBy: { createdAt: 'asc' } } } : undefined,
  });

  return NextResponse.json(teeTimes);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const teeTime = await prisma.teeTime.create({
    data: {
      courseId: session.courseId,
      date: body.date, time: body.time, holes: body.holes || 18,
      playersAvailable: Number(body.playersAvailable) || 4, playersBooked: 0,
      // MP-3 B2c: the form sends dollars; the columns are cents.
      greenFeeCents: dollarsToCentsOr0(body.greenFee), cartFeeCents: dollarsToCentsOr0(body.cartFee),
      walkingAllowed: body.walkingAllowed !== false, status: 'available',
    },
  });
  return NextResponse.json(teeTimeToWire(teeTime));
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // MP-5d: this used to write whatever `status` string arrived. The only two
  // states a person can put a slot into are open and blocked; anything else
  // is the engine's to set. Goes through the same service the admin uses.
  if (status !== 'blocked' && status !== 'available') {
    return NextResponse.json({ error: 'status must be "blocked" or "available"' }, { status: 400 });
  }
  const row = await setTeeTimeBlocked(id, status === 'blocked', { scopeCourseId: session.courseId });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await prisma.teeTime.deleteMany({ where: { id, courseId: session.courseId } });
  return NextResponse.json({ success: true });
}

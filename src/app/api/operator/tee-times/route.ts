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
    // Review (security, LOW): this was an `include` — whole Booking rows, with
    // each golfer's checkInToken (a bearer credential that charges their card)
    // and Stripe ids, on every staff terminal. The sheet renders these fields.
    include: withBookings ? { bookings: {
      where: { status: { in: ['confirmed', 'completed'] } }, orderBy: { createdAt: 'asc' },
      select: { id: true, golferName: true, golferEmail: true, players: true, createdAt: true, status: true, paymentStatus: true, totalAmount: true, checkInFailReason: true },
    } } : undefined,
  });

  return NextResponse.json(teeTimes);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  // SD-11: these were written raw — "garbage" dates made rows nothing renders.
  const date = String(body.date ?? '');
  const time = String(body.time ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00'))) return NextResponse.json({ error: 'Date must be YYYY-MM-DD.' }, { status: 400 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NextResponse.json({ error: 'Time must be HH:MM (24-hour).' }, { status: 400 });
  const players = Number(body.playersAvailable) || 4;
  if (players < 1 || players > 8) return NextResponse.json({ error: 'Players must be between 1 and 8.' }, { status: 400 });

  // SD-11: staff can open a walk-in slot (that is the job) but never price it.
  // The price comes from the course's own schedule for that day; the body's
  // fee fields are ignored for staff.
  let greenFeeCents = dollarsToCentsOr0(body.greenFee);
  let cartFeeCents = dollarsToCentsOr0(body.cartFee);
  if (session.isStaff) {
    const dow = new Date(date + 'T12:00:00').getDay();
    const weekend = dow === 0 || dow === 6;
    const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId: session.courseId, active: true }, orderBy: { createdAt: 'desc' } });
    const sched = schedules.find(x => x.daysOfWeek.length === 0 || x.daysOfWeek.includes(dow)) ?? schedules[0];
    if (!sched) return NextResponse.json({ error: 'No schedule to price this time from — ask the course operator to add one.' }, { status: 409 });
    greenFeeCents = weekend ? sched.greenFeeWeekendCents : sched.greenFeeWeekdayCents;
    cartFeeCents = sched.cartFeeCents;
  } else if (greenFeeCents < 0 || greenFeeCents > 100000 || cartFeeCents < 0 || cartFeeCents > 50000) {
    return NextResponse.json({ error: 'Fees must be between $0 and $1,000 (green) / $500 (cart).' }, { status: 400 });
  }

  const teeTime = await prisma.teeTime.create({
    data: {
      courseId: session.courseId,
      date, time, holes: Number(body.holes) === 9 ? 9 : 18,
      playersAvailable: players, playersBooked: 0,
      // MP-3 B2c: the form sends dollars; the columns are cents.
      greenFeeCents, cartFeeCents,
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
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // SD-10: Booking.teeTimeId is ON DELETE RESTRICT, so deleting a booked slot
  // threw P2003 → an unhandled 500 the dashboard swallowed. Say it instead.
  const booked = await prisma.booking.count({ where: { teeTimeId: id, courseId: session.courseId, status: { in: ['confirmed', 'completed'] } } });
  if (booked > 0) {
    return NextResponse.json({ error: `This tee time has ${booked} booking${booked === 1 ? '' : 's'} — cancel ${booked === 1 ? 'it' : 'them'} first, or block the time instead.` }, { status: 409 });
  }
  const r = await prisma.teeTime.deleteMany({ where: { id, courseId: session.courseId } });
  if (r.count === 0) return NextResponse.json({ error: 'That tee time no longer exists.' }, { status: 404 });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getGolferSession } from '@/lib/auth';
import { canManageBooking } from '@/lib/manage-access';
import { dealPct } from '@/lib/last-minute';
import { demandPctAt, onlinePublicSeat, loadDemand } from '@/lib/demand-pricing';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const token = req.nextUrl.searchParams.get('token') || '';
  const golferSession = await getGolferSession();

  const ip = clientIp(req);
  const ok = await rateLimit('manage:times:' + ip, 30, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  if (!golferSession && !token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { checkInToken: true, golferAccountId: true, courseId: true, teeTimeId: true, players: true, teeTime: { select: { date: true } } },
  });
  if (!booking) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  const authorized = canManageBooking(booking, golferSession?.golferId, token);
  if (!authorized) {
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
    include: { product: { select: { label: true } } },
  });

  // PRICE-2 + PRICE-5: a golfer's own swap is priced as an online booking (lib/move-booking) —
  // the new time's deal or demand price, whichever is lower — so the page shows that price.
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: booking.courseId },
    select: { id: true, timezone: true, lastMinuteOn: true, lastMinuteHours: true, lastMinutePct: true, lastMinuteCounter: true, lastMinuteStack: true, demandMode: true, demandFloorPct: true, demandCeilingPct: true },
  });
  const demand = await loadDemand(course);
  const available = teeTimes
    .filter(t => t.playersAvailable - t.playersBooked >= booking.players)
    .map(t => ({
      id: t.id,
      time: t.time,
      holes: t.holes,
      productLabel: t.product?.label ?? null,
      spotsLeft: t.playersAvailable - t.playersBooked,
      // MP-3 B2c: cents at rest, dollars on the wire — the manage page renders
      // these with a dollars() formatter and was not changed.
      greenFee: centsToDollarsOr0(onlinePublicSeat(t.greenFeeCents, dealPct(course, t, 'online'), demandPctAt(course, demand, t))),
      cartFee: centsToDollarsOr0(t.cartFeeCents),
    }));

  return NextResponse.json(available);
}

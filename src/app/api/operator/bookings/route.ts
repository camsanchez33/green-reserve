import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { performCancellation } from '@/lib/cancel-booking';
import { performCheckIn } from '@/lib/checkin-booking';

// Used by both the Payments tab (all bookings, transaction ledger) and the
// Cancellations tab (status=cancelled) — one endpoint, filtered by query param.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') || undefined;
  const date = req.nextUrl.searchParams.get('date') || undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      courseId: session.courseId,
      ...(status ? { status } : {}),
      ...(date ? { teeTime: { date } } : {}),
    },
    include: { teeTime: { select: { date: true, time: true, holes: true } } },
    orderBy: { createdAt: 'desc' },
    take: date ? undefined : 200,
  });

  return NextResponse.json(bookings);
}

// Lets the operator cancel a booking on a golfer's behalf (e.g. a phone-call
// cancellation), or check a golfer in and charge them for their round —
// staff-side counterpart to the golfer's self-checkin link.
export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action } = await req.json();
  if (!id || (action !== 'cancel' && action !== 'checkin')) {
    return NextResponse.json({ error: 'Missing id or unsupported action' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id }, select: { courseId: true } });
  if (!booking || booking.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = action === 'cancel' ? await performCancellation(id) : await performCheckIn(id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

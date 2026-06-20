import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { performCancellation } from '@/lib/cancel-booking';

export async function POST(req: NextRequest) {
  const golferSession = await getGolferSession();
  if (!golferSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { golferAccountId: true } });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.golferAccountId !== golferSession.golferId)
    return NextResponse.json({ error: 'Not your booking' }, { status: 403 });

  const result = await performCancellation(bookingId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

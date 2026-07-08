import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { performCancellation } from '@/lib/cancel-booking';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const golferSession = await getGolferSession();
  const body = await req.json();
  const { bookingId, token } = body as { bookingId?: string; token?: string };

  if (!golferSession && !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });

  // Rate-limit the token path — each IP gets 10 cancel attempts per 5 minutes
  if (!golferSession && token) {
    const ip = clientIp(req);
    const ok = await rateLimit('manage:cancel:' + ip, 10, 300);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { golferAccountId: true, checkInToken: true },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  if (golferSession) {
    if (booking.golferAccountId !== golferSession.golferId) {
      return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
    }
  } else {
    // Token path: must match booking's checkInToken exactly
    if (!booking.checkInToken || booking.checkInToken !== token) {
      return NextResponse.json({ error: 'Invalid cancel token' }, { status: 403 });
    }
  }

  const result = await performCancellation(bookingId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

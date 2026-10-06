import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { canManageBooking } from '@/lib/manage-access';
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

  // Rate-limit the token path — each IP gets 10 cancel attempts per 5 minutes,
  // signed in or not (the token is accepted either way, below)
  if (token) {
    const ip = clientIp(req);
    const ok = await rateLimit('manage:cancel:' + ip, 10, 300);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { golferAccountId: true, checkInToken: true },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  // The golfer's own booking, or the emailed token — either is enough (G13).
  if (!canManageBooking(booking, golferSession?.golferId, token)) {
    return NextResponse.json({ error: golferSession && !token ? 'Not your booking' : 'Invalid cancel token' }, { status: 403 });
  }

  // Attribute to the signed-in golfer only when it is their booking; a token
  // cancel of someone else's guest booking is the token holder, not this account.
  const actorId = golferSession && booking.golferAccountId === golferSession.golferId ? golferSession.golferId : null;
  const result = await performCancellation(bookingId, { type: 'golfer', id: actorId });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

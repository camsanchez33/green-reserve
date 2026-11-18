import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canManageBooking } from '@/lib/manage-access';
import { performCancellation } from '@/lib/cancel-booking';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { bookingId, token } = body as { bookingId?: string; token?: string };

  // Cam 2026-11-18: the emailed link's token is the only way in (no golfer accounts).
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });

  // Each IP gets 10 cancel attempts per 5 minutes.
  const ip = clientIp(req);
  const ok = await rateLimit('manage:cancel:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { checkInToken: true },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  if (!canManageBooking(booking, token)) {
    return NextResponse.json({ error: 'Invalid cancel token' }, { status: 403 });
  }

  const result = await performCancellation(bookingId, { type: 'golfer', id: null });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

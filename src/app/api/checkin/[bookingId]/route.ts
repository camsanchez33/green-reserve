import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { performCheckIn, cartAddOnCentsFor } from '@/lib/checkin-booking';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// Public, token-gated check-in endpoint — the golfer doesn't need to be
// logged in (they may be checking in from a different device than they
// booked on). The checkInToken in the URL (sent in the reminder/confirmation
// emails) is the only proof of ownership; treat it like a magic link.
async function authorize(bookingId: string, token: string | null) {
  if (!token) return null;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true, cartFeeCents: true } },
      course: { select: { name: true, slug: true, address: true, city: true, state: true, brandColor: true } },
    },
  });
  if (!booking || booking.checkInToken !== token) return null;
  return booking;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  // HARDENING_SPEC §B: token endpoints rate-limit repeated misses.
  // Keyed on the booking (plus a loose per-IP ceiling): a clubhouse wifi full
  // of golfers must not lock each other out, and token guessing is per-booking.
  if (!(await rateLimit('checkin:get:' + bookingId, 30, 300)) || !(await rateLimit('checkin:get:ip:' + clientIp(req), 300, 300))) {
    return NextResponse.json({ error: 'Too many requests — try again in a few minutes.' }, { status: 429 });
  }
  const token = req.nextUrl.searchParams.get('token');
  const booking = await authorize(bookingId, token);
  if (!booking) return NextResponse.json({ error: 'Invalid or expired check-in link.' }, { status: 404 });

  return NextResponse.json({
    golferName: booking.golferName,
    courseName: booking.course.name,
    courseSlug: booking.course.slug,
    courseAddress: `${booking.course.address}, ${booking.course.city}, ${booking.course.state}`,
    brandColor: booking.course.brandColor,
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
    hasCard: !!booking.stripePaymentMethodId,
    // B-5: a cart can be added at check-in when the booking has none, the
    // round is not yet paid, and a cart is priced — at the member's tier
    // rate when they have one. Same helper the charge uses.
    cartAddOnCents: await cartAddOnCentsFor(booking),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  if (!(await rateLimit('checkin:post:' + bookingId, 10, 300)) || !(await rateLimit('checkin:post:ip:' + clientIp(req), 100, 300))) {
    return NextResponse.json({ error: 'Too many attempts — wait a few minutes, or check in at the pro shop.' }, { status: 429 });
  }
  const { token, paymentMethodId, addCart } = await req.json().catch(() => ({ token: null, paymentMethodId: undefined, addCart: false }));
  const booking = await authorize(bookingId, token);
  if (!booking) return NextResponse.json({ error: 'Invalid or expired check-in link.' }, { status: 404 });
  // B-5: a cart cannot be added online once the round is paid — say so rather
  // than checking in silently without it.
  if (addCart === true && (await cartAddOnCentsFor(booking)) === 0) {
    return NextResponse.json({ error: 'A cart can\'t be added to this booking online — ask at the pro shop and check in there.' }, { status: 409 });
  }

  const result = await performCheckIn(bookingId, { externalPaymentMethodId: paymentMethodId || undefined, addCart: addCart === true });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

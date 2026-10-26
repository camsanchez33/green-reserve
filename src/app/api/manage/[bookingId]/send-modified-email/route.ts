import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBookingModifiedEmail } from '@/lib/email';
import { getGolferSession } from '@/lib/auth';
import { canManageBooking } from '@/lib/manage-access';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  // G13-a (review ledger): the page calls this after a swap or a party change. A
  // leaked manage link must not turn it into a way to flood the golfer's inbox.
  if (!(await rateLimit('manage:modified-email:' + clientIp(req), 20, 3600)) || !(await rateLimit('manage:modified-email:b:' + bookingId, 6, 3600))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { token } = await req.json() as { token?: string };
  const golferSession = await getGolferSession();
  if (!golferSession && !token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true, product: { select: { label: true } } } },
      course: { select: { name: true, slug: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Invalid' }, { status: 404 });
  const authorized = canManageBooking(booking, golferSession?.golferId, token);
  if (!authorized) {
    return NextResponse.json({ error: 'Invalid' }, { status: 404 });
  }

  try {
    await sendBookingModifiedEmail({
      golferName: booking.golferName,
      golferEmail: booking.golferEmail,
      courseName: booking.course.name,
      courseSlug: booking.course.slug,
      date: booking.teeTime.date,
      time: booking.teeTime.time,
      holes: booking.teeTime.holes,
      productLabel: booking.teeTime.product?.label ?? null,
      players: booking.players,
      greenFeeTotal: booking.greenFeeTotal,
      cartFeeTotal: booking.cartFeeTotal,
      rangeBallsTotal: booking.rangeBallsTotal,
      accessFeeTotal: booking.accessFeeTotal,
      totalAmount: booking.totalAmount,
      shopTotalCents: booking.shopTotalCents,
      shopFeeCents: booking.shopFeeCents,
      shopTaxCents: booking.shopTaxCents,
      bookingId: booking.id,
      checkInToken: booking.checkInToken,
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'manage.modified_email.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: 'The updated confirmation could not be emailed.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

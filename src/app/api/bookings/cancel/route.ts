import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { sendCancellationEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const golferSession = await getGolferSession();
  if (!golferSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: true,
      course: { select: { name: true, cancellationHours: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.golferAccountId !== golferSession.golferId)
    return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
  if (booking.status === 'cancelled')
    return NextResponse.json({ error: 'Already cancelled' }, { status: 409 });

  // Check cancellation window
  const teeDateTime = new Date(`${booking.teeTime.date}T${booking.teeTime.time}`);
  const hoursUntilTeeTime = (teeDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const cancellationHours = booking.course.cancellationHours ?? 24;
  const withinWindow = hoursUntilTeeTime >= cancellationHours;

  // Refund green fee + cart fee (not the $1.50 service fee — that's non-refundable)
  let refundAmount = 0;
  if (withinWindow && booking.stripePaymentIntentId) {
    try {
      const refundCents = booking.greenFeeTotal + booking.cartFeeTotal;
      await stripe.refunds.create({
        payment_intent: booking.stripePaymentIntentId,
        amount: refundCents,
        reason: 'requested_by_customer',
      });
      refundAmount = refundCents;
    } catch (err) {
      console.error('Stripe refund failed:', err);
    }
  }

  // Cancel booking + restore tee time slot
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled', paymentStatus: refundAmount > 0 ? 'refunded' : booking.paymentStatus },
    }),
    prisma.teeTime.update({
      where: { id: booking.teeTimeId },
      data: {
        playersBooked: { decrement: booking.players },
        status: 'available',
      },
    }),
  ]);

  // Notify waitlist (first person gets the slot)
  const waitlisted = await prisma.waitlist.findFirst({
    where: { teeTimeId: booking.teeTimeId, notified: false },
    orderBy: { createdAt: 'asc' },
  });
  if (waitlisted) {
    await prisma.waitlist.update({ where: { id: waitlisted.id }, data: { notified: true } });
    // Send waitlist notification email
    const { sendWaitlistNotification } = await import('@/lib/email');
    await sendWaitlistNotification({
      name: waitlisted.name,
      email: waitlisted.email,
      courseName: booking.course.name,
      date: booking.teeTime.date,
      time: booking.teeTime.time,
    }).catch(console.error);
  }

  // Send cancellation email
  await sendCancellationEmail({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    players: booking.players,
    refundAmount,
    bookingId: booking.id,
  }).catch(console.error);

  return NextResponse.json({ success: true, refundAmount, refundIssued: refundAmount > 0 });
}

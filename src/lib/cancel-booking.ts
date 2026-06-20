import { prisma } from './prisma';
import { stripe } from './stripe';
import { sendCancellationEmail, sendWaitlistNotification } from './email';

/**
 * Shared cancellation logic used by both the golfer-initiated cancel route and
 * the operator-initiated cancel (dashboard "Cancellations" tab). Authorization
 * (does this golfer own the booking / does this operator own the course) is the
 * caller's responsibility — this just does the actual refund + slot restore +
 * waitlist promotion + emails once a cancellation has been authorized.
 */
export async function performCancellation(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: true,
      course: { select: { name: true, cancellationHours: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'Already cancelled', status: 409 } as const;

  const teeDateTime = new Date(`${booking.teeTime.date}T${booking.teeTime.time}`);
  const hoursUntilTeeTime = (teeDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const cancellationHours = booking.course.cancellationHours ?? 24;
  const withinWindow = hoursUntilTeeTime >= cancellationHours;

  // Refund green fee + cart fee (not the access fee — that's non-refundable)
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

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled', paymentStatus: refundAmount > 0 ? 'refunded' : booking.paymentStatus },
    }),
    prisma.teeTime.update({
      where: { id: booking.teeTimeId },
      data: { playersBooked: { decrement: booking.players }, status: 'available' },
    }),
  ]);

  const waitlisted = await prisma.waitlist.findFirst({
    where: { teeTimeId: booking.teeTimeId, notified: false },
    orderBy: { createdAt: 'asc' },
  });
  if (waitlisted) {
    await prisma.waitlist.update({ where: { id: waitlisted.id }, data: { notified: true } });
    await sendWaitlistNotification({
      name: waitlisted.name,
      email: waitlisted.email,
      courseName: booking.course.name,
      date: booking.teeTime.date,
      time: booking.teeTime.time,
    }).catch(console.error);
  }

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

  return { success: true, refundAmount, refundIssued: refundAmount > 0 } as const;
}

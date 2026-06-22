import { prisma } from './prisma';
import { chargeOnConnectedAccount, refundOnConnectedAccount } from './stripe';
import { sendCheckInReceiptEmail } from './email';

/**
 * Shared check-in logic — used by both the staff "Check In" button on the
 * dashboard tee sheet and the golfer's self-checkin link from the reminder
 * email. Charges the full round total (green + cart + range balls + the
 * GreenReserve access fee) as a direct charge on the course's connected
 * Stripe account, with the access fee taken as the application fee on that
 * same charge. If the golfer already had the late-cancellation fee charged
 * (they crossed the cutoff but never cancelled, then showed up anyway), that
 * fee is refunded in full since they did end up paying for the round.
 *
 * Authorization (is this the golfer's own booking / does this operator own
 * the course / does the token match) is the caller's responsibility.
 */
export async function performCheckIn(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, address: true, city: true, state: true, stripeAccountId: true, stripeAccountActive: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'This booking was cancelled', status: 409 } as const;
  if (booking.status === 'completed') return { error: 'Already checked in', status: 409 } as const;

  if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) {
    return { error: 'No card on file for this booking — collect payment in person and contact support.', status: 422 } as const;
  }
  if (!booking.course.stripeAccountActive || !booking.course.stripeAccountId) {
    return { error: 'This course isn’t connected to Stripe yet — collect payment in person.', status: 422 } as const;
  }

  const refundPendingFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;

  let paymentIntentId: string;
  try {
    const paymentIntent = await chargeOnConnectedAccount({
      customerId: booking.stripeCustomerId,
      paymentMethodId: booking.stripePaymentMethodId,
      connectedAccountId: booking.course.stripeAccountId,
      amountCents: Math.round(booking.totalAmount),
      applicationFeeCents: Math.round(booking.accessFeeTotal),
      description: `Round charge — ${booking.course.name} — booking ${booking.id}`,
    });
    paymentIntentId = paymentIntent.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Card could not be charged.';
    await prisma.booking.update({ where: { id: bookingId }, data: { checkInFailReason: message } });
    return { error: `Payment failed: ${message}. Collect payment in person and contact support.`, status: 402 } as const;
  }

  if (refundPendingFee) {
    try {
      await refundOnConnectedAccount({
        paymentIntentId: booking.cancellationFeeChargeId,
        connectedAccountId: booking.course.stripeAccountId,
      });
    } catch (err) {
      // The round charge already succeeded — don't fail check-in over a refund
      // hiccup, just log it so support can issue it manually from Stripe.
      console.error(`Could not refund cancellation fee for booking ${booking.id}:`, err);
    }
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'completed',
      paymentStatus: 'paid',
      checkedInAt: new Date(),
      roundPaymentIntentId: paymentIntentId,
      checkInFailReason: '',
    },
  });

  await sendCheckInReceiptEmail({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    greenFeeTotal: booking.greenFeeTotal,
    cartFeeTotal: booking.cartFeeTotal,
    rangeBallsTotal: booking.rangeBallsTotal,
    accessFeeTotal: booking.accessFeeTotal,
    totalAmount: booking.totalAmount,
    feeRefunded: refundPendingFee,
    feeRefundAmount: booking.cancellationFeeTotal,
    bookingId: booking.id,
  }).catch(console.error);

  return { success: true, totalCharged: booking.totalAmount, feeRefunded: refundPendingFee, feeRefundAmount: refundPendingFee ? booking.cancellationFeeTotal : 0 } as const;
}

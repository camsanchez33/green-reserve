import { prisma } from './prisma';
import { stripe, chargeOnConnectedAccount, refundOnConnectedAccount } from './stripe';
import { sendCheckInReceiptEmail } from './email';

/**
 * Charging a round, and checking a golfer in, are two different things.
 *
 * MP-1 fix-now #5: they used to be one function. `/api/admin/retry-charge`
 * called `performCheckIn` verbatim, so an admin clearing tomorrow's failed
 * charge today also marked the golfer checked in and emailed them a receipt
 * for a round they had not played. The money logic is identical either way,
 * so it lives once, here, and the two exported entry points differ only in
 * whether they also record the arrival.
 *
 *   collectPayment()  — take the money. Booking stays 'confirmed', no
 *                       checkedInAt, no receipt email.
 *   performCheckIn()  — take the money AND record the arrival + receipt.
 *
 * Charges the full round total (green + cart + range balls + the GreenReserve
 * access fee) as a direct charge on the course's connected Stripe account,
 * with the access fee taken as the application fee on that same charge. If the
 * golfer already had the late-cancellation fee charged (they crossed the
 * cutoff but never cancelled, then showed up anyway), that fee is refunded in
 * full since they did end up paying for the round.
 *
 * Authorization (is this the golfer's own booking / does this operator own
 * the course / does the token match) is the caller's responsibility.
 *
 * opts.externalPaymentMethodId -- for walk-up check-ins where no card was saved
 * at booking time (no-fee-policy courses). A PaymentMethod created from a fresh
 * card entry on the check-in page or by staff in the dashboard is passed here.
 * The temporary platform Customer is created, attached, and then
 * cloned-and-charged on the connected account exactly like a saved card.
 */
type ChargeOpts = { externalPaymentMethodId?: string };

async function chargeBooking(
  bookingId: string,
  opts: ChargeOpts | undefined,
  mode: { recordCheckIn: boolean },
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, slug: true, address: true, city: true, state: true, stripeAccountId: true, stripeAccountActive: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'This booking was cancelled', status: 409 } as const;
  if (booking.status === 'completed') return { error: 'Already checked in', status: 409 } as const;

  // Already paid (e.g. an earlier charge-only collect). Never charge twice.
  const alreadyPaid = booking.paymentStatus === 'paid' && !!booking.roundPaymentIntentId;
  if (alreadyPaid && !mode.recordCheckIn) {
    return { error: 'This round has already been paid — there is nothing to retry.', status: 409 } as const;
  }

  if (!alreadyPaid && (!booking.course.stripeAccountActive || !booking.course.stripeAccountId)) {
    return { error: 'Stripe setup incomplete — the operator needs to finish Stripe onboarding in dashboard Settings before card payments can be accepted.', status: 422 } as const;
  }

  const refundPendingFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;
  let paymentIntentId = booking.roundPaymentIntentId;

  // ── Money ────────────────────────────────────────────────────────────────
  // Skipped entirely when a prior collectPayment() already took it; this is
  // the check-in-after-collect path, and re-charging would be a real second
  // charge if the payment method had changed since.
  if (!alreadyPaid) {
    // Determine which customer + PM to charge.
    // For saved-card bookings: use the stored IDs.
    // For walk-up (no card at booking time): create a temporary platform Customer,
    // attach the freshly entered PM, then clone-and-charge below.
    let chargeCustomerId = booking.stripeCustomerId;
    let chargePaymentMethodId = booking.stripePaymentMethodId;
    const externalPm = opts?.externalPaymentMethodId;

    if (!chargePaymentMethodId) {
      if (!externalPm) {
        return { error: 'No card on file -- enter card details to complete check-in.', status: 422 } as const;
      }
      try {
        const tempCustomer = await stripe.customers.create({
          email: booking.golferEmail,
          name: booking.golferName,
          metadata: { bookingId: booking.id, source: 'walk_up_checkin' },
        });
        await stripe.paymentMethods.attach(externalPm, { customer: tempCustomer.id });
        chargeCustomerId = tempCustomer.id;
        chargePaymentMethodId = externalPm;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save card.';
        return { error: `Card setup failed: ${message}`, status: 402 } as const;
      }
    }

    const ev = mode.recordCheckIn ? 'checkin' : 'collect';
    try {
      console.log(JSON.stringify({ ev: `${ev}.charge.attempt`, bookingId, amountCents: Math.round(booking.totalAmount) }));
      const paymentIntent = await chargeOnConnectedAccount({
        customerId: chargeCustomerId,
        paymentMethodId: chargePaymentMethodId,
        connectedAccountId: booking.course.stripeAccountId as string,
        amountCents: Math.round(booking.totalAmount),
        applicationFeeCents: Math.round(booking.accessFeeTotal),
        description: `Round charge - ${booking.course.name} - booking ${booking.id}`,
        // Unchanged on purpose: the key is the booking + payment method, NOT
        // the entry point, so a collect followed by a check-in (or a retry
        // after a timeout) can never become two charges.
        idempotencyKey: `checkin-${booking.id}-${chargePaymentMethodId}`,
      });
      paymentIntentId = paymentIntent.id;
      console.log(JSON.stringify({ ev: `${ev}.charge.ok`, bookingId, paymentIntentId, amountCents: Math.round(booking.totalAmount) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Card could not be charged.';
      console.error(JSON.stringify({ ev: `${ev}.charge.fail`, bookingId, error: message }));
      await prisma.booking.update({ where: { id: bookingId }, data: { checkInFailReason: message } });
      return { error: `Payment failed: ${message}. Collect payment in person and contact support.`, status: 402 } as const;
    }

    if (refundPendingFee) {
      try {
        await refundOnConnectedAccount({
          paymentIntentId: booking.cancellationFeeChargeId,
          connectedAccountId: booking.course.stripeAccountId as string,
        });
        console.log(JSON.stringify({ ev: `${ev}.fee_refund.ok`, bookingId, cancelFeeChargeId: booking.cancellationFeeChargeId }));
      } catch (err) {
        // The round charge already succeeded -- don't fail over a refund
        // hiccup, just log it so support can issue it manually from Stripe.
        console.error(JSON.stringify({ ev: `${ev}.fee_refund.fail`, bookingId, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  // ── Record ───────────────────────────────────────────────────────────────
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: 'paid',
      roundPaymentIntentId: paymentIntentId,
      checkInFailReason: '',
      // Only a real check-in completes the booking and stamps the arrival.
      ...(mode.recordCheckIn ? { status: 'completed', checkedInAt: new Date() } : {}),
    },
  });

  if (mode.recordCheckIn) {
    await sendCheckInReceiptEmail({
      golferName: booking.golferName,
      golferEmail: booking.golferEmail,
      courseName: booking.course.name,
      courseSlug: booking.course.slug,
      date: booking.teeTime.date,
      time: booking.teeTime.time,
      players: booking.players,
      greenFeeTotal: booking.greenFeeTotal,
      cartFeeTotal: booking.cartFeeTotal,
      rangeBallsTotal: booking.rangeBallsTotal,
      accessFeeTotal: booking.accessFeeTotal,
      totalAmount: booking.totalAmount,
      feeRefunded: refundPendingFee,
      feeRefundAmount: booking.cancellationFeeTotal,
      bookingId: booking.id,
      checkInToken: booking.checkInToken,
    }).catch(console.error);
  }

  return {
    success: true,
    totalCharged: booking.totalAmount,
    feeRefunded: refundPendingFee,
    feeRefundAmount: refundPendingFee ? booking.cancellationFeeTotal : 0,
    alreadyPaid,
  } as const;
}

/** Charge the round AND record the arrival + receipt. Staff and self check-in. */
export async function performCheckIn(bookingId: string, opts?: ChargeOpts) {
  return chargeBooking(bookingId, opts, { recordCheckIn: true });
}

/**
 * Charge the round ONLY. The golfer is not checked in and gets no receipt —
 * used by admin "Collect payment" on a previously failed charge, where the
 * round may be days away.
 */
export async function collectPayment(bookingId: string, opts?: ChargeOpts) {
  return chargeBooking(bookingId, opts, { recordCheckIn: false });
}

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
type ChargeOpts = {
  externalPaymentMethodId?: string;
  /** B-5: add a cart at check-in for a booking that has none — priced at the
   *  tee time's cart fee × players, written to the booking before the charge. */
  addCart?: boolean;
};

/**
 * B-5 (security review): the cart add-on is priced the way the booking route
 * prices a cart — the golfer's active tier at this course, when they have one
 * (flat weekday/weekend cart rate), else the tee time's cart fee. Used for
 * both the quote (GET) and the charge, so they cannot disagree.
 */
export async function cartAddOnCentsFor(booking: {
  golferAccountId: string | null; golferEmail: string; courseId: string; players: number;
  cartSelected: boolean; cartFeeTotal: number; paymentStatus: string; roundPaymentIntentId: string;
  teeTime: { date: string; cartFeeCents: number };
}): Promise<number> {
  if (booking.cartSelected || booking.cartFeeTotal > 0) return 0;
  if (booking.paymentStatus === 'paid' && booking.roundPaymentIntentId) return 0;
  let perPlayer = booking.teeTime.cartFeeCents;
  // Membership resolves the way the booking route does (member-session.ts):
  // by golfer account OR by the invite email, so an invite-only member who has
  // not accepted yet still gets their rate. Scoped to THIS course.
  const m = await prisma.courseMembership.findFirst({
    where: {
      courseId: booking.courseId,
      status: 'active',
      OR: [
        ...(booking.golferAccountId ? [{ golferId: booking.golferAccountId }] : []),
        ...(booking.golferEmail ? [{ inviteEmail: { equals: booking.golferEmail, mode: 'insensitive' as const } }] : []),
      ],
    },
    include: { tier: { select: { greenFeeWeekdayCents: true, greenFeeWeekendCents: true, cartFeeWeekdayCents: true, cartFeeWeekendCents: true, discountPct: true } } },
  });
  if (m?.tier) {
    const t = m.tier;
    const d = new Date(booking.teeTime.date + 'T12:00:00');
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    // Same order of precedence as applyTierRates in the booking route: flat
    // overrides first, else a percentage off standard, else standard.
    if (t.greenFeeWeekdayCents != null || t.greenFeeWeekendCents != null) {
      perPlayer = weekend
        ? (t.cartFeeWeekendCents ?? t.cartFeeWeekdayCents ?? perPlayer)
        : (t.cartFeeWeekdayCents ?? perPlayer);
    } else if (t.discountPct != null) {
      perPlayer = Math.round(perPlayer * (1 - t.discountPct / 100));
    }
  }
  if (perPlayer <= 0) return 0;
  return perPlayer * booking.players;
}

async function chargeBooking(
  bookingId: string,
  opts: ChargeOpts | undefined,
  mode: { recordCheckIn: boolean },
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, cartFeeCents: true } },
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

  // B-5: "Add a cart today?" — only for a booking with no cart, only before
  // money moves, only when the tee time actually prices a cart. The booking's
  // own totals change first so the charge, the receipt and the ledger agree.
  let cartAddedCents = 0;
  const preCart = { cartSelected: booking.cartSelected, cartFeeTotal: booking.cartFeeTotal, totalAmount: booking.totalAmount };
  if (opts?.addCart && !alreadyPaid) {
    cartAddedCents = await cartAddOnCentsFor(booking);
    if (cartAddedCents > 0) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { cartSelected: true, cartFeeTotal: cartAddedCents, totalAmount: booking.totalAmount + cartAddedCents },
      });
      booking.cartSelected = true;
      booking.cartFeeTotal = cartAddedCents;
      booking.totalAmount = booking.totalAmount + cartAddedCents;
      console.log(JSON.stringify({ ev: 'checkin.cart_added', bookingId, cartAddedCents }));
    }
  }

  const refundPendingFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;
  // SD-4: `feeRefunded` used to be this flag — the INTENT to refund. The
  // attempt below can fail, and when it did the dashboard toast, the golfer's
  // receipt and the self-check-in page all said "refunded". Track the outcome.
  let feeRefundOk = false;
  let feeRefundError = '';
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

    // SD review: a card entered at the counter used to be honoured ONLY when
    // the booking had no saved card. After a decline, "Retry with new card"
    // therefore re-charged the declined card under the same idempotency key
    // and Stripe replayed the decline. A fresh card always wins.
    if (externalPm) {
      try {
        let customerId = chargeCustomerId;
        if (!customerId) {
          const tempCustomer = await stripe.customers.create({
            email: booking.golferEmail,
            name: booking.golferName,
            metadata: { bookingId: booking.id, source: 'walk_up_checkin' },
          });
          customerId = tempCustomer.id;
        }
        await stripe.paymentMethods.attach(externalPm, { customer: customerId });
        chargeCustomerId = customerId;
        chargePaymentMethodId = externalPm;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save card.';
        return { error: `Card setup failed: ${message}`, status: 402 } as const;
      }
    } else if (!chargePaymentMethodId) {
      return { error: 'No card on file -- enter card details to complete check-in.', status: 422 } as const;
    }

    const ev = mode.recordCheckIn ? 'checkin' : 'collect';

    // Review (security, MEDIUM): a new card changes the idempotency key. If
    // the FIRST attempt actually succeeded at Stripe but the response never
    // reached us (timeout), a retry with a new card — or, since B-5, a retry
    // at a different amount (cart added) — would be a new Stripe request and
    // a second full charge. Ask Stripe whether this booking already has a
    // succeeded charge before charging at all. (Security review: this used to
    // run only for a new card.)
    {
      try {
        const found = await stripe.paymentIntents.search(
          { query: `metadata['bookingId']:'${booking.id}' AND status:'succeeded'`, limit: 1 },
          { stripeAccount: booking.course.stripeAccountId as string },
        );
        // A refunded charge is not "this charge" — the course may still collect.
        const prior = found.data.find(pi => (pi.amount_refunded ?? 0) < pi.amount);
        if (prior) {
          console.warn(JSON.stringify({ ev: `${ev}.charge.already_succeeded`, bookingId, paymentIntentId: prior.id, amount: prior.amount }));
          // Reconcile the booking to what Stripe actually took, not to what
          // this attempt assumed: base+cart if the earlier attempt had the
          // cart, base if it did not, and the exact figure otherwise.
          const base = preCart.totalAmount;
          const money = prior.amount === base + cartAddedCents && cartAddedCents > 0
            ? { cartSelected: true, cartFeeTotal: cartAddedCents, totalAmount: prior.amount }
            : prior.amount === base
              ? preCart
              : { totalAmount: prior.amount };
          await prisma.booking.update({ where: { id: bookingId }, data: { roundPaymentIntentId: prior.id, paymentStatus: 'paid', checkInFailReason: '', ...money } });
          return { error: 'This round was already charged on an earlier attempt (the confirmation was lost in transit). It is now recorded as paid — refresh and check in without a card.', status: 409 } as const;
        }
      } catch (err) {
        // Search is best-effort; a failure here must not block the counter.
        console.warn(JSON.stringify({ ev: `${ev}.charge.search_failed`, bookingId, error: err instanceof Error ? err.message : String(err) }));
      }
    }

    try {
      console.log(JSON.stringify({ ev: `${ev}.charge.attempt`, bookingId, amountCents: Math.round(booking.totalAmount) }));
      const paymentIntent = await chargeOnConnectedAccount({
        customerId: chargeCustomerId,
        paymentMethodId: chargePaymentMethodId,
        connectedAccountId: booking.course.stripeAccountId as string,
        amountCents: Math.round(booking.totalAmount),
        applicationFeeCents: Math.round(booking.accessFeeTotal),
        description: `Round charge - ${booking.course.name} - booking ${booking.id}`,
        metadata: { bookingId: booking.id },
        // Unchanged on purpose: the key is the booking + payment method, NOT
        // the entry point, so a collect followed by a check-in (or a retry
        // after a timeout) can never become two charges.
        // Booking + card, and NOTHING else: a retry at the same amount replays
        // the original result; a retry at a different amount (cart added after
        // a timed-out attempt) makes Stripe refuse the reused key — an error
        // the golfer sees, never a second charge. (Second security review:
        // putting the amount in the key turned that refusal into a fresh
        // request, and a search index that lags by a minute cannot stand in
        // for idempotency.)
        idempotencyKey: `checkin-${booking.id}-${chargePaymentMethodId}`,
      });
      paymentIntentId = paymentIntent.id;
      console.log(JSON.stringify({ ev: `${ev}.charge.ok`, bookingId, paymentIntentId, amountCents: Math.round(booking.totalAmount) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Card could not be charged.';
      const errType = (err as { type?: string })?.type ?? '';
      // Stripe told us, definitively, that no money moved: a card decline, or a
      // reused idempotency key with different params (the total changed since
      // the first attempt). Anything else — a timeout, a dropped connection —
      // may have charged, so the cart stays on the booking for reconciliation.
      const definite = errType === 'StripeCardError' || errType === 'StripeIdempotencyError' || /idempotent|idempotency/i.test(message);
      console.error(JSON.stringify({ ev: `${ev}.charge.fail`, bookingId, errType, definite, error: message }));
      await prisma.booking.update({ where: { id: bookingId }, data: { checkInFailReason: message, ...(cartAddedCents > 0 && definite ? preCart : {}) } });
      if (/idempotent|idempotency/i.test(message)) {
        return { error: 'The total changed since your first attempt (a cart was added or removed). Refresh the page and try once more.', status: 409 } as const;
      }
      return { error: `Payment failed: ${message}. Collect payment in person and contact support.`, status: 402 } as const;
    }

    if (refundPendingFee) {
      try {
        await refundOnConnectedAccount({
          paymentIntentId: booking.cancellationFeeChargeId,
          connectedAccountId: booking.course.stripeAccountId as string,
        });
        feeRefundOk = true;
        console.log(JSON.stringify({ ev: `${ev}.fee_refund.ok`, bookingId, cancelFeeChargeId: booking.cancellationFeeChargeId }));
      } catch (err) {
        // The round charge already succeeded -- don't fail over a refund
        // hiccup. Log it AND report it, so the person at the counter knows
        // the golfer is still out the fee until someone issues it in Stripe.
        feeRefundError = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ ev: `${ev}.fee_refund.fail`, bookingId, error: feeRefundError }));
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
      feeRefunded: feeRefundOk,
      feeRefundFailed: refundPendingFee && !feeRefundOk,
      feeRefundAmount: booking.cancellationFeeTotal,
      bookingId: booking.id,
      checkInToken: booking.checkInToken,
    }).catch(console.error);
  }

  return {
    success: true,
    totalCharged: booking.totalAmount,
    /** The late-cancellation fee was actually refunded. */
    feeRefunded: feeRefundOk,
    /** A fee was owed back and the refund FAILED — someone must issue it in Stripe. */
    feeRefundFailed: refundPendingFee && !feeRefundOk,
    feeRefundError: refundPendingFee && !feeRefundOk ? feeRefundError : '',
    feeRefundAmount: refundPendingFee ? booking.cancellationFeeTotal : 0,
    alreadyPaid,
    /** B-5: cents added for a cart at check-in (0 when none). */
    cartAddedCents,
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

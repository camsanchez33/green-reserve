import { prisma } from './prisma';
import { sendCancellationEmail, sendTeeTimeAlertEmail } from './email';
import { refundOnConnectedAccount, chargeOnConnectedAccount } from './stripe';
import { refundSeparateAccessFee, chargeAccessFeeSeparately } from './access-fee';
import { chargesOnLateCancel, bookingWindowHours } from './cancel-policy';
import { recordPaymentEvent } from './refund-booking';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';

export type CancellationOptions = {
  /**
   * MP-5b. Cancelling normally frees a slot, so anyone watching for that time
   * gets "a tee time opened up". When the cancellation is because the COURSE
   * is closing, that email invites golfers to book at a course that is about
   * to stop taking bookings — so the closure path turns it off, and leaves the
   * alerts unnotified for a genuine opening later.
   */
  notifySlotAlerts?: boolean;
  /** Shown to the golfer so a cancellation they did not ask for is explained. */
  reason?: string;
  /** WX-1 weather cancel: the COURSE cancelled — refund a late-cancel fee already
   *  taken (best effort; a failed refund is reported, never blocks the cancel). */
  waiveFee?: boolean;
  /** Review 2026-10-04: the course is closing this time (weather) — leave the
   *  slot BLOCKED instead of reopening it, so nobody books into the gap. */
  keepSlotBlocked?: boolean;
};

export async function performCancellation(bookingId: string, actor: EventActor, opts: CancellationOptions = {}) {
  const { notifySlotAlerts = true, reason, waiveFee = false, keepSlotBlocked = false } = opts;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: true,
      course: { select: { name: true, slug: true, cancellationHours: true, stripeAccountId: true, stripeAccountActive: true, timezone: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'Already cancelled', status: 409 } as const;
  if (booking.status === 'completed') return { error: 'This round was already checked in and paid for — nothing to cancel', status: 409 } as const;

  // MP-1b B1 — a round can now be PAID while still 'confirmed'.
  // collectPayment() (MP-1 fix-now #5) charges without checking anyone in, so a
  // booking can sit at confirmed + paid + roundPaymentIntentId with checkedInAt
  // null. Before this guard the two status checks above let such a booking
  // cancel straight through: the slot was freed for resale, the golfer was told
  // no fee was charged, and the full round charge was silently kept. Refund it
  // as part of the cancellation, and if the refund does not go through, refuse
  // to cancel rather than release the slot while holding their money.
  const roundPaid = booking.paymentStatus === 'paid' && !!booking.roundPaymentIntentId;
  let roundRefunded = false;
  if (roundPaid) {
    if (!booking.course.stripeAccountId) {
      return { error: 'This round was already paid but the course has no connected Stripe account — refund it manually before cancelling.', status: 409 } as const;
    }
    try {
      const refund = await refundOnConnectedAccount({
        paymentIntentId: booking.roundPaymentIntentId as string,
        connectedAccountId: booking.course.stripeAccountId,
      });
      roundRefunded = true;
      await recordBookingEventSafe({
        bookingId, courseId: booking.courseId, type: 'fee_refunded', actor,
        amountCents: refund.amount, playerCount: booking.checkedInPlayers ?? booking.players,
        teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
        stripeId: refund.id, metadata: { reason: 'round_refunded_on_cancel' },
      });
      console.log(JSON.stringify({ ev: 'cancel.round_refund.ok', bookingId, paymentIntentId: booking.roundPaymentIntentId }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ ev: 'cancel.round_refund.fail', bookingId, error: message }));
      return { error: `This round was already paid and the refund failed (${message}). The booking was NOT cancelled — refund it in Stripe, then cancel.`, status: 502 } as const;
    }
  }

  let feeAlreadyCharged = booking.paymentStatus === 'cancellation_fee_charged';
  let feeRefundFailed = '';
  if (feeAlreadyCharged && waiveFee && booking.cancellationFeeChargeId && booking.course.stripeAccountId) {
    try {
      const refund = await refundOnConnectedAccount({ paymentIntentId: booking.cancellationFeeChargeId, connectedAccountId: booking.course.stripeAccountId });
      feeAlreadyCharged = false;
      await recordBookingEventSafe({
        bookingId, courseId: booking.courseId, type: 'fee_refunded', actor,
        amountCents: refund.amount, playerCount: booking.players,
        teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
        stripeId: refund.id, metadata: { reason: 'late_fee_waived' },
      });
      console.log(JSON.stringify({ ev: 'cancel.fee_waived.ok', bookingId, paymentIntentId: booking.cancellationFeeChargeId }));
    } catch (err) {
      feeRefundFailed = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ ev: 'cancel.fee_waived.fail', bookingId, error: feeRefundFailed }));
    }
  }

  // SP-B: under "only if they cancel late" / "cancel late or don't show" nothing
  // was held at the cutoff — a cancellation inside the window charges the late
  // fee NOW. Best effort: a failed charge is recorded and reported, and never
  // blocks the cancellation (STAFF_POLICY_SPEC B4).
  let lateFee: { id: string } | null = null;
  let lateFeeChargeFailed = '';
  const teeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
  const windowHours = bookingWindowHours(booking, booking.course);
  const isLate = !!teeAt && teeAt.getTime() - windowHours * 3600_000 <= Date.now();
  if (!waiveFee && !feeAlreadyCharged && isLate && booking.cancellationFeeTotal > 0 && chargesOnLateCancel(booking)) {
    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) lateFeeChargeFailed = 'no card on file';
    else if (!booking.course.stripeAccountId || !booking.course.stripeAccountActive) lateFeeChargeFailed = 'the course’s Stripe account is not connected';
    else {
      try {
        lateFee = await chargeOnConnectedAccount({
          customerId: booking.stripeCustomerId,
          paymentMethodId: booking.stripePaymentMethodId,
          connectedAccountId: booking.course.stripeAccountId,
          amountCents: Math.round(booking.cancellationFeeTotal),
          applicationFeeCents: 0,
          description: `Late-cancellation fee - ${booking.course.name} - booking ${booking.id}`,
          idempotencyKey: `latefee-${booking.id}-${booking.stripePaymentMethodId}`,
        });
        feeAlreadyCharged = true;
      } catch (err) {
        lateFeeChargeFailed = err instanceof Error ? err.message : String(err);
      }
    }
    if (lateFeeChargeFailed) {
      console.error(JSON.stringify({ ev: 'cancel.late_fee.fail', bookingId, error: lateFeeChargeFailed }));
      await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents: Math.round(booking.cancellationFeeTotal), actor: 'system', detail: `Late-cancellation fee: ${lateFeeChargeFailed}` }).catch(() => {});
    }
  }

  // MP-1 fix-now #6: a free cancel must not leave a stamped fee behind.
  // Every booking at a fee-policy course carries cancellationFeeTotal from
  // creation. The cutoff cron only charges bookings that are STILL
  // 'confirmed' (see api/cron/cancellation-cutoff — "Bookings the golfer
  // already cancelled are excluded by status:'confirmed'"), so once we
  // cancel here the fee can never be charged. Leaving the amount stamped is
  // what made Revenue's Money-in-Motion show the same $10 rows as "pending"
  // forever. If it was never charged, it never will be — clear it.
  // (MP-3's cancellationFeeApplies flag replaces this with a real state.)
  const clearPhantomFee = !feeAlreadyCharged && booking.cancellationFeeTotal > 0;

  // EV-1: the cancel and its booking_cancelled event commit together.
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        ...(clearPhantomFee ? { cancellationFeeTotal: 0 } : {}),
        ...(roundRefunded ? { paymentStatus: 'refunded', roundPaymentIntentId: '' } : {}),
        ...(waiveFee && !feeAlreadyCharged && booking.paymentStatus === 'cancellation_fee_charged' ? { paymentStatus: 'refunded', cancellationFeeApplies: false } : {}),
        ...(lateFee ? { paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: lateFee.id, cancellationFeeChargedAt: new Date(), cancellationFeeApplies: true } : {}),
      },
    });
    await tx.teeTime.update({
      where: { id: booking.teeTimeId },
      data: { playersBooked: { decrement: booking.players }, status: keepSlotBlocked ? 'blocked' : 'available' },
    });
    await recordBookingEvent(tx, {
      bookingId, courseId: booking.courseId, type: 'booking_cancelled', actor,
      amountCents: feeAlreadyCharged ? booking.cancellationFeeTotal : 0, playerCount: booking.players,
      teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
      metadata: { feeKept: feeAlreadyCharged, roundRefunded, ...(opts.reason ? { reason: opts.reason } : {}) },
    });
  });

  // Find all unnotified alerts for this slot (specific-slot or criteria-based)
  const alerts = notifySlotAlerts ? await prisma.teeTimeAlert.findMany({
    where: {
      notifiedAt: null,
      OR: [
        { teeTimeId: booking.teeTimeId },
        {
          courseId: booking.courseId,
          date: booking.teeTime.date,
          players: { lte: booking.players },
        },
      ],
    },
  }) : [];

  // For criteria alerts, filter by time window in-memory
  const matching = alerts.filter((a) => {
    if (a.teeTimeId) return true;
    if (a.windowStart && booking.teeTime.time < a.windowStart) return false;
    if (a.windowEnd && booking.teeTime.time > a.windowEnd) return false;
    return true;
  });

  if (matching.length > 0) {
    await prisma.teeTimeAlert.updateMany({
      where: { id: { in: matching.map((a) => a.id) } },
      data: { notifiedAt: new Date() },
    });
    for (const alert of matching) {
      await sendTeeTimeAlertEmail({
        name: alert.name,
        email: alert.email,
        courseName: booking.course.name,
        courseSlug: booking.course.slug,
        date: booking.teeTime.date,
        time: booking.teeTime.time,
        players: alert.players,
        unsubscribeToken: alert.token,
      }).catch(console.error);
    }
  }

  await sendCancellationEmail({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    players: booking.players,
    feeCharged: feeAlreadyCharged,
    feeAmount: feeAlreadyCharged ? booking.cancellationFeeTotal : 0,
    bookingId: booking.id,
    reason,
  }).catch(console.error);

  if (lateFee) {
    await recordBookingEventSafe({
      bookingId, courseId: booking.courseId, type: 'fee_charged', actor,
      amountCents: Math.round(booking.cancellationFeeTotal), playerCount: booking.players,
      teeTimeAt: teeAt, stripeId: lateFee.id, metadata: { reason: 'late_cancel' },
    });
  }

  // SP-B (Cam 2026-10-05: "if the course has a cancellation policy then we
  // uphold that policy with our fee as well"): when the course keeps a late
  // fee, GreenReserve's fee is charged with it. A free or waived cancel keeps
  // nothing — any booking fee charged on its own (a no-show then cancelled) is
  // refunded, as FB-3 did. Neither ever blocks the cancellation.
  if (feeAlreadyCharged && !waiveFee) await chargeAccessFeeSeparately(bookingId, { why: 'late_cancel', actor: 'system' });
  else await refundSeparateAccessFee(bookingId, 'booking cancelled', 'system');

  return { success: true, feeCharged: feeAlreadyCharged, roundRefunded, feeRefundFailed, lateFeeChargeFailed } as const;
}

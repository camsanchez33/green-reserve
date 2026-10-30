import { prisma } from './prisma';
import { sendCancellationEmail, sendTeeTimeAlertEmail } from './email';
import { refundOnConnectedAccount, chargeOnConnectedAccount } from './stripe';
import { refundSeparateAccessFee, chargeAccessFeeSeparately } from './access-fee';
import { refundBookingFee } from './booking-fee';
import { releaseBookingRounds } from './round-packs';
import { chargesOnLateCancel, holdsAtCutoff, bookingWindowHours } from './cancel-policy';
import { recordPaymentEvent } from './refund-booking';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';
import { liveNoShowCharge, refundNoShowFee, chargeNoShow } from './no-show-fee';
import { recordMove, feeBackCents, chargeWhat } from './money-ledger';
import { roundApplicationFeeCents } from './shop';

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
  /** W2-8: the course called the round off (weather, a closure). Written on the
   *  cancel event so Analytics counts it apart from golfers' cancellations. */
  courseCalledOff?: 'weather' | 'closure';
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
  // Cam 2026-10-27: "if its after the time then they cant cancel … their no show fee if they
  // have one and then all the no shows get charged at midnight". Once the tee time has gone
  // off the group checks in or is a no-show. Only the course calling it off (weather,
  // closure) or staff removing a booking made by mistake (waiveFee, sheet.waive_fee) takes
  // it off the sheet after that — neither keeps a fee.
  const teeStart = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
  if (teeStart && teeStart.getTime() <= Date.now() && !waiveFee && !opts.courseCalledOff) {
    return { error: actor.type === 'golfer'
      ? 'This tee time has already gone off, so it can’t be cancelled. Contact the course.'
      : 'This tee time has already gone off — mark the group a no-show instead.', status: 409 } as const;
  }

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
      // LEDGER-1: the whole round back, GreenReserve's application fee with it (refund_application_fee).
      await recordMove({ courseId: booking.courseId, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, platformFeeCents: feeBackCents(refund.amount, booking.roundChargedCents ?? refund.amount, roundApplicationFeeCents(booking)), stripeId: refund.id, bookingId, actor: actor.type, note: 'paid round cancelled' });
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
  // MAIL-1: a waived fee given back is money moving — the email comes from billing@.
  let feeWaivedRefunded = false;
  if (feeAlreadyCharged && waiveFee && booking.cancellationFeeChargeId && booking.course.stripeAccountId) {
    try {
      const refund = await refundOnConnectedAccount({ paymentIntentId: booking.cancellationFeeChargeId, connectedAccountId: booking.course.stripeAccountId });
      feeAlreadyCharged = false;
      feeWaivedRefunded = true;
      await recordMove({ courseId: booking.courseId, what: await chargeWhat(booking.cancellationFeeChargeId, holdsAtCutoff(booking) ? 'hold' : 'late_fee'), direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, stripeId: refund.id, bookingId, actor: actor.type, note: 'fee waived on cancel' });
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

  // R-PAY-002 / R-BOOK-003: a no-show already took the course's charge (under
  // "cancel late or don't show" it IS the late fee). Cancelling afterwards must
  // never charge the late fee on top — describePolicy promises "never both".
  // The no-show charge stands as the fee kept; a waived (weather) cancel gives
  // it back, like any other fee the course waives.
  // NS-EOD: marking a no-show charges nothing until the course's midnight, and
  // cancelling takes the booking out of that run. Cancelling a flagged booking
  // is the final word, so its no-show charges are taken now (unless waived).
  // Since Cam 2026-10-27 a flagged no-show is refused above (its tee time has gone off),
  // so this branch only guards a cancel that reaches here some other way.
  if (booking.noShowAt && !waiveFee && !(await liveNoShowCharge(bookingId))) {
    await chargeNoShow(bookingId).catch(err => console.error(JSON.stringify({ ev: 'cancel.noshow_charge.fail', bookingId, error: err instanceof Error ? err.message : String(err) })));
  }
  let noShowCharge = booking.noShowAt ? await liveNoShowCharge(bookingId) : null;
  if (noShowCharge && waiveFee) {
    const r = await refundNoShowFee(bookingId, 'cancellation (fee waived)');
    if (r.refunded) { noShowCharge = null; feeWaivedRefunded = true; }
    else if (r.error) feeRefundFailed = feeRefundFailed || `no-show fee: ${r.error}`;
  }

  // SP-B: under "only if they cancel late" / "cancel late or don't show" nothing
  // was held at the cutoff — a cancellation inside the window charges the late
  // fee NOW. A hold not yet taken is charged now too (below). Best effort: a failed charge is recorded and reported, and never
  // blocks the cancellation (STAFF_POLICY_SPEC B4).
  let lateFee: { id: string } | null = null;
  let lateFeeChargeFailed = '';
  const teeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
  const windowHours = bookingWindowHours(booking, booking.course);
  const isLate = !!teeAt && teeAt.getTime() - windowHours * 3600_000 <= Date.now();
  // A hold booking cancelled after its cutoff but before the hourly cron took the
  // hold (or after a failed hold charge) used to escape the fee entirely, though
  // describePolicy promises the hold is "kept if you cancel late". It is charged
  // here with the crons' own idempotency key, so a cron run racing this cancel
  // cannot charge it twice.
  const hold = holdsAtCutoff(booking);
  if (!waiveFee && !feeAlreadyCharged && !noShowCharge && isLate && booking.cancellationFeeTotal > 0 && (chargesOnLateCancel(booking) || hold)) {
    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) lateFeeChargeFailed = 'no card on file';
    else if (!booking.course.stripeAccountId || !booking.course.stripeAccountActive) lateFeeChargeFailed = 'the course’s Stripe account is not connected';
    else {
      try {
        const charge = () => chargeOnConnectedAccount({
          customerId: booking.stripeCustomerId as string,
          paymentMethodId: booking.stripePaymentMethodId as string,
          connectedAccountId: booking.course.stripeAccountId as string,
          amountCents: Math.round(booking.cancellationFeeTotal),
          applicationFeeCents: 0,
          description: `Late-cancellation fee - ${booking.course.name} - booking ${booking.id}`,
          // The crons' key only while a cron could still be racing this cancel
          // (card_on_file). After a hold was taken and refunded (collectPayment),
          // reusing it would make Stripe replay the refunded PaymentIntent.
          idempotencyKey: hold && booking.paymentStatus === 'card_on_file'
            ? `cancelfee-${booking.id}-${booking.stripePaymentMethodId}`
            : `latefee-${booking.id}-${booking.stripePaymentMethodId}`,
        });
        // A cron charging this same hold right now makes Stripe answer "another
        // in-progress request using this key". Wait and replay: Stripe then returns
        // the cron's PaymentIntent, this cancel records it, and the cron sees it
        // recorded (lib/cutoff-hold) instead of refunding a fee the golfer owes.
        for (let attempt = 0; ; attempt++) {
          try {
            lateFee = await charge();
            // LEDGER-1: recorded the moment it's taken — a hold the cron charged under the same key is one row.
            await recordMove({ courseId: booking.courseId, what: hold ? 'hold' : 'late_fee', direction: 'in', method: 'card', account: 'course', amountCents: Math.round(booking.cancellationFeeTotal), stripeId: lateFee.id, bookingId, actor: actor.type, note: 'kept on a late cancel' });
            break;
          } catch (err) {
            if (attempt >= 2 || !/in[- ]progress/i.test(err instanceof Error ? err.message : '')) throw err;
            await new Promise(r => setTimeout(r, 2000));
          }
        }
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
  // R-BOOK-002: two cancels of one booking at once both passed the status check
  // above and both freed its seats (overselling the slot). The write is now
  // conditional: only the cancel that moves it off 'confirmed' frees seats.
  const won = await prisma.$transaction(async (tx) => {
    const moved = await tx.booking.updateMany({
      where: { id: bookingId, status: 'confirmed' },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        ...(clearPhantomFee ? { cancellationFeeTotal: 0 } : {}),
        ...(roundRefunded ? { paymentStatus: 'refunded', roundPaymentIntentId: '' } : {}),
        ...(waiveFee && !feeAlreadyCharged && booking.paymentStatus === 'cancellation_fee_charged' ? { paymentStatus: 'refunded', cancellationFeeApplies: false } : {}),
        ...(lateFee ? { paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: lateFee.id, cancellationFeeChargedAt: new Date(), cancellationFeeApplies: true } : {}),
      },
    });
    if (!moved.count) return false;
    await tx.teeTime.update({
      where: { id: booking.teeTimeId },
      data: { playersBooked: { decrement: booking.players }, status: keepSlotBlocked ? 'blocked' : 'available' },
    });
    await recordBookingEvent(tx, {
      bookingId, courseId: booking.courseId, type: 'booking_cancelled', actor,
      amountCents: feeAlreadyCharged ? booking.cancellationFeeTotal : 0, playerCount: booking.players,
      teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
      // waived / feeAtBooking: Money → Cancellations says why no fee was kept (lib/cancel-fee-reason) —
      // the fee column is zeroed above when it isn't kept, so the event is the only record of it.
      metadata: { feeKept: feeAlreadyCharged, roundRefunded, feeAtBooking: booking.cancellationFeeTotal, ...(waiveFee ? { waived: true } : {}), ...(noShowCharge ? { noShowFeeKept: noShowCharge.amountCents } : {}), ...(opts.reason ? { reason: opts.reason } : {}), ...(opts.courseCalledOff ? { courseCalledOff: opts.courseCalledOff } : {}) },
    });
    return true;
  });
  if (!won) {
    // Money this losing cancel already moved must not be left unrecorded.
    // A late fee it charged is ours alone unless the winner recorded the same
    // PaymentIntent (same idempotency key) — then it stays; otherwise (a waived
    // weather/closure cancel or a check-in won) it is refunded, as cutoff-hold does.
    const after = await prisma.booking.findUnique({ where: { id: bookingId }, select: { cancellationFeeChargeId: true } });
    if (lateFee && after?.cancellationFeeChargeId !== lateFee.id) {
      try {
        const refund = await refundOnConnectedAccount({ paymentIntentId: lateFee.id, connectedAccountId: booking.course.stripeAccountId as string });
        await recordMove({ courseId: booking.courseId, what: hold ? 'hold' : 'late_fee', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, stripeId: refund.id, bookingId, actor: 'system', note: 'the booking changed while the fee was charged' });
        await recordPaymentEvent({ bookingId, kind: 'refund', amountCents: refund.amount, stripeId: refund.id, actor: 'system', detail: 'Late fee refunded — the booking was cancelled or checked in from another screen while it was being charged' }).catch(() => {});
      } catch (err) {
        await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents: Math.round(booking.cancellationFeeTotal), stripeId: lateFee.id, actor: 'system', detail: `Late fee charged on a booking that changed meanwhile — refund it in Stripe: ${err instanceof Error ? err.message : String(err)}` }).catch(() => {});
      }
    }
    // A waived cancel that already gave a taken hold back, beaten by another
    // cancel (which read the hold as kept): the cancelled booking must say refunded.
    // Never touches a booking a check-in won — that one is paid.
    if (feeWaivedRefunded && booking.cancellationFeeChargeId) {
      await prisma.booking.updateMany({ where: { id: bookingId, status: 'cancelled', cancellationFeeChargeId: booking.cancellationFeeChargeId }, data: { paymentStatus: 'refunded', cancellationFeeApplies: false } });
    }
    return { error: 'This booking was just cancelled or checked in from another screen — refresh to see it.', status: 409 } as const;
  }

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
    // A kept no-show charge is a fee kept — never "you weren't charged anything".
    feeCharged: feeAlreadyCharged || !!noShowCharge,
    feeAmount: feeAlreadyCharged ? booking.cancellationFeeTotal : (noShowCharge?.amountCents ?? 0),
    refunded: roundRefunded || feeWaivedRefunded,
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
  // A kept no-show charge keeps the booking fee charged with it (chargeNoShow).
  if (noShowCharge && !waiveFee) await chargeAccessFeeSeparately(bookingId, { why: 'no_show', actor: 'system' });
  else if (feeAlreadyCharged && !waiveFee) await chargeAccessFeeSeparately(bookingId, { why: 'late_cancel', actor: 'system' });
  else await refundSeparateAccessFee(bookingId, 'booking cancelled', 'system');

  // FEE-AT-BOOKING (Cam 2026-10-24): the fee taken when they booked is refunded
  // on a cancel before the cutoff, or whenever the course calls it off or waives
  // its fee; a late cancel or a no-show keeps it.
  let bookingFeeRefundFailed = '';
  if (booking.feePaidCents > 0) {
    const keep = !waiveFee && !opts.courseCalledOff && (isLate || !!noShowCharge);
    const r = keep ? null : await refundBookingFee(bookingId, 'all', opts.courseCalledOff ? `course called it off (${opts.courseCalledOff})` : waiveFee ? 'cancelled, fee waived' : 'cancelled before the cutoff');
    if (r && !r.ok) bookingFeeRefundFailed = `GreenReserve's booking fee could not be refunded (${r.error}) — GreenReserve will follow up.`;
  }

  // PRICE-3: a round pack's rounds come back by the same rule as the booking fee — before the
  // cutoff, or when the course calls it off or waives; a late cancel or a no-show uses them.
  if (!(!waiveFee && !opts.courseCalledOff && (isLate || !!noShowCharge))) await releaseBookingRounds(bookingId);

  // A kept no-show charge reads as a fee kept on every screen, as in the email.
  // noShowFeeKeptCents: the screens name WHICH fee was kept (a no-show charge is not a late fee).
  return { success: true, feeCharged: feeAlreadyCharged || !!noShowCharge, noShowFeeKeptCents: noShowCharge?.amountCents ?? 0, roundRefunded, feeRefundFailed: feeRefundFailed || bookingFeeRefundFailed, lateFeeChargeFailed } as const;
}

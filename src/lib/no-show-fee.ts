// SP-B (STAFF_POLICY_SPEC Part B4). One way to mark a no-show, used by the
// counter ("Mark no-show") and by the hourly cron's automatic no-show, so both
// charge exactly the same things:
//
//   - the mark itself (noShowAt + a no_show_marked event, in one transaction);
//   - GreenReserve's booking fee, charged on its own (FB-3);
//   - the COURSE's no-show charge — Booking.noShowFeeTotal, copied from the
//     policy at booking (a separate no-show fee, or the late fee under "cancel
//     late or don't show") — charged on the course's connected account.
//
// "Still coming" undoes it: refundNoShowFee() returns the course's charge, and
// the caller refunds the booking fee as before. Charges are best effort and
// never undo the mark; failures are recorded on the PaymentEvent ledger.
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe, chargeOnConnectedAccount } from './stripe';
import { recordPaymentEvent } from './refund-booking';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';
import { chargeAccessFeeSeparately, type FeeChargeResult } from './access-fee';

export type NoShowResult = {
  /** GreenReserve's booking fee. */
  fee: FeeChargeResult;
  /** The course's no-show charge: charged, nothing to charge, or why it failed. */
  courseFee: { charged: true; amountCents: number } | { charged: false; reason: string };
};

/** The live (charged, not refunded) course no-show charge, from the ledger. */
async function liveNoShowCharge(bookingId: string): Promise<{ stripeId: string; amountCents: number } | null> {
  const events = await prisma.paymentEvent.findMany({ where: { bookingId, kind: { in: ['no_show_fee', 'no_show_fee_refunded'] } }, orderBy: { createdAt: 'desc' } });
  const last = events[0];
  return last && last.kind === 'no_show_fee' ? { stripeId: last.stripeId, amountCents: last.amountCents } : null;
}

export async function markNoShow(bookingId: string, actor: EventActor, opts: { actorName?: string; auto?: boolean } = {}): Promise<NoShowResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, courseId: true, players: true, noShowFeeTotal: true, stripeCustomerId: true, stripePaymentMethodId: true,
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, timezone: true, stripeAccountId: true, stripeAccountActive: true } },
    },
  });
  if (!booking) throw new Error('Booking not found');
  const teeTimeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { noShowAt: new Date() } });
    await recordBookingEvent(tx, { bookingId, courseId: booking.courseId, actor, teeTimeAt, type: 'no_show_marked', playerCount: booking.players, ...(opts.auto ? { metadata: { auto: true } } : {}) });
  });

  const fee = await chargeAccessFeeSeparately(bookingId, { why: 'no_show', actor: opts.auto ? 'system' : 'operator', actorName: opts.actorName });

  let courseFee: NoShowResult['courseFee'] = { charged: false, reason: 'no no-show fee on this booking' };
  const amountCents = Math.round(booking.noShowFeeTotal);
  if (amountCents > 0 && !(await liveNoShowCharge(bookingId))) {
    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) courseFee = { charged: false, reason: 'no card on file' };
    else if (!booking.course.stripeAccountId || !booking.course.stripeAccountActive) courseFee = { charged: false, reason: 'the course’s Stripe account is not connected' };
    else {
      // A new charge is only possible after a refund ("still coming", then a
      // second no-show), so refunds number the attempts and Stripe can't replay
      // the refunded PaymentIntent.
      const attempt = await prisma.paymentEvent.count({ where: { bookingId, kind: 'no_show_fee_refunded' } });
      try {
        const pi = await chargeOnConnectedAccount({
          customerId: booking.stripeCustomerId,
          paymentMethodId: booking.stripePaymentMethodId,
          connectedAccountId: booking.course.stripeAccountId,
          amountCents,
          applicationFeeCents: 0,
          description: `No-show fee - ${booking.course.name} - booking ${booking.id}`,
          idempotencyKey: `noshowfee-${booking.id}-${attempt}-${booking.stripePaymentMethodId}`,
        });
        await recordPaymentEvent({ bookingId, kind: 'no_show_fee', amountCents, stripeId: pi.id, actor: opts.auto ? 'cron' : 'operator', actorName: opts.actorName, detail: opts.auto ? 'No-show fee (automatic — not checked in)' : 'No-show fee' });
        await recordBookingEventSafe({ bookingId, courseId: booking.courseId, type: 'fee_charged', actor, amountCents, playerCount: booking.players, teeTimeAt, stripeId: pi.id, metadata: { reason: 'no_show_fee' } });
        courseFee = { charged: true, amountCents };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, actor: opts.auto ? 'cron' : 'operator', actorName: opts.actorName, detail: `No-show fee: ${reason}` }).catch(() => {});
        courseFee = { charged: false, reason };
      }
    }
  }
  return { fee, courseFee };
}

/** "Still coming": refund the course's no-show charge, if one is live. Never throws. */
export async function refundNoShowFee(bookingId: string, actorName?: string): Promise<{ ok: boolean; refunded: boolean; error?: string }> {
  const live = await liveNoShowCharge(bookingId);
  if (!live) return { ok: true, refunded: false };
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { courseId: true, players: true, course: { select: { stripeAccountId: true } } } });
  if (!b?.course.stripeAccountId) return { ok: false, refunded: false, error: 'the course’s Stripe account is not connected' };
  try {
    const r = await stripe.refunds.create({ payment_intent: live.stripeId, metadata: { bookingId, kind: 'no_show_fee' } }, { stripeAccount: b.course.stripeAccountId, idempotencyKey: `noshowfee-refund-${bookingId}-${live.stripeId}` });
    await recordPaymentEvent({ bookingId, kind: 'no_show_fee_refunded', amountCents: live.amountCents, stripeId: r.id, actor: 'operator', actorName, detail: 'No-show fee refunded (still coming)' });
    await recordBookingEventSafe({ bookingId, courseId: b.courseId, type: 'fee_refunded', actor: { type: 'staff', id: actorName ?? null }, amountCents: live.amountCents, playerCount: b.players, teeTimeAt: null, stripeId: r.id, metadata: { reason: 'no_show_fee_refunded' } });
    return { ok: true, refunded: true };
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents: live.amountCents, stripeId: live.stripeId, actor: 'operator', actorName, detail: `No-show fee refund failed: ${msg}` }).catch(() => {});
    return { ok: false, refunded: false, error: msg };
  }
}

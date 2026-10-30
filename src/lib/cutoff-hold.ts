// The cancellation-window hold (SP-B timing "hold_at_cutoff"): charged to the
// saved card the moment a booking's cutoff passes — by the hourly cron, with
// the daily cancellation-cutoff cron as the safety net. ONE function for both.
//
// Review follow-up (2026-10-26): the crons used to charge from the list they read at the
// start of the run, so a booking cancelled (free, waived, or called off by the
// course) while the run was going could still be charged. Now:
//   1. the booking is read again right before the charge, and must still be
//      confirmed with a card on file;
//   2. the charge is recorded only by a conditional update — still confirmed,
//      still card_on_file;
//   3. if that update finds the booking changed and nobody else recorded this
//      same PaymentIntent (a late cancel and both crons share its idempotency
//      key), the charge is refunded in full.
import { prisma } from './prisma';
import { chargeOnConnectedAccount, refundOnConnectedAccount } from './stripe';
import { recordBookingEventSafe } from './booking-events';
import { recordPaymentEvent } from './refund-booking';
import { recordMove } from './money-ledger';
import { sendCancellationFeeChargedEmail } from './email';
import { teeToUtcMs } from './tee-time-utils';
import { holdsAtCutoff, bookingWindowHours } from './cancel-policy';

/** A cutoff missed by more than this after the tee time (a cron outage, a course connecting Stripe late) is not charged as a hold. */
export const HOLD_STALE_MS = 24 * 3600_000;

export type HoldResult =
  | 'charged'          // charged and recorded here
  | 'not_due'          // not a hold booking, nothing to hold, or cutoff not passed yet
  | 'changed'          // no longer confirmed with a card on file — nothing charged
  | 'no_card'
  | 'no_stripe'
  | 'recorded_elsewhere' // the same PaymentIntent was recorded by a cancel or the other cron
  | 'refunded'         // the booking changed during the charge — the charge was given back
  | 'refund_failed'
  | 'declined';        // R-PAY-010: the charge failed — ledgered once (charge_failed)

export async function chargeCutoffHold(bookingId: string, now: Date = new Date()): Promise<HoldResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, cancellationHours: true, timezone: true, stripeAccountId: true, stripeAccountActive: true } },
    },
  });
  if (!booking || booking.status !== 'confirmed' || booking.paymentStatus !== 'card_on_file') return 'changed';
  if (booking.cancellationFeeTotal <= 0 || !holdsAtCutoff(booking)) return 'not_due';
  const teeMs = teeToUtcMs(booking.teeTime.date, booking.teeTime.time, booking.course.timezone || 'America/New_York');
  const cutoffMs = teeMs - bookingWindowHours(booking, booking.course) * 3600_000;
  if (!Number.isFinite(teeMs) || cutoffMs > now.getTime() || now.getTime() - teeMs > HOLD_STALE_MS) return 'not_due';
  if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) return 'no_card';
  if (!booking.course.stripeAccountActive || !booking.course.stripeAccountId) return 'no_stripe';

  const amountCents = Math.round(booking.cancellationFeeTotal);
  const account = booking.course.stripeAccountId;
  console.log(JSON.stringify({ ev: 'cron.cancelfee.attempt', bookingId, amountCents }));
  let pi: Awaited<ReturnType<typeof chargeOnConnectedAccount>>;
  try {
    pi = await chargeOnConnectedAccount({
      customerId: booking.stripeCustomerId,
      paymentMethodId: booking.stripePaymentMethodId,
      connectedAccountId: account,
      amountCents,
      applicationFeeCents: 0,
      description: `Late-cancellation fee - ${booking.course.name} - booking ${booking.id}`,
      idempotencyKey: `cancelfee-${booking.id}-${booking.stripePaymentMethodId}`,
    });
  } catch (err) {
    // R-PAY-010: a declined hold used to leave nothing behind. It is ledgered once
    // (Stripe replays the same error for this key on every later run), so it shows
    // on the golfer's payment timeline. Not written to checkInFailReason: on the
    // tee sheet that offers "Retry with new card", which checks the group in and
    // charges the whole round — a day early. Surfacing it in admin Problems is
    // the admin side's (money-problems.ts).
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ ev: 'cron.cancelfee.fail', bookingId, error: message }));
    // Both crons run at 09:00: the other one charging this same key right now is
    // not a decline — it records the hold itself.
    if (/in[- ]progress/i.test(message)) return 'not_due';
    const seen = await prisma.paymentEvent.count({ where: { bookingId, kind: 'charge_failed', detail: { startsWith: 'Cancellation hold' } } });
    if (!seen) await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, actor: 'cron', detail: `Cancellation hold: ${message}` }).catch(() => {});
    return 'declined';
  }

  // LEDGER-1: the hold moved money the moment Stripe took it, whatever the booking did meanwhile.
  await recordMove({ courseId: booking.courseId, what: 'hold', direction: 'in', method: 'card', account: 'course', amountCents: pi.amount, stripeId: pi.id, bookingId, actor: 'cron' });

  // EV-1: the money has moved, so this is ONE plain conditional update (no
  // transaction that could time out after the charge); the event is best-effort.
  const recorded = await prisma.booking.updateMany({
    where: { id: bookingId, status: 'confirmed', paymentStatus: 'card_on_file' },
    data: { paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: pi.id, cancellationFeeChargedAt: new Date() },
  });
  if (!recorded.count) {
    const after = await prisma.booking.findUnique({ where: { id: bookingId }, select: { cancellationFeeChargeId: true, status: true, paymentStatus: true } });
    if (after?.cancellationFeeChargeId === pi.id) return 'recorded_elsewhere';
    try {
      const refund = await refundOnConnectedAccount({ paymentIntentId: pi.id, connectedAccountId: account });
      await recordMove({ courseId: booking.courseId, what: 'hold', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, stripeId: refund.id, bookingId, actor: 'cron', note: 'the booking changed while the hold was charged' });
      await recordPaymentEvent({ bookingId, kind: 'refund', amountCents: refund.amount, stripeId: refund.id, actor: 'cron', detail: `Cutoff hold refunded — the booking changed while it was being charged (now ${after?.status ?? 'missing'} / ${after?.paymentStatus ?? '-'})` }).catch(() => {});
      console.log(JSON.stringify({ ev: 'cron.cancelfee.refunded_race', bookingId, paymentIntentId: pi.id }));
      return 'refunded';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents, stripeId: pi.id, actor: 'cron', detail: `Cutoff hold charged on a booking that changed meanwhile — refund it in Stripe: ${msg}` }).catch(() => {});
      console.error(JSON.stringify({ ev: 'cron.cancelfee.refund_race_fail', bookingId, paymentIntentId: pi.id, error: msg }));
      return 'refund_failed';
    }
  }
  console.log(JSON.stringify({ ev: 'cron.cancelfee.ok', bookingId, paymentIntentId: pi.id }));
  await recordBookingEventSafe({
    bookingId, courseId: booking.courseId, type: 'fee_charged', actor: { type: 'cron' },
    amountCents, playerCount: booking.players, teeTimeAt: new Date(teeMs), stripeId: pi.id, metadata: { reason: 'cutoff_hold' },
  });
  await sendCancellationFeeChargedEmail({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    feeAmount: booking.cancellationFeeTotal,
    bookingId: booking.id,
    checkInToken: booking.checkInToken,
  }).catch(console.error);
  return 'charged';
}

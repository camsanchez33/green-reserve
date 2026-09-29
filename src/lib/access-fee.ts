// @brain separate-booking-fee
// FB-3 (Cam 2026-09-29, FB3_FEE_PLAN_SPEC.md option B). GreenReserve's
// $1.50/player normally rides inside the ONE check-in charge, as the
// application fee on the course's connected account. When no such charge is
// ever made — staff mark the round "paid offline" (paid at the counter) or a
// no-show — the fee used to be lost. Here it is charged on its own:
//
//   - on the PLATFORM account (GreenReserve is merchant of record for its own
//     fee and pays Stripe's cost on it — Cam: courses never pay a fee on money
//     they do not keep);
//   - off-session, to the card the golfer saved at booking (the SetupIntent
//     Customer and PaymentMethod already live on the platform — no clone);
//   - once per booking: Booking.stripePaymentIntentId holds it, and the
//     idempotency key carries an attempt counter so a refunded fee can be
//     charged again on a later no-show without Stripe replaying the old one.
//
// Refunded when the separate charge turns out to be a double: a no-show marked
// in error ("still coming"), or the group checks in and pays by card after all
// (the check-in charge already contains the fee).

import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { recordPaymentEvent } from './refund-booking';

export type FeeChargeResult =
  | { ok: true; charged: true; amountCents: number; paymentIntentId: string }
  | { ok: true; charged: false; reason: string }
  | { ok: false; error: string };

/**
 * Charge the booking's GreenReserve fee on its own. `players` prorates a
 * partial party (same rule as check-in). Never throws.
 */
export async function chargeAccessFeeSeparately(bookingId: string, opts: {
  why: 'paid_offline' | 'no_show';
  players?: number;
  actor: 'operator' | 'admin';
  actorName?: string;
}): Promise<FeeChargeResult> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, players: true, accessFeeTotal: true, stripePaymentIntentId: true,
      stripeCustomerId: true, stripePaymentMethodId: true, courseId: true,
    },
  });
  if (!b) return { ok: false, error: 'Booking not found' };
  // Counter bookings entered by staff carry no fee (accessFeeTotal 0).
  if (b.accessFeeTotal <= 0) return { ok: true, charged: false, reason: 'no GreenReserve fee on this booking' };
  if (b.stripePaymentIntentId) return { ok: true, charged: false, reason: 'fee already charged' };
  if (!b.stripeCustomerId || !b.stripePaymentMethodId) return { ok: true, charged: false, reason: 'no card on file' };

  const n = opts.players && opts.players > 0 && opts.players < b.players ? opts.players : b.players;
  const amountCents = Math.round(b.accessFeeTotal * n / b.players);
  if (amountCents < 50) return { ok: true, charged: false, reason: 'below Stripe minimum' };

  const attempt = await prisma.paymentEvent.count({ where: { bookingId, kind: 'fee_charged' } });
  try {
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: b.stripeCustomerId,
      payment_method: b.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `GreenReserve booking fee — ${n} player${n === 1 ? '' : 's'} (${opts.why === 'no_show' ? 'no-show' : 'paid at the course'})`,
      statement_descriptor_suffix: 'BOOKING FEE',
      metadata: { bookingId, courseId: b.courseId, kind: 'access_fee', why: opts.why },
    }, { idempotencyKey: `accessfee-${bookingId}-${attempt}` });
    if (pi.status !== 'succeeded') {
      await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, stripeId: pi.id, actor: opts.actor, actorName: opts.actorName, detail: `GreenReserve fee: payment ${pi.status}` });
      return { ok: false, error: `The booking fee charge is ${pi.status}.` };
    }
    await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentIntentId: pi.id } });
    await recordPaymentEvent({ bookingId, kind: 'fee_charged', amountCents, stripeId: pi.id, actor: opts.actor, actorName: opts.actorName, detail: `GreenReserve fee charged separately (${opts.why === 'no_show' ? 'no-show' : 'paid at the course'})` });
    return { ok: true, charged: true, amountCents, paymentIntentId: pi.id };
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? (err.message || 'Card declined') : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, actor: opts.actor, actorName: opts.actorName, detail: `GreenReserve fee: ${msg}` }).catch(() => {});
    return { ok: false, error: msg };
  }
}

/** Refund a separately-charged fee (and clear it so a later one can be taken). Never throws. */
export async function refundSeparateAccessFee(bookingId: string, reason: string, actor: 'operator' | 'admin' | 'system', actorName?: string): Promise<{ ok: boolean; error?: string }> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { stripePaymentIntentId: true } });
  const pi = b?.stripePaymentIntentId;
  if (!pi) return { ok: true };
  try {
    const r = await stripe.refunds.create({ payment_intent: pi, metadata: { bookingId, kind: 'access_fee' } }, { idempotencyKey: `accessfee-refund-${bookingId}-${pi}` });
    await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentIntentId: '' } });
    await recordPaymentEvent({ bookingId, kind: 'fee_refunded', amountCents: r.amount, stripeId: r.id, actor, actorName, detail: `GreenReserve fee refunded: ${reason}` });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents: 0, stripeId: pi, actor, actorName, detail: `GreenReserve fee refund failed (${reason}): ${msg}` }).catch(() => {});
    return { ok: false, error: msg };
  }
}

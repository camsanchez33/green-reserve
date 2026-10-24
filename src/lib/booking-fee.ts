// FEE-AT-BOOKING (Cam 2026-10-24: "Yes"). GreenReserve's $1.50/player is
// charged when the golfer books online, on the PLATFORM account (GreenReserve
// is merchant of record for its own fee, as for the separate fee in
// lib/access-fee.ts), to the card the golfer saved at booking. Then:
//
//   - the round's own charge (check-in, pay link) takes only what's still owed
//     of the fee — feeCoveredCents comes off roundChargeCents and
//     roundApplicationFeeCents in lib/shop.ts, so every charge, refund and
//     screen that reads those helpers follows;
//   - a cancellation refunds it before the course's cutoff, or whenever the
//     course calls it off (weather, closure, waived); a late cancel or a
//     no-show keeps it (Cam's answers 2026-10-24);
//   - taking players off the party before the cutoff refunds their part;
//     adding players adds theirs to what the round's charge collects.
//
// Kept on its own column pair (feePaidCents, feePaymentIntentId) — NOT
// Booking.stripePaymentIntentId — so the separate-fee code (no-show, late
// cancel, "still coming", cash at the counter) never mistakes it for its own
// charge and refunds it. Off while FEE_AT_BOOKING_ON is false.
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { recordPaymentEvent } from './refund-booking';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant } from './booking-events';

export { feeCoveredCents } from './booking-fees';

async function logEvent(bookingId: string, type: 'fee_charged' | 'fee_refunded', amountCents: number, stripeId: string, reason: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { courseId: true, players: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true } } } }).catch(() => null);
  if (!b) return;
  await recordBookingEventSafe({
    bookingId, courseId: b.courseId, type, actor: { type: 'system', id: null }, amountCents, playerCount: b.players,
    teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time), stripeId, metadata: { reason },
  });
}

/**
 * Charge the fee for a booking just made, with the card it saved. Once per
 * booking (idempotency key = the booking). Never throws: a decline comes back
 * as { ok: false } and the caller releases the tee time.
 */
export async function chargeBookingFee(bookingId: string): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { accessFeeTotal: true, players: true, courseId: true, stripeCustomerId: true, stripePaymentMethodId: true, feePaidCents: true, feePaymentIntentId: true } });
  if (!b) return { ok: false, error: 'Booking not found.' };
  if (b.feePaymentIntentId) return { ok: true, amountCents: b.feePaidCents };
  const amountCents = Math.round(b.accessFeeTotal);
  if (amountCents <= 0) return { ok: true, amountCents: 0 };
  if (!b.stripeCustomerId || !b.stripePaymentMethodId) return { ok: false, error: 'Add a card to book this tee time.' };
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: amountCents, currency: 'usd', customer: b.stripeCustomerId, payment_method: b.stripePaymentMethodId,
      off_session: true, confirm: true,
      description: `GreenReserve booking fee — ${b.players} player${b.players === 1 ? '' : 's'}`,
      statement_descriptor_suffix: 'BOOKING FEE',
      metadata: { bookingId, courseId: b.courseId, kind: 'access_fee', why: 'booking' },
    }, { idempotencyKey: `bookingfee-${bookingId}` });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? (err.message || 'Your card was declined.') : 'Card payments are not working right now.';
    await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, actor: 'system', detail: `GreenReserve booking fee: ${msg}` }).catch(() => {});
    return { ok: false, error: msg };
  }
  if (pi.status !== 'succeeded') {
    await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, stripeId: pi.id, actor: 'system', detail: `GreenReserve booking fee: payment ${pi.status}` }).catch(() => {});
    // Never leave a half-made charge hanging on a booking we are about to release.
    await stripe.paymentIntents.cancel(pi.id).catch(() => {});
    return { ok: false, error: 'Your card needs a step we can’t do here — try another card.' };
  }
  await prisma.booking.update({ where: { id: bookingId }, data: { feePaidCents: amountCents, feePaymentIntentId: pi.id } });
  await recordPaymentEvent({ bookingId, kind: 'fee_charged', amountCents, stripeId: pi.id, actor: 'system', detail: 'GreenReserve booking fee charged at booking' });
  await logEvent(bookingId, 'fee_charged', amountCents, pi.id, 'booking_fee_at_booking');
  return { ok: true, amountCents };
}

/**
 * Give back part or all of the booking-time fee (`amountCents` = 'all' or a
 * number, capped at what is left). Keyed by the booking and how much has been
 * refunded before, so a retry can't refund twice. Never throws.
 */
export async function refundBookingFee(bookingId: string, amount: number | 'all', reason: string, actor: 'operator' | 'admin' | 'system' | 'golfer' = 'system', actorName?: string, retried = false): Promise<{ ok: boolean; refundedCents: number; error?: string }> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { feePaidCents: true, feePaymentIntentId: true } });
  if (!b || !b.feePaymentIntentId || b.feePaidCents <= 0) return { ok: true, refundedCents: 0 };
  const cents = amount === 'all' ? b.feePaidCents : Math.min(Math.round(amount), b.feePaidCents);
  if (cents <= 0) return { ok: true, refundedCents: 0 };
  // Take it off the booking first, conditionally — two refunds at once can't both take the same cents.
  const held = await prisma.booking.updateMany({ where: { id: bookingId, feePaidCents: b.feePaidCents }, data: { feePaidCents: { decrement: cents } } });
  // Another refund (a party change) moved it at the same moment: read it again and try once more.
  if (!held.count) return retried ? { ok: false, refundedCents: 0, error: 'The booking fee changed at the same moment — try again.' } : refundBookingFee(bookingId, amount, reason, actor, actorName, true);
  let r: Stripe.Refund;
  try {
    r = await stripe.refunds.create(
      { payment_intent: b.feePaymentIntentId, amount: cents, metadata: { bookingId, kind: 'access_fee', why: 'booking_fee_refund' } },
      { idempotencyKey: `bookingfee-refund-${bookingId}-${b.feePaidCents}-${cents}` },
    );
  } catch (err) {
    // Not refunded: put the cents back so a later try (or the ledger) sees them as still paid.
    await prisma.booking.update({ where: { id: bookingId }, data: { feePaidCents: { increment: cents } } }).catch(() => {});
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents: cents, stripeId: b.feePaymentIntentId, actor: actor === 'golfer' ? 'golfer' : actor, actorName, detail: `GreenReserve booking fee refund failed (${reason}): ${msg}` }).catch(() => {});
    return { ok: false, refundedCents: 0, error: msg };
  }
  const seen = await prisma.paymentEvent.findFirst({ where: { stripeId: r.id }, select: { id: true } });
  if (!seen) await recordPaymentEvent({ bookingId, kind: 'fee_refunded', amountCents: r.amount, stripeId: r.id, actor: actor === 'golfer' ? 'golfer' : actor, actorName, detail: `GreenReserve booking fee refunded: ${reason}` });
  await logEvent(bookingId, 'fee_refunded', r.amount, r.id, `booking_fee_refunded: ${reason}`);
  return { ok: true, refundedCents: r.amount };
}

/**
 * The booking fee was declined right after the tee time was claimed: give the
 * spots back and close the booking (nothing was charged). The golfer sees the
 * card's error and books again with another card.
 */
export async function releaseUnpaidBooking(bookingId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true, players: true, teeTimeId: true, courseId: true, teeTime: { select: { date: true, time: true, status: true, course: { select: { timezone: true } } } } } });
    if (!b || b.status !== 'confirmed') return;
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled', cancelledAt: new Date() } });
    await tx.teeTime.update({ where: { id: b.teeTimeId }, data: { playersBooked: { decrement: b.players }, ...(b.teeTime.status === 'full' ? { status: 'available' } : {}) } });
    await recordBookingEvent(tx, { bookingId, courseId: b.courseId, type: 'booking_cancelled', actor: { type: 'system', id: null }, amountCents: 0, playerCount: b.players,
      teeTimeAt: teeTimeInstant(b.teeTime.course.timezone, b.teeTime.date, b.teeTime.time), metadata: { reason: 'booking_fee_declined' } });
  });
}

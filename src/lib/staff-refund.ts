// Revamp 3 dead end 14 (Cam 2026-10-29): course staff refund a round, fully or in
// part, and waive a late fee after the booking was cancelled.
//
//  • Who: the "Refund rounds" permission (money.refund_rounds), off by default and
//    granted per person; owners always. The route checks it.
//  • How much (Cam: "Up to the course's share"): the round's card charge less
//    GreenReserve's part of it (the booking fee and shop fee — roundApplicationFeeCents),
//    less what was already refunded. GreenReserve's fee is never reversed here
//    (refund_application_fee: false); it follows its own rules (refunded when the
//    course calls the round off). A refund that reaches the course's whole share
//    marks the round refunded.
//  • A reason is required; the golfer is emailed it. Every refund is a PaymentEvent
//    and a BookingEvent (the course's Timeline).
//  • A waived late fee refunds the course's late-fee charge in full (that charge is
//    the course's alone; GreenReserve's booking fee is a separate charge and is kept,
//    as on any late cancel).
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { sendRefundEmail } from './email';
import { roundChargedTotal, roundApplicationFeeCents } from './shop';
import { recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';

export type StaffRefundResult =
  | { ok: true; refundId: string; amountCents: number; full: boolean; emailSent: boolean }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): StaffRefundResult => ({ ok: false, status, error });

/** What staff may still refund on a paid round: the course's share of its charge, less refunds already made. */
export function refundableCents(b: Parameters<typeof roundChargedTotal>[0] & Parameters<typeof roundApplicationFeeCents>[0], alreadyRefundedCents: number): number {
  return Math.max(0, roundChargedTotal(b) - roundApplicationFeeCents(b) - alreadyRefundedCents);
}

const bookingFor = (courseId: string, bookingId: string) => prisma.booking.findFirst({
  where: { id: bookingId, courseId },
  include: {
    teeTime: { select: { date: true, time: true } },
    course: { select: { name: true, stripeAccountId: true, timezone: true } },
    paymentEvents: { where: { kind: 'refund' }, select: { amountCents: true } },
  },
});

async function email(b: NonNullable<Awaited<ReturnType<typeof bookingFor>>>, amountCents: number, full: boolean, reason: string) {
  try {
    await sendRefundEmail({ golferName: b.golferName, golferEmail: b.golferEmail, courseName: b.course.name, date: b.teeTime.date, time: b.teeTime.time, amountCents, full, reason, bookingId: b.id });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'staff_refund.email.fail', bookingId: b.id, error: err instanceof Error ? err.message : String(err) }));
    return false;
  }
}

/** Refund part or all of the course's share of a round paid by card. */
export async function refundRound(courseId: string, bookingId: string, opts: { amountCents?: unknown; reason: unknown; actorName: string; actor: EventActor }): Promise<StaffRefundResult> {
  const b = await bookingFor(courseId, bookingId);
  if (!b) return fail(404, 'Booking not found.');
  if (b.paymentStatus !== 'paid' || !b.roundPaymentIntentId) {
    return fail(409, b.paymentStatus === 'paid_offline' ? 'This round was paid at the counter — give the cash back at the register.' : 'This round hasn’t been paid by card, so there is nothing to refund.');
  }
  if (!b.course.stripeAccountId) return fail(409, 'Connect Stripe first — the refund goes back through it.');
  const already = b.paymentEvents.reduce((s, e) => s + e.amountCents, 0);
  const left = refundableCents(b, already);
  if (left <= 0) return fail(409, 'This round has already been refunded in full.');
  const amountCents = opts.amountCents === undefined || opts.amountCents === null || opts.amountCents === '' ? left : Number(opts.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail(400, 'Enter an amount above $0.');
  if (amountCents > left) return fail(400, `Up to $${(left / 100).toFixed(2)} can be refunded on this round.`);
  const reason = String(opts.reason ?? '').trim().slice(0, 300);
  if (!reason) return fail(400, 'Add a reason — the golfer sees it.');

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      { payment_intent: b.roundPaymentIntentId, amount: amountCents, refund_application_fee: false, metadata: { bookingId, reason: reason.slice(0, 480), by: `operator:${opts.actorName}` } },
      // Keyed on what was refunded before, not the amount: two refunds started at once from the same
      // state share a key, so Stripe refunds once (a different amount gets its "same key, different
      // request" refusal) — never two that together pass the course's share.
      { stripeAccount: b.course.stripeAccountId, idempotencyKey: `staff-refund-${bookingId}-${already}` },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.paymentEvent.create({ data: { bookingId, kind: 'refund_failed', amountCents, actor: 'operator', actorName: opts.actorName, detail: `${reason} — Stripe: ${message}` } }).catch(() => {});
    return fail(502, `Stripe refused the refund: ${message}`);
  }
  const full = amountCents >= left;
  // Two taps at once send the same idempotency key, so Stripe returns one refund twice: record it once.
  if (await prisma.paymentEvent.findFirst({ where: { bookingId, kind: 'refund', stripeId: refund.id }, select: { id: true } })) {
    return { ok: true, refundId: refund.id, amountCents, full, emailSent: false };
  }
  await prisma.$transaction([
    prisma.paymentEvent.create({ data: { bookingId, kind: 'refund', amountCents, stripeId: refund.id, actor: 'operator', actorName: opts.actorName, detail: reason } }),
    // The course's whole share back: the round is refunded (Money stops counting it as paid or owed).
    ...(full ? [prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'refunded' } })] : []),
  ]);
  await recordBookingEventSafe({
    bookingId, courseId, type: 'round_refunded', actor: opts.actor, amountCents, playerCount: b.players, stripeId: refund.id,
    teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time), metadata: { reason, full, by: opts.actorName },
  });
  console.log(JSON.stringify({ ev: 'staff_refund.ok', bookingId, refundId: refund.id, amountCents, full }));
  return { ok: true, refundId: refund.id, amountCents, full, emailSent: await email(b, amountCents, full, reason) };
}

/** Give back a late fee kept on a cancelled booking. */
export async function waiveLateFee(courseId: string, bookingId: string, opts: { reason: unknown; actorName: string; actor: EventActor }): Promise<StaffRefundResult> {
  const b = await bookingFor(courseId, bookingId);
  if (!b) return fail(404, 'Booking not found.');
  if (b.status !== 'cancelled' || b.paymentStatus !== 'cancellation_fee_charged' || !b.cancellationFeeChargeId) return fail(409, 'This booking has no late fee kept to give back.');
  if (!b.course.stripeAccountId) return fail(409, 'Connect Stripe first — the refund goes back through it.');
  const reason = String(opts.reason ?? '').trim().slice(0, 300);
  if (!reason) return fail(400, 'Add a reason — the golfer sees it.');
  // Claim it first, so two taps refund once.
  // cancellationFeeApplies off too, as a waive at cancel time does (Analytics reads it).
  const claimed = await prisma.booking.updateMany({ where: { id: bookingId, paymentStatus: 'cancellation_fee_charged' }, data: { paymentStatus: 'refunded', cancellationFeeApplies: false } });
  if (!claimed.count) return fail(409, 'That fee was just given back.');
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      { payment_intent: b.cancellationFeeChargeId, metadata: { bookingId, reason: reason.slice(0, 480), by: `operator:${opts.actorName}`, kind: 'late_fee_waived' } },
      { stripeAccount: b.course.stripeAccountId, idempotencyKey: `staff-waive-${bookingId}` },
    );
  } catch (err) {
    await prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'cancellation_fee_charged', cancellationFeeApplies: b.cancellationFeeApplies } });
    return fail(502, `Stripe refused the refund: ${err instanceof Error ? err.message : String(err)}`);
  }
  await recordBookingEventSafe({
    bookingId, courseId, type: 'fee_refunded', actor: opts.actor, amountCents: refund.amount, playerCount: b.players, stripeId: refund.id,
    teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time), metadata: { reason: 'late_fee_waived_after', note: reason, by: opts.actorName },
  });
  return { ok: true, refundId: refund.id, amountCents: refund.amount, full: true, emailSent: await email(b, refund.amount, true, reason) };
}

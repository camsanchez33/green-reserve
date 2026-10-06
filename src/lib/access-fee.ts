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
//   - at most once at a time: Booking.stripePaymentIntentId holds the live fee
//     charge, and it only counts as ours when the PaymentEvent ledger recorded
//     charging it (review: a legacy value in that column must never read as a
//     fee we took, or be "refunded" on the platform account).
//
// Refunded when the separate charge turns out to be a double or wrong: a
// no-show marked in error ("still coming"), a card check-in after all (that
// charge already carries the fee), a cancellation, or a smaller party paying
// at the counter (re-charged at the prorated amount).

import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { recordPaymentEvent } from './refund-booking';
import { recordBookingEventSafe, teeTimeInstant } from './booking-events';

// EV-1: the separate fee's charge / refund in the analytics log. Stripe has
// already confirmed by the time this runs, so it never fails the caller.
async function logFeeEvent(bookingId: string, type: 'fee_charged' | 'fee_refunded', amountCents: number, stripeId: string, actor: 'operator' | 'admin' | 'system', actorName: string | undefined, reason: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { courseId: true, players: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true } } } }).catch(() => null);
  if (!b) return;
  await recordBookingEventSafe({
    bookingId, courseId: b.courseId, type,
    actor: { type: actor === 'operator' ? 'staff' : actor, id: actorName ?? null },
    amountCents, playerCount: b.players,
    teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time),
    stripeId, metadata: { reason },
  });
}

const WHY_LABEL = { no_show: 'no-show', paid_offline: 'paid at the course', late_cancel: 'late cancellation' } as const;

export type FeeChargeResult =
  | { ok: true; charged: true; amountCents: number; paymentIntentId: string }
  | { ok: true; charged: false; reason: string }
  | { ok: false; error: string };

/** The booking's live separate fee charge, if the ledger says we made it. */
export async function liveSeparateFee(bookingId: string): Promise<{ paymentIntentId: string; amountCents: number } | null> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { stripePaymentIntentId: true } });
  const pi = b?.stripePaymentIntentId;
  if (!pi) return null;
  const ev = await prisma.paymentEvent.findFirst({ where: { bookingId, kind: 'fee_charged', stripeId: pi }, select: { amountCents: true } });
  return ev ? { paymentIntentId: pi, amountCents: ev.amountCents } : null;
}

/** Webhooks: map a (possibly already-cleared) fee PaymentIntent back to its booking. */
export async function bookingIdForFeeCharge(paymentIntentId: string): Promise<string | null> {
  if (!paymentIntentId) return null;
  const ev = await prisma.paymentEvent.findFirst({ where: { kind: 'fee_charged', stripeId: paymentIntentId }, select: { bookingId: true } });
  return ev?.bookingId ?? null;
}

/**
 * Charge the booking's GreenReserve fee on its own. `players` prorates a
 * partial party (same rule as check-in). Never throws.
 */
export async function chargeAccessFeeSeparately(bookingId: string, opts: {
  /** SP-B adds late_cancel: when the course's policy keeps a late fee, ours follows it (Cam 2026-10-05). */
  why: 'paid_offline' | 'no_show' | 'late_cancel';
  players?: number;
  actor: 'operator' | 'admin' | 'system';
  actorName?: string;
}): Promise<FeeChargeResult> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, players: true, accessFeeTotal: true, paymentStatus: true, roundPaymentIntentId: true,
      stripeCustomerId: true, stripePaymentMethodId: true, courseId: true,
    },
  });
  if (!b) return { ok: false, error: 'Booking not found' };
  // Counter bookings entered by staff carry no fee (accessFeeTotal 0).
  if (b.accessFeeTotal <= 0) return { ok: true, charged: false, reason: 'no GreenReserve fee on this booking' };
  // Review (HIGH): an admin "collect payment" can charge the round — fee
  // included — without checking the group in. Never take the fee twice.
  if (b.roundPaymentIntentId || b.paymentStatus === 'paid') return { ok: true, charged: false, reason: 'fee already paid in the round charge' };
  if (await liveSeparateFee(bookingId)) return { ok: true, charged: false, reason: 'fee already charged' };
  if (!b.stripeCustomerId || !b.stripePaymentMethodId) return { ok: true, charged: false, reason: 'no card on file' };

  const n = opts.players && opts.players > 0 && opts.players < b.players ? opts.players : b.players;
  const amountCents = Math.round(b.accessFeeTotal * n / b.players);
  if (amountCents < 50) return { ok: true, charged: false, reason: 'below Stripe minimum' };

  // A new fee charge is only possible after a refund, so refunds number the
  // attempts: after a refund the key changes and Stripe cannot replay the old,
  // refunded PaymentIntent as if it were a fresh charge.
  const attempt = await prisma.paymentEvent.count({ where: { bookingId, kind: 'fee_refunded' } });
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: b.stripeCustomerId,
      payment_method: b.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `GreenReserve booking fee — ${n} player${n === 1 ? '' : 's'} (${WHY_LABEL[opts.why]})`,
      statement_descriptor_suffix: 'BOOKING FEE',
      metadata: { bookingId, courseId: b.courseId, kind: 'access_fee', why: opts.why },
    }, { idempotencyKey: `accessfee-${bookingId}-${attempt}-${amountCents}` });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? (err.message || 'Card declined') : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, actor: opts.actor, actorName: opts.actorName, detail: `GreenReserve fee: ${msg}` }).catch(() => {});
    return { ok: false, error: msg };
  }
  // Outside the Stripe try (review): a DB hiccup here must not be recorded as a
  // failed charge when the money was taken.
  if (pi.status !== 'succeeded') {
    await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, stripeId: pi.id, actor: opts.actor, actorName: opts.actorName, detail: `GreenReserve fee: payment ${pi.status}` }).catch(() => {});
    return { ok: false, error: `The booking fee charge is ${pi.status}.` };
  }
  await recordPaymentEvent({ bookingId, kind: 'fee_charged', amountCents, stripeId: pi.id, actor: opts.actor, actorName: opts.actorName, detail: `GreenReserve fee charged separately (${WHY_LABEL[opts.why]})` });
  await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentIntentId: pi.id } });
  await logFeeEvent(bookingId, 'fee_charged', amountCents, pi.id, opts.actor, opts.actorName, `booking_fee_${opts.why}`);
  return { ok: true, charged: true, amountCents, paymentIntentId: pi.id };
}

/** Refund the live separate fee (and clear it so a later one can be taken). Never throws. */
export async function refundSeparateAccessFee(bookingId: string, reason: string, actor: 'operator' | 'admin' | 'system', actorName?: string): Promise<{ ok: boolean; refunded: boolean; error?: string }> {
  const live = await liveSeparateFee(bookingId);
  if (!live) return { ok: true, refunded: false };
  const pi = live.paymentIntentId;
  let r: Stripe.Refund;
  try {
    r = await stripe.refunds.create({ payment_intent: pi, metadata: { bookingId, kind: 'access_fee' } }, { idempotencyKey: `accessfee-refund-${bookingId}-${pi}` });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents: 0, stripeId: pi, actor, actorName, detail: `GreenReserve fee refund failed (${reason}): ${msg}` }).catch(() => {});
    return { ok: false, refunded: false, error: msg };
  }
  // The webhook may have ledgered this refund id first (as fee_refunded) — one row per refund.
  const seen = await prisma.paymentEvent.findFirst({ where: { stripeId: r.id }, select: { id: true } });
  if (!seen) await recordPaymentEvent({ bookingId, kind: 'fee_refunded', amountCents: r.amount, stripeId: r.id, actor, actorName, detail: `GreenReserve fee refunded: ${reason}` });
  await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentIntentId: '' } });
  await logFeeEvent(bookingId, 'fee_refunded', r.amount, r.id, actor, actorName, 'booking_fee_refunded');
  return { ok: true, refunded: true };
}

/**
 * PAY-2 (Cam 2026-10-06: "if a customer pays cash they log it and it just goes
 * to analytics and we are just going to have to eat it"). Online bookings paid
 * at the counter (cash, or the course's own terminal) in the window whose
 * GreenReserve fee was never collected. A fee charged separately to a saved
 * card (and not refunded) counts as collected. Counter/phone bookings carry no
 * fee (accessFeeTotal 0) and are never counted.
 */
export async function counterFeesUncollected(paidAt: { gte: Date; lt: Date }): Promise<{
  cents: number; rounds: number; byCourse: Map<string, { rounds: number; cents: number }>;
}> {
  const rows = await prisma.booking.findMany({
    where: { paymentStatus: 'paid_offline', accessFeeTotal: { gt: 0 }, paidAt },
    select: { courseId: true, accessFeeTotal: true, paymentEvents: { where: { kind: { in: ['fee_charged', 'fee_refunded'] } }, select: { kind: true, amountCents: true } } },
  });
  const byCourse = new Map<string, { rounds: number; cents: number }>();
  let cents = 0;
  let rounds = 0;
  for (const b of rows) {
    const net = b.paymentEvents.reduce((n, e) => n + (e.kind === 'fee_charged' ? e.amountCents : -e.amountCents), 0);
    if (net > 0) continue;
    cents += b.accessFeeTotal;
    rounds += 1;
    const c = byCourse.get(b.courseId) ?? { rounds: 0, cents: 0 };
    c.rounds += 1; c.cents += b.accessFeeTotal;
    byCourse.set(b.courseId, c);
  }
  return { cents, rounds, byCourse };
}

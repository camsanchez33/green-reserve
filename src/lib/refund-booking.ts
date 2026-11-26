// MP-6b. The refund primitive, and the PaymentEvent ledger it writes to.
//
// Before this there was NO refund anywhere in the product except the automatic
// late-fee refund at check-in — and when that failed it was a console.error
// with a comment saying support could do it in Stripe. A golfer double-charged,
// rained off, or simply owed money back had no in-product path. The
// PaymentEvent table existed in the schema with zero writers.
//
// Money rules: refunds are issued against the COURSE's connected account (the
// charge lived there); the platform fee on that charge is reversed
// proportionally by Stripe when `refund_application_fee` is set, so
// GreenReserve does not keep $1.50/player on a round that was refunded.

import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { sendRefundEmail } from './email';
import { roundChargedTotal, roundApplicationFeeCents } from './shop';
import { recordMove, feeBackCents } from './money-ledger';

export type PaymentEventKind =
  | 'refund' | 'refund_failed'
  | 'dispute_opened' | 'dispute_closed'
  | 'charge_failed'
  // FB-3: GreenReserve's fee charged on its own (paid offline / no-show).
  | 'fee_charged' | 'fee_refunded'
  // SP-B: the COURSE's no-show charge (on its connected account) and its refund.
  | 'no_show_fee' | 'no_show_fee_refunded';

export async function recordPaymentEvent(e: {
  bookingId: string; kind: PaymentEventKind; amountCents: number;
  stripeId?: string; actor: 'cron' | 'admin' | 'operator' | 'golfer' | 'stripe' | 'system'; actorName?: string; detail?: string;
}) {
  return prisma.paymentEvent.create({
    data: {
      bookingId: e.bookingId, kind: e.kind, amountCents: e.amountCents,
      stripeId: e.stripeId ?? '', actor: e.actor, actorName: e.actorName ?? null, detail: e.detail ?? '',
    },
  });
}

/**
 * Audit 2026-11-24 L5: what has already been refunded on the round's OWN charge, from Stripe. The cap
 * used to add up every 'refund' event on the booking, and a cutoff hold or a late fee given back is a
 * 'refund' event on a different charge, so it ate into what the round could still refund. Stripe's list
 * for the round's PaymentIntent is exact, and also counts a refund made in the Stripe dashboard.
 */
export async function refundedOnRound(paymentIntentId: string, stripeAccount: string): Promise<number> {
  const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 }, { stripeAccount });
  return list.data.filter(r => r.status !== 'failed' && r.status !== 'canceled').reduce((s, r) => s + r.amount, 0);
}

/**
 * L5: a refund is written once, however many requests see it. Two identical refunds sent at once share an
 * idempotency key, so Stripe hands both the same refund; each then wrote a row (and the webhook a third).
 * A transaction-scoped advisory lock on the refund id serialises the check and the write. `also` runs in
 * the same transaction when this call is the one that writes. True when it wrote.
 */
export async function recordRefundEventOnce(
  e: { bookingId: string; kind: PaymentEventKind; amountCents: number; stripeId: string; actor: 'cron' | 'admin' | 'operator' | 'golfer' | 'stripe' | 'system'; actorName?: string; detail?: string },
  also?: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payment-event:' + e.stripeId}))`;
    const seen = await tx.paymentEvent.findFirst({ where: { stripeId: e.stripeId }, select: { id: true } });
    if (seen) return false;
    await tx.paymentEvent.create({ data: { bookingId: e.bookingId, kind: e.kind, amountCents: e.amountCents, stripeId: e.stripeId, actor: e.actor, actorName: e.actorName ?? null, detail: e.detail ?? '' } });
    if (also) await also(tx);
    return true;
  });
}

/** Webhooks identify a booking by whichever Stripe object the event carries. */
export async function findBookingByStripeId(paymentIntentId: string) {
  if (!paymentIntentId) return null;
  return prisma.booking.findFirst({
    where: { OR: [{ roundPaymentIntentId: paymentIntentId }, { cancellationFeeChargeId: paymentIntentId }, { stripePaymentIntentId: paymentIntentId }] },
    select: { id: true, roundPaymentIntentId: true, cancellationFeeChargeId: true, totalAmount: true, cancellationFeeTotal: true },
  });
}

export type RefundResult =
  | { ok: true; refundId: string; amountCents: number; full: boolean; emailSent: boolean }
  | { ok: false; error: string; status: number };

/**
 * Refund a paid round, in full or in part. Idempotent per (booking, amount):
 * a retry after a timeout cannot refund twice.
 */
export async function refundBooking(bookingId: string, opts: {
  amountCents?: number;        // omit for a full refund of the round charge
  reason: string;              // shown to the golfer, stored on the event
  actor: 'admin' | 'operator';
  actorName: string;
}): Promise<RefundResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, stripeAccountId: true } },
    },
  });
  if (!booking) return { ok: false, error: 'Booking not found', status: 404 };
  if (booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'refunded') {
    return { ok: false, error: 'This round has not been charged, so there is nothing to refund.', status: 409 };
  }
  if (!booking.roundPaymentIntentId) return { ok: false, error: 'No round charge is on record for this booking.', status: 409 };
  if (!booking.course.stripeAccountId) return { ok: false, error: 'The course has no connected Stripe account — the charge cannot be refunded from here.', status: 409 };

  let alreadyRefunded: number;
  try { alreadyRefunded = await refundedOnRound(booking.roundPaymentIntentId, booking.course.stripeAccountId); }
  catch (err) { return { ok: false, error: `Could not read the round's refunds from Stripe (${err instanceof Error ? err.message : String(err)}). Try again.`, status: 502 }; }
  // POS-1a: the round's charge also carried any shop items and their fee.
  const charged = roundChargedTotal(booking);
  const remaining = charged - alreadyRefunded;
  if (remaining <= 0) return { ok: false, error: 'This round has already been refunded in full.', status: 409 };

  const amountCents = opts.amountCents === undefined ? remaining : Math.round(opts.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, error: 'Refund amount must be more than $0.', status: 400 };
  if (amountCents > remaining) return { ok: false, error: `Only $${(remaining / 100).toFixed(2)} of this charge is left to refund.`, status: 400 };
  const reason = opts.reason.trim();
  if (!reason) return { ok: false, error: 'A reason is required — the golfer sees it.', status: 400 };

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: booking.roundPaymentIntentId,
        amount: amountCents,
        // Give back GreenReserve's share of what is being refunded, pro rata.
        refund_application_fee: true,
        metadata: { bookingId, reason: reason.slice(0, 480), by: `${opts.actor}:${opts.actorName}` },
      },
      {
        stripeAccount: booking.course.stripeAccountId,
        idempotencyKey: `refund-${bookingId}-${amountCents}-${alreadyRefunded}`,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents, actor: opts.actor, actorName: opts.actorName, detail: `${reason} — Stripe: ${message}` }).catch(() => {});
    return { ok: false, error: `Stripe refused the refund: ${message}`, status: 502 };
  }

  const full = alreadyRefunded + amountCents >= charged;
  // LEDGER-1: GreenReserve's application fee comes back pro rata (refund_application_fee: true).
  await recordMove({ courseId: booking.courseId, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, platformFeeCents: feeBackCents(refund.amount, charged, roundApplicationFeeCents(booking)), stripeId: refund.id, bookingId, actor: opts.actor === 'operator' ? 'staff' : 'admin', note: reason });
  // L5: once per refund id — a twin request (same key, same refund) writes nothing and sends no second email.
  const wrote = await recordRefundEventOnce(
    { bookingId, kind: 'refund', amountCents, stripeId: refund.id, actor: opts.actor, actorName: opts.actorName, detail: reason },
    // paymentStatus only flips on a FULL refund; a partial one is still a paid round with money returned.
    // AUDIT-1: the round is open again — its old charge claim mustn't block collecting it again.
    full ? tx => tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'refunded', shopLockedAt: null } }) : undefined,
  );
  if (!wrote) return { ok: true, refundId: refund.id, amountCents, full, emailSent: false };

  let emailSent = false;
  try {
    await sendRefundEmail({
      golferName: booking.golferName, golferEmail: booking.golferEmail, courseName: booking.course.name,
      date: booking.teeTime.date, time: booking.teeTime.time,
      amountCents, full, reason, bookingId,
    });
    emailSent = true;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'refund.email.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
  }

  console.log(JSON.stringify({ ev: 'refund.ok', bookingId, refundId: refund.id, amountCents, full, by: opts.actorName }));
  return { ok: true, refundId: refund.id, amountCents, full, emailSent };
}

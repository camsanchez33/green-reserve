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
import { prisma } from './prisma';
import { stripe } from './stripe';
import { sendRefundEmail } from './email';

export type PaymentEventKind =
  | 'refund' | 'refund_failed'
  | 'dispute_opened' | 'dispute_closed'
  | 'charge_failed';

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
      paymentEvents: { where: { kind: 'refund' }, select: { amountCents: true } },
    },
  });
  if (!booking) return { ok: false, error: 'Booking not found', status: 404 };
  if (booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'refunded') {
    return { ok: false, error: 'This round has not been charged, so there is nothing to refund.', status: 409 };
  }
  if (!booking.roundPaymentIntentId) return { ok: false, error: 'No round charge is on record for this booking.', status: 409 };
  if (!booking.course.stripeAccountId) return { ok: false, error: 'The course has no connected Stripe account — the charge cannot be refunded from here.', status: 409 };

  const alreadyRefunded = booking.paymentEvents.reduce((s, e) => s + e.amountCents, 0);
  const remaining = booking.totalAmount - alreadyRefunded;
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

  const full = alreadyRefunded + amountCents >= booking.totalAmount;
  await prisma.$transaction([
    prisma.paymentEvent.create({
      data: { bookingId, kind: 'refund', amountCents, stripeId: refund.id, actor: opts.actor, actorName: opts.actorName, detail: reason },
    }),
    // paymentStatus only flips on a FULL refund; a partial one is still a paid round with money returned.
    ...(full ? [prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'refunded' } })] : []),
  ]);

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

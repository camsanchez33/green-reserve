// R-GOLF-010 — what was actually charged to (and refunded from) the golfer's
// card, for the receipt. The receipt used to show only the booking's prices
// and say "Nothing has been charged yet" whatever had happened: after a hold, a
// no-show fee or a late cancel it contradicted the golfer's card statement.
// Read from the same records the money paths write — never recomputed.
import { prisma } from './prisma';
import { liveNoShowCharge } from './no-show-fee';
import { liveSeparateFee } from './access-fee';
import { holdsAtCutoff } from './cancel-policy';

export type ReceiptCharge = { label: string; amountCents: number; refunded: boolean };

export async function receiptCharges(bookingId: string): Promise<ReceiptCharge[]> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      totalAmount: true, paymentStatus: true, roundPaymentIntentId: true, paidOffline: true,
      cancellationFeeTotal: true, cancellationFeeChargeId: true, lateFeeTimingAtBooking: true,
      status: true, noShowAt: true,
    },
  });
  if (!b) return [];
  const refundEvents = await prisma.bookingEvent.findMany({
    where: { bookingId, type: 'fee_refunded' },
    select: { amountCents: true, metadata: true },
  });
  const refundedFor = (reasons: string[]) => refundEvents.find(e => reasons.includes(String((e.metadata as { reason?: string } | null)?.reason ?? '')));

  const out: ReceiptCharge[] = [];

  // The round itself (green fees, cart, range balls and the booking fee in one charge).
  // A round refunded by an admin or from the Stripe dashboard keeps its PI and
  // shows as charged here; the refund is its own row below.
  if ((b.paymentStatus === 'paid' || b.paymentStatus === 'refunded') && b.roundPaymentIntentId && !b.paidOffline) {
    out.push({ label: 'Your round', amountCents: b.totalAmount, refunded: false });
  } else {
    const roundRefund = refundedFor(['round_refunded_on_cancel']);
    if (roundRefund) out.push({ label: 'Your round', amountCents: roundRefund.amountCents ?? b.totalAmount, refunded: true });
  }

  // The late-cancellation hold or fee.
  if (b.cancellationFeeChargeId && b.cancellationFeeTotal > 0) {
    // "Hold" only while it can still come back; once the booking is cancelled or
    // a no-show it is the fee kept.
    const hold = holdsAtCutoff(b) && b.status !== 'cancelled' && !b.noShowAt;
    out.push({
      label: hold ? 'Late-cancellation hold' : 'Late-cancellation fee',
      amountCents: b.cancellationFeeTotal,
      refunded: !!refundedFor(['hold_refunded_at_checkin', 'late_fee_waived']),
    });
  }

  // The no-show fee: the last no-show charge, refunded if "still coming" or a waiver gave it back.
  const noShowEvents = await prisma.paymentEvent.findMany({
    where: { bookingId, kind: { in: ['no_show_fee', 'no_show_fee_refunded'] } },
    orderBy: { createdAt: 'desc' }, select: { kind: true, amountCents: true },
  });
  if (noShowEvents.length) {
    const live = await liveNoShowCharge(bookingId);
    const lastCharge = noShowEvents.find(e => e.kind === 'no_show_fee');
    if (lastCharge) out.push({ label: 'No-show fee', amountCents: live?.amountCents ?? lastCharge.amountCents, refunded: !live });
  }

  // GreenReserve's booking fee when it was charged on its own (with a kept late
  // fee or no-show, or a counter-paid round) rather than inside the round charge.
  const feeCharges = await prisma.paymentEvent.findMany({
    where: { bookingId, kind: 'fee_charged' }, orderBy: { createdAt: 'desc' }, select: { amountCents: true },
  });
  if (feeCharges.length) {
    const live = await liveSeparateFee(bookingId);
    // A refund from the Stripe dashboard writes fee_refunded without clearing the booking's PI.
    const feeRefunds = await prisma.paymentEvent.count({ where: { bookingId, kind: 'fee_refunded' } });
    out.push({ label: 'Booking fee', amountCents: live?.amountCents ?? feeCharges[0].amountCents, refunded: !live || feeRefunds >= feeCharges.length });
  }

  // Refunds recorded against the round or the hold (admin refunds, the Stripe
  // dashboard via the webhook). They don't say which charge they belong to, so
  // they are one row the card total nets out.
  const refunds = await prisma.paymentEvent.aggregate({ where: { bookingId, kind: 'refund' }, _sum: { amountCents: true } });
  const refundedCents = refunds._sum.amountCents ?? 0;
  if (refundedCents > 0) out.push({ label: 'Refunded to your card', amountCents: -refundedCents, refunded: false });

  return out;
}

/** What is on the card now: every charge not refunded, less refunds (never below 0). */
export const chargedNowCents = (charges: ReceiptCharge[]) =>
  Math.max(0, charges.filter(c => !c.refunded).reduce((s, c) => s + c.amountCents, 0));

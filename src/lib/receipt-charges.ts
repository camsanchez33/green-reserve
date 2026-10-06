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
  if (b.paymentStatus === 'paid' && b.roundPaymentIntentId && !b.paidOffline) {
    out.push({ label: 'Your round', amountCents: b.totalAmount, refunded: false });
  } else {
    const roundRefund = refundedFor(['round_refunded_on_cancel']);
    if (roundRefund) out.push({ label: 'Your round', amountCents: roundRefund.amountCents ?? b.totalAmount, refunded: true });
  }

  // The late-cancellation hold or fee.
  if (b.cancellationFeeChargeId && b.cancellationFeeTotal > 0) {
    const hold = holdsAtCutoff(b);
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
    out.push({ label: 'Booking fee', amountCents: live?.amountCents ?? feeCharges[0].amountCents, refunded: !live });
  }

  return out;
}

/** What is on the card now: every charge not refunded. */
export const chargedNowCents = (charges: ReceiptCharge[]) =>
  charges.filter(c => !c.refunded).reduce((s, c) => s + c.amountCents, 0);

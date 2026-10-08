// The words staff read before cancelling a booking — the tee sheet's panel and
// Money → Cancellations ask the same question the same way, so the fee outcome
// they promise matches what lib/cancel-booking.ts actually does.
type Cancelable = { golferName: string; paymentStatus: string; cancellationFeeTotal: number; noShowAt?: string | null };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function cancelConfirmText(b: Cancelable, waive: boolean, canWaive: boolean): string {
  const feeCharged = b.paymentStatus === 'cancellation_fee_charged';
  const fee = usd(b.cancellationFeeTotal);
  // A round already paid ahead is refunded by the cancel (or the cancel is refused).
  const paid = b.paymentStatus === 'paid' ? '\n\nTheir round was already paid — it is refunded to their card.' : '';
  // A booking marked no-show has its no-show charges taken by the cancel unless waived.
  const noShow = b.noShowAt && !waive ? '\n\nThey’re marked as a no-show, so any no-show charge is taken now.' : '';
  const body = waive
    ? `Cancel ${b.golferName}'s booking and waive the late fee?\n\n${feeCharged ? `The ${fee} already charged will be refunded to their card.` : 'No late fee will be charged.'}`
    : feeCharged
      ? `Cancel ${b.golferName}'s booking?\n\nTheir ${fee} late-cancellation fee was already charged and will NOT be refunded.`
      : b.cancellationFeeTotal > 0
        ? `Cancel ${b.golferName}'s booking?\n\nIf their free-cancellation window has already closed, the ${fee} late fee is charged to their card now.${canWaive ? ' Use “Cancel, no fee” to cancel without it.' : ''}`
        : `Cancel ${b.golferName}'s booking?\n\nNo late fee on this booking — nothing is charged.`;
  return body + paid + noShow;
}

/** What happened, after the route answers. */
export function cancelResultText(b: Cancelable, waive: boolean, r: { feeCharged?: boolean; feeRefundFailed?: string; lateFeeChargeFailed?: string; roundRefunded?: boolean }): { text: string; tone: 'ok' | 'warn' } {
  const fee = usd(b.cancellationFeeTotal);
  const refunded = r.roundRefunded ? ' Their round payment was refunded.' : '';
  if (waive && r.feeRefundFailed) return { text: `Cancelled, but the ${fee} refund did not go through (${r.feeRefundFailed}) — refund it from Stripe.${refunded}`, tone: 'warn' };
  if (r.lateFeeChargeFailed) return { text: `Cancelled, but the ${fee} late fee could not be charged (${r.lateFeeChargeFailed}).${refunded}`, tone: 'warn' };
  if (waive) return { text: `Cancelled — ${b.paymentStatus === 'cancellation_fee_charged' ? `the ${fee} fee was refunded.` : 'no fee.'}${refunded}`, tone: 'ok' };
  return { text: (r.feeCharged ? `Cancelled — the ${fee} late-cancellation fee is charged and kept.` : 'Cancelled — no charge was made.') + refunded, tone: 'ok' };
}

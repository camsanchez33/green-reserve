// What staff read before and after cancelling from the tee sheet or Money →
// Cancellations (lib/cancel-confirm.ts). Each line must match what
// lib/cancel-booking.ts does — above all, a kept no-show charge is never
// called a late fee. Pure — no database.
// Run: npx tsx scripts/cancel-wording-test.ts
import { cancelConfirmText, cancelResultText } from '../src/lib/cancel-confirm';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
const b = (o: Partial<{ paymentStatus: string; cancellationFeeTotal: number; noShowAt: string | null }> = {}) => ({ golferName: 'Ann', paymentStatus: 'card_on_file', cancellationFeeTotal: 0, noShowAt: null, ...o });

check('no fee: says nothing is charged', /nothing is charged/.test(cancelConfirmText(b(), false, true)));
check('late fee: says it is charged if the window closed, offers no-fee', /\$10\.00 late fee is charged[\s\S]*Cancel, no fee/.test(cancelConfirmText(b({ cancellationFeeTotal: 1000 }), false, true)));
check('late fee, no waive permission: no-fee not offered', !/Cancel, no fee/.test(cancelConfirmText(b({ cancellationFeeTotal: 1000 }), false, false)));
check('hold already taken: kept', /will NOT be refunded/.test(cancelConfirmText(b({ paymentStatus: 'cancellation_fee_charged', cancellationFeeTotal: 1000 }), false, true)));
check('paid round: refunded', /already paid — it is refunded/.test(cancelConfirmText(b({ paymentStatus: 'paid' }), false, true)));
check('no-show: charge taken now', /no-show charge is taken now/.test(cancelConfirmText(b({ noShowAt: '2026-10-08T10:00:00Z' }), false, true)));
check('no-show, waived: refunded', /no-show charge is refunded/.test(cancelConfirmText(b({ noShowAt: '2026-10-08T10:00:00Z' }), true, true)));

const noShowOut = cancelResultText(b({ noShowAt: 'x' }), false, { feeCharged: true, noShowFeeKeptCents: 2000 });
check('no-show kept: named as the no-show charge', /\$20\.00 no-show charge is kept/.test(noShowOut.text), noShowOut.text);
check('no-show kept: never "$0.00 late-cancellation fee"', !/late-cancellation|\$0\.00/.test(noShowOut.text));
check('late fee kept', /\$10\.00 late-cancellation fee is charged and kept/.test(cancelResultText(b({ cancellationFeeTotal: 1000 }), false, { feeCharged: true }).text));
check('free cancel', /no charge was made/.test(cancelResultText(b(), false, {}).text));
const failedCharge = cancelResultText(b({ cancellationFeeTotal: 1000 }), false, { lateFeeChargeFailed: 'no card on file' });
check('late fee charge failed: warns', failedCharge.tone === 'warn' && /could not be charged/.test(failedCharge.text));
const failedRefund = cancelResultText(b({ paymentStatus: 'cancellation_fee_charged', cancellationFeeTotal: 1000 }), true, { feeRefundFailed: 'stripe down' });
check('waived refund failed: warns', failedRefund.tone === 'warn' && /did not go through/.test(failedRefund.text));
check('round refunded: said', /round payment was refunded/.test(cancelResultText(b({ paymentStatus: 'paid' }), false, { roundRefunded: true }).text));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

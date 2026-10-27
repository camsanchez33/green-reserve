// Client-safe half of lib/cancel-fee-reason (no prisma): why a cancellation kept no fee.
export type NoFeeReason = 'in_time' | 'counter' | 'no_fee' | 'no_card' | 'charge_failed' | 'waived';

export const NO_FEE_LABEL: Record<NoFeeReason, string> = {
  in_time: 'Cancelled in time',
  counter: 'Counter booking, no card',
  no_fee: 'Booked with no late fee',
  no_card: 'No card on file',
  charge_failed: 'Fee charge failed',
  waived: 'Fee waived',
};

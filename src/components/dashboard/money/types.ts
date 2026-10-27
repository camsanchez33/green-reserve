// SD-8 — one booking shape for all three Money tabs. The union of what the
// old Payments and Cancellations pages each declared, so neither loses a field.
export type MoneyBooking = {
  id: string; golferName: string; golferEmail: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number; cancelledAt?: string | null; cancellationFeeChargedAt?: string | null;
  paymentStatus: string; status: string; appliedRate?: string; createdAt: string; noShowAt?: string | null;
  /** A cancellation that kept no fee: why (lib/cancel-fee-reason). */
  noFeeReason?: import('@/lib/no-fee-labels').NoFeeReason;
  /** A cancellation whose no-show charge was kept (it never sets cancellation_fee_charged). */
  noShowFeeKeptCents?: number;
  teeTime: { date: string; time: string; holes: number };
};

/** What the Money page needs off the course record. */
export type MoneyCourse = {
  cancellationHours: number;
  lateCancellationFee: number;
  stripeAccountActive: boolean;
  liveStatus: string;
};

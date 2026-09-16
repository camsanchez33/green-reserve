// SD-8 — one booking shape for all three Money tabs. The union of what the
// old Payments and Cancellations pages each declared, so neither loses a field.
export type MoneyBooking = {
  id: string; golferName: string; golferEmail: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number; cancelledAt?: string | null; cancellationFeeChargedAt?: string | null;
  paymentStatus: string; status: string; appliedRate?: string; createdAt: string;
  teeTime: { date: string; time: string; holes: number };
};

/** What the Money page needs off the course record. */
export type MoneyCourse = {
  cancellationHours: number;
  lateCancellationFee: number;
  stripeAccountActive: boolean;
  liveStatus: string;
};

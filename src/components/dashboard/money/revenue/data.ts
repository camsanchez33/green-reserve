// REVENUE-1: what the Revenue page reads, as the routes return it. Fields marked "Build" are the additive ones agreed
// with the Build lane (30-day average, Food & beverage, Stripe mismatch detail); until a route sends them the part
// that needs them stays hidden — never filled in by guesswork.
import type { CloseView } from '@/lib/register-close';
import type { DeclinedCard } from '@/lib/operator-home';
import type { LedgerDay, LedgerRow, Earned, PaidOut } from '@/lib/ledger-view';

export type Range = { from: string; to: string };
export type RangeKey = '7' | '30' | 'month' | 'custom';

export type Sales = {
  range: Range; today: string; lastWeek: string; clock: string; bucket: 'day' | 'week';
  series: { key: string; collectedCents: number; gapCents: number }[];
  byDow: { dow: string; collectedCents: number }[];
  byHour: { hour: number; collectedCents: number }[];
  collectedCents: number; beforeCollectedCents: number;
  summary: { greenCents: number; cartCents: number; rangeCents: number; refundedCents?: number; lateFeesKeptCents: number; shopOnRoundsCents: number; walkUpCents: number; walkUpSales: number; eventCents?: number; eventPayments?: number; greenReserveFeesCents: number };
  paid: { cardCents: number; counterCents: number; accountCents?: number; outstandingCents: number; outstandingGroups: number };
  /** Build: what was sold, every segment (shop without food and drink); totalCents is the Total, not collectedCents. */
  segments?: { teeCents: number; cartCents: number; shopCents: number; eventCents: number; fnbCents: number; totalCents: number };
  /** Build: how it was paid, from the ledger by payment day — its own total, never shown as the same total as segments. */
  howPaid?: { onlineCents: number; readerCents: number; cashCents: number; otherCents: number; totalCents: number };
  todayByHour: { hour: number; collectedCents: number }[]; lastWeekByHour: { hour: number; collectedCents: number }[];
  todayCollectedCents: number; lastWeekCollectedCents: number;
  drawer: CloseView | null;
  /** Build: ONE basis for the whole page — the ledger by payment day, the course's part (GreenReserve's fee out), dues in.
   *  grossCents = sum(segments) = sum(paid) = the Ledger's Revenue; series/byDow/byHour are money in (gross). */
  all?: { bucket: 'day' | 'week'; grossCents: number; refundsCents: number; netCents: number; beforeGrossCents: number;
    segments: { teeCents: number; cartCents: number; shopCents: number; fnbCents: number; eventCents: number; duesCents: number; otherCents: number;
      /** Build (Revenue by source, Cam 2026-11-16): season passes, in grossCents like every segment. */
      passesCents?: number };
    paid: { onlineCents: number; readerCents: number; cashCents: number; otherCents: number };
    series: { key: string; cents: number }[]; byDow: { dow: number; cents: number; days: number }[]; byHour: { hour: number; cents: number }[] };
  /** Build: money taken so far today against the average of the last `days` days (≤ 30), by payment time. */
  todayVsAverage?: { days: number; nowMinute: number; todayNowCents: number; avgNowCents: number; points: { minute: number; todayCents: number | null; avgCents: number }[] };
};

export type Overview = { week: { from: string; to: string }; today: string; clock: string; paidCents: number; notPaidCents: number; notPaidGroups: number; noShowToChargeCents?: number; noShowToChargeGroups?: number; declined: DeclinedCard[]; declinedTotal: number; stripeConnected: boolean };

export type Payout = { id: string; amountCents: number; currency: string; status: string; createdAt: string; arrivalDate: string; failureMessage: string | null };
export type PayoutsData = { connected: boolean; payouts: Payout[]; next?: Payout | null; balance: { availableCents: number; pendingCents: number } | null };

/** Build (?day=&mismatch=1, asked only on a day whose match is 'off'): what Stripe disagrees with that day, payment by payment. diffCents = stripeCents − ourCents. */
export type Mismatch = { ourCents: number; stripeCents: number; diffCents: number; payments: { stripeId: string; paymentStripeId: string | null; kind: 'refund_in_stripe' | 'not_in_stripe' | 'not_here' | 'amount_differs' | 'other_day' | 'stripe_adjustment'; at: string; who: string; href: string | null; ourCents: number | null; stripeCents: number | null; note: string }[] };
/** Build: GreenReserve's fees on money in, and fees given back with refunds (platformCents = in − back). */
export type RevenueLedgerDay = LedgerDay & { feesInCents?: number; feesBackCents?: number };
export type LedgerDays = { range: Range; today: string; days: RevenueLedgerDay[]; stripeRead: boolean; stripeConnected: boolean; tz: string; earned: Earned | null; paidOut: PaidOut | null };
export type RevenueLedgerRow = LedgerRow;

/** A payout's words and dot (as the old Payouts table). */
export const PAYOUT_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  paid: { label: 'In your bank', tone: 'ok' },
  in_transit: { label: 'On its way', tone: 'neutral' },
  pending: { label: 'On its way', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'bad' },
  canceled: { label: 'Cancelled', tone: 'warn' },
};

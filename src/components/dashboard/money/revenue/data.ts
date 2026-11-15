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
  summary: { greenCents: number; cartCents: number; rangeCents: number; refundedCents?: number; lateFeesKeptCents: number; shopOnRoundsCents: number; walkUpCents: number; walkUpSales: number; eventCents?: number; eventPayments?: number; greenReserveFeesCents: number;
    /** Build: shop lines that are food and drink, and the shop without them. */
    fnbCents?: number; shopCents?: number };
  paid: { cardCents: number; counterCents: number; accountCents?: number; outstandingCents: number; outstandingGroups: number;
    /** Build: card split into online and the card reader, and cash on its own. */
    onlineCents?: number; readerCents?: number; cashCents?: number };
  todayByHour: { hour: number; collectedCents: number }[]; lastWeekByHour: { hour: number; collectedCents: number }[];
  todayCollectedCents: number; lastWeekCollectedCents: number;
  drawer: CloseView | null;
  /** Build: the average of the last 30 days, running through the day. */
  avg30?: { byHalfHour: { minute: number; cumulativeCents: number }[]; toNowCents: number };
};

export type Overview = { week: { from: string; to: string }; today: string; clock: string; paidCents: number; notPaidCents: number; notPaidGroups: number; noShowToChargeCents?: number; noShowToChargeGroups?: number; declined: DeclinedCard[]; declinedTotal: number; stripeConnected: boolean };

export type Payout = { id: string; amountCents: number; currency: string; status: string; createdAt: string; arrivalDate: string; failureMessage: string | null };
export type PayoutsData = { connected: boolean; payouts: Payout[]; next?: Payout | null; balance: { availableCents: number; pendingCents: number } | null };

/** Build: a day Stripe disagrees with, and the payments behind it. */
export type StripeDiff = { cents: number; cause: 'refund_in_stripe' | 'unknown'; payments: { moveId: string; at: string; who: string; label: string; amountCents: number; stripeRefundCents: number; stripeId: string | null }[] };
export type RevenueLedgerDay = LedgerDay & { stripeDiff?: StripeDiff | null };
export type LedgerDays = { range: Range; today: string; days: RevenueLedgerDay[]; stripeRead: boolean; stripeConnected: boolean; tz: string; earned: Earned | null; paidOut: PaidOut | null };
export type RevenueLedgerRow = LedgerRow & { stripeRefundCents?: number };

/** A payout's words and dot (as the old Payouts table). */
export const PAYOUT_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  paid: { label: 'In your bank', tone: 'ok' },
  in_transit: { label: 'On its way', tone: 'neutral' },
  pending: { label: 'On its way', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'bad' },
  canceled: { label: 'Cancelled', tone: 'warn' },
};

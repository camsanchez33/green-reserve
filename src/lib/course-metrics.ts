// THE shared metrics brain (REVISE_QUEUE A-04 item 0) — bookings/gross/
// GR-fees/period math defined ONCE. The audit found 4 surfaces (courses
// list, course detail, Revenue, Overview) computing 4 different numbers for
// the same course — two of them silently excluded checked-in bookings
// (status: 'confirmed' only, missing 'completed') while the other two
// correctly counted both. After this module, a disagreement between
// surfaces is a failing test, not a discovery: every surface imports these
// same constants/functions instead of re-deriving its own subset.

// A booking counts as "real business" once payment is committed —
// 'confirmed' (card saved, charge happens at check-in) or 'completed'
// (already checked in and charged). 'cancelled' bookings never count here.
export const COMPLETED_BOOKING_STATUSES = ['confirmed', 'completed'];

export interface PeriodMetrics {
  bookings: number;
  /** Dollars — the COURSE's take (green fee + cart fee + everything except our service fee). */
  gross: number;
  /** Dollars — GreenReserve's own service-fee revenue. */
  grFees: number;
}

// Every caller already has a `prisma.booking.aggregate({ _sum, _count })` or
// `.groupBy` result — this is the ONE place cents become dollars and the
// field names get decided (totalAmount = gross, accessFeeTotal = our fee).
export function metricsFromAggregate(agg: {
  _count: number | { id: number } | null | undefined;
  _sum?: { totalAmount?: number | null; accessFeeTotal?: number | null } | null;
}): PeriodMetrics {
  const bookings = typeof agg._count === 'number' ? agg._count : (agg._count?.id ?? 0);
  return {
    bookings,
    gross: (agg._sum?.totalAmount ?? 0) / 100,
    grFees: (agg._sum?.accessFeeTotal ?? 0) / 100,
  };
}

export interface PeriodDelta {
  pct: number | null; // null = no prior period to compare (A0 rule: show "—", never a fabricated 0%)
  direction: 'up' | 'down' | 'flat' | null;
}

export function periodDelta(current: number, prior: number): PeriodDelta {
  if (prior === 0) return { pct: null, direction: null };
  const pct = ((current - prior) / prior) * 100;
  return { pct, direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

// ---- Course health status (worst-truth-wins worded chip) ------------------
// Used by BOTH the courses list (batch) and the course detail header (single)
// so the two can never disagree about what a course's status word means.

export type CourseHealthStatus = 'archived' | 'payments_broken' | 'setup_incomplete' | 'offline' | 'going_quiet' | 'healthy';

export const HEALTH_STATUS_LABEL: Record<CourseHealthStatus, string> = {
  archived: 'Archived',
  payments_broken: 'Payments broken',
  setup_incomplete: 'Setup incomplete',
  offline: 'Offline',
  going_quiet: 'Going quiet',
  healthy: 'Healthy',
};

// StatusDot tone per status — reused by both surfaces' chip rendering.
export const HEALTH_STATUS_DOT: Record<CourseHealthStatus, 'ok' | 'bad' | 'warn' | 'neutral'> = {
  archived: 'neutral',
  payments_broken: 'bad',
  setup_incomplete: 'warn',
  offline: 'neutral',
  going_quiet: 'warn',
  healthy: 'ok',
};

// A course only becomes eligible for the "going quiet" trend judgment once
// it has enough history — otherwise "0 bookings" just means it's new, not
// declining (same rule the Overview Course Health Watchlist already used).
export const TREND_MIN_AGE_DAYS = 60;
export const TREND_DROP_PCT_THRESHOLD = 40;

export interface CourseHealthInput {
  archivedAt: Date | string | null;
  active: boolean;
  liveStatus: string;
  stripeAccountActive: boolean;
  /** Set once, the first time a course ever goes live — the ONE field that lets us tell
   *  "never been live" (setup incomplete) apart from "was live, taken down" (offline)
   *  without a new schema field. */
  welcomeEmailSentAt: Date | string | null;
  createdAt: Date | string;
  bookings30d: number;
  bookingsPrev30d: number;
}

export interface CourseHealth {
  status: CourseHealthStatus;
  label: string;
  dot: 'ok' | 'bad' | 'warn' | 'neutral';
  /** Plain-English why, for the tooltip — "worst truth wins" always states the reason. */
  reason: string;
}

export function computeCourseHealth(c: CourseHealthInput, now: Date = new Date()): CourseHealth {
  const mk = (status: CourseHealthStatus, reason: string): CourseHealth =>
    ({ status, label: HEALTH_STATUS_LABEL[status], dot: HEALTH_STATUS_DOT[status], reason });

  if (c.archivedAt) return mk('archived', 'Archived — off the public site, data retained.');

  const isLive = c.active && c.liveStatus === 'live';

  if (isLive && !c.stripeAccountActive) {
    return mk('payments_broken', "Live but can't take payments — Stripe isn't connected.");
  }

  if (!isLive) {
    return c.welcomeEmailSentAt
      ? mk('offline', 'Was live, currently taken offline.')
      : mk('setup_incomplete', "Hasn't gone live yet — onboarding still in progress.");
  }

  // Live + Stripe OK — check the trend before calling it healthy.
  const createdAt = new Date(c.createdAt);
  const ageDays = (now.getTime() - createdAt.getTime()) / 86400000;
  if (ageDays >= TREND_MIN_AGE_DAYS) {
    if (c.bookings30d === 0 && c.bookingsPrev30d > 0) {
      return mk('going_quiet', `Zero bookings in 30d (had ${c.bookingsPrev30d} the 30d before).`);
    }
    if (c.bookingsPrev30d > 0) {
      const dropPct = ((c.bookingsPrev30d - c.bookings30d) / c.bookingsPrev30d) * 100;
      if (dropPct > TREND_DROP_PCT_THRESHOLD) {
        return mk('going_quiet', `Bookings down ${dropPct.toFixed(0)}% vs the prior 30d (${c.bookings30d} vs ${c.bookingsPrev30d}).`);
      }
    }
  }

  return mk('healthy', 'Live, taking payments, booking volume steady or growing.');
}

// Severity ranking for the list's default sort ("worst first, it's a triage
// list even when clean") — lower number = worse = sorts first.
export const HEALTH_STATUS_SEVERITY: Record<CourseHealthStatus, number> = {
  payments_broken: 0,
  going_quiet: 1,
  setup_incomplete: 2,
  offline: 3,
  healthy: 4,
  archived: 5,
};

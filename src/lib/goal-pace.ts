// GOAL-PACE (Cam 2026-11-12, ADMIN_REDO_SPEC "Goals: one pace rule everywhere"): every goal bar fills with progress
// so far, and its COLOUR says where the period ends at the current pace. ONE rule for the admin (Revenue's revenue
// goal, Expenses' monthly budget) and the course dashboard (Home's goals):
//   pace = progress so far ÷ the elapsed share of the period, projected to the period's end.
//   A goal to reach (revenue, bookings): ok = on pace to hit · warn = within 10% short · bad = on pace to miss.
//   A cap (costs):                       ok = on pace to stay under · warn = within 10% over · bad = on pace to go over.
// A rate (a fill %) is already "per period", so it isn't projected: its value now is its pace. Pure and client-safe.

export type PaceTone = 'ok' | 'warn' | 'bad';
export type GoalKind = 'reach' | 'cap';

/**
 * How far through the period we are, 0–1. `dayOfPeriod` may be fractional: day 12 at noon is 11.5 (11 whole days gone
 * plus half of today) — counting all of today as gone would under-project every morning (final review 2026-11-12).
 */
export function elapsedShare(dayOfPeriod: number, daysInPeriod: number): number {
  if (!(daysInPeriod > 0)) return 1;
  return Math.min(1, Math.max(0, dayOfPeriod) / daysInPeriod);
}

/** The elapsed days of a month at a clock time: day 12 at "12:00" → 11.5. */
export function elapsedDays(dayOfMonth: number, clockHHMM: string): number {
  const mins = Number(clockHHMM.slice(0, 2)) * 60 + Number(clockHHMM.slice(3, 5));
  return dayOfMonth - 1 + (Number.isFinite(mins) ? Math.min(1440, Math.max(0, mins)) / 1440 : 1);
}

// Shares are rounded floats (d / D), so a projection can land a hair under or over a target it exactly meets; the
// bands include their edges, so compare with a tiny relative tolerance (final review 2026-11-12).
const EPS = 1e-9;
const atLeast = (a: number, b: number) => a >= b - Math.abs(b) * EPS;
const atMost = (a: number, b: number) => a <= b + Math.abs(b) * EPS;

/** Where the period ends at the current pace. A rate, or a period that is over, is its value now. */
export function projectAtEnd(progress: number, share: number, rate = false): number {
  if (rate || share >= 1) return progress;
  if (share <= 0) return progress; // nothing has elapsed yet: no pace to project from
  return progress / share;
}

/** The colour of a goal (see the rule above). The 10% band is of the target. */
export function goalPace(o: { progress: number; target: number; share: number; kind?: GoalKind; rate?: boolean }): { projected: number; tone: PaceTone } {
  const kind = o.kind ?? 'reach';
  const projected = projectAtEnd(o.progress, o.share, o.rate);
  if (!(o.target > 0)) return { projected, tone: 'ok' };
  if (kind === 'reach') {
    if (atLeast(o.progress, o.target) || atLeast(projected, o.target)) return { projected, tone: 'ok' };
    return { projected, tone: atLeast(projected, o.target * 0.9) ? 'warn' : 'bad' };
  }
  if (!atMost(o.progress, o.target)) return { projected, tone: 'bad' }; // already over the budget
  if (atMost(projected, o.target)) return { projected, tone: 'ok' };
  return { projected, tone: atMost(projected, o.target * 1.1) ? 'warn' : 'bad' };
}

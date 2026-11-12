// ADMIN-REDO (Cam 2026-11-12): is a running total on pace for its target by the end of the
// period? One rule for a cost (the expense budget: under is good) and for revenue (a goal:
// over is good). Pure. The projection is the straight line: progress ÷ the share of the
// period gone.
//
//   COST     ok   projected ≤ 0.9 × target
//            warn 0.9 × target < projected ≤ target
//            bad  projected > target
//   REVENUE  ok   projected ≥ target
//            warn 0.9 × target ≤ projected < target
//            bad  projected < 0.9 × target
//
// No pace without a target (null or ≤ 0) or before any of the period has gone (elapsedShare ≤ 0):
// state null, never a guess.

export type PaceKind = 'cost' | 'revenue';
export type PaceState = 'ok' | 'warn' | 'bad';

export const PACE_WARN_SHARE = 0.9;

export function goalPace(i: { progressCents: number; targetCents: number | null; elapsedShare: number; kind: PaceKind }):
  { projectedCents: number | null; state: PaceState | null } {
  const { progressCents, targetCents, kind } = i;
  if (!Number.isFinite(progressCents) || !Number.isFinite(i.elapsedShare) || i.elapsedShare <= 0) return { projectedCents: null, state: null };
  const share = Math.min(1, i.elapsedShare);
  const projectedCents = Math.round(progressCents / share);
  if (targetCents == null || !Number.isFinite(targetCents) || targetCents <= 0) return { projectedCents, state: null };
  const warnLine = PACE_WARN_SHARE * targetCents;
  const state: PaceState = kind === 'cost'
    ? (projectedCents <= warnLine ? 'ok' : projectedCents <= targetCents ? 'warn' : 'bad')
    : (projectedCents >= targetCents ? 'ok' : projectedCents >= warnLine ? 'warn' : 'bad');
  return { projectedCents, state };
}

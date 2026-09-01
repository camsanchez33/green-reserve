/**
 * Money conversions, in one place.
 *
 * MP-3 run B2a. The rule this codebase now follows:
 *
 *   AT REST (database)  — integer cents, in a column whose name ends in `Cents`.
 *   IN ARITHMETIC       — integer cents. Never float dollars.
 *   ON THE WIRE / IN UI — dollars, because that is what a person types and reads.
 *
 * The conversion happens at the API route boundary and nowhere else. Keeping
 * the wire in dollars means client code and forms are unchanged and stay
 * correct; the route is the single place where the unit changes, so there is
 * one place to get right instead of forty.
 *
 * Why the columns were renamed rather than just retyped: Float and Int are both
 * `number` to TypeScript, so a missed caller would have compiled cleanly and
 * priced something at 100x. `annualFee` -> `annualFeeCents` makes every stale
 * reader a compile error. That is the only reason this migration is verifiable.
 */

/** Dollars (as typed by a person, or a numeric string from a form) -> integer cents. */
export function dollarsToCents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Round, never truncate: 49.99 must become 4999, not 4998.
  return Math.round(n * 100);
}

/** Same, but for a column that is NOT NULL — null/blank becomes 0. */
export function dollarsToCentsOr0(v: number | string | null | undefined): number {
  return dollarsToCents(v) ?? 0;
}

/** Integer cents -> dollars, for the wire and the UI. */
export function centsToDollars(c: number | null | undefined): number | null {
  return c === null || c === undefined ? null : c / 100;
}

/** Same, but never null — for NOT NULL columns. */
export function centsToDollarsOr0(c: number | null | undefined): number {
  return (c ?? 0) / 100;
}

/** "$1,234.50" from integer cents. Null renders as an em dash, never NaN. */
export function fmtCents(c: number | null | undefined): string {
  if (c === null || c === undefined) return '—';
  return '$' + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

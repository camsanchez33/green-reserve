// ADMIN-C Money → Disputes: "do our numbers match Stripe?", month by month.
// Our side is the fees on rounds we recorded as paid, placed by paidAt — the
// Overview headline's basis; Stripe's side is the application fees on the
// platform balance in the same window (lib/platform-stripe). Calendar months
// in UTC, the same clock /api/admin/revenue uses for "month to date".

export type MonthWindow = { label: string; start: Date; end: Date };

/** The last `n` complete calendar months before `now`, newest first. */
export function lastFullMonths(now: Date, n: number): MonthWindow[] {
  const out: MonthWindow[] = [];
  for (let i = 1; i <= n; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    out.push({ label: start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }), start, end });
  }
  return out;
}

/** Within a dollar counts as a match (rounding at the edges), as on the period check. */
export function matchResult(ourCents: number, stripeCents: number | null): 'match' | 'off' | 'unknown' {
  if (stripeCents === null) return 'unknown';
  return Math.abs(ourCents - stripeCents) < 100 ? 'match' : 'off';
}

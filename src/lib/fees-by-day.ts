// ADMIN-C Money → Overview chart: fees per day through a period and through
// the period before it, day 0 = each window's first day so the two lines
// overlay. A window's series is as long as the window (the prior one capped at
// the current one's length) — never filled forward past where it stops.
// Amounts stay in cents; the caller converts at the edge.

const DAY = 86_400_000;

export type Window = { start: Date; end: Date };

export function feesByDay(rows: { paidAt: Date | null; cents: number }[], current: Window, prior: Window): { current: number[]; prior: number[] } {
  const len = (w: Window) => Math.max(1, Math.ceil((w.end.getTime() - w.start.getTime()) / DAY));
  const cur = Array(len(current)).fill(0) as number[];
  const pri = Array(Math.min(cur.length, len(prior))).fill(0) as number[];
  const put = (arr: number[], w: Window, t: number, cents: number) => {
    if (t < w.start.getTime() || t >= w.end.getTime()) return false;
    const i = Math.floor((t - w.start.getTime()) / DAY);
    if (i < arr.length) arr[i] += cents;
    return true;
  };
  for (const r of rows) {
    if (!r.paidAt) continue;
    const t = r.paidAt.getTime();
    if (!put(cur, current, t, r.cents)) put(pri, prior, t, r.cents);
  }
  return { current: cur, prior: pri };
}

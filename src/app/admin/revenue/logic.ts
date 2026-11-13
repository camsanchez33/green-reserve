// Revenue page's pure rules, kept apart so scripts/admin-revenue-test.ts can pin them: which query a period asks,
// whether an answer is really the period asked for, when a percentage is honest, and what a course's payout
// state says. No React, no fetch.

export type Per = 'month' | 'last' | 'd30' | 'year';

/** The route's own period kinds (Build's revenue data, claude/build-revenue-data). */
export const KIND: Record<Per, string> = { month: 'month', last: 'last_month', d30: '30d', year: 'year' };

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => ymd(new Date(Date.parse(day + 'T00:00:00Z') + n * DAY));

/** The older route's window for a period: mtd, or a custom UTC window compared with the same number of days before. */
export function fallbackWindow(per: Per, now = new Date()): { kind: 'mtd' } | { kind: 'custom'; from: string; to: string } {
  const today = ymd(now);
  if (per === 'month') return { kind: 'mtd' };
  if (per === 'd30') return { kind: 'custom', from: addDays(today, -29), to: today };
  if (per === 'year') return { kind: 'custom', from: `${today.slice(0, 4)}-01-01`, to: today };
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { kind: 'custom', from: ymd(first), to: ymd(last) };
}
export function fallbackQuery(per: Per, now = new Date()): string {
  const w = fallbackWindow(per, now);
  return w.kind === 'mtd' ? 'period=mtd' : `period=custom&from=${w.from}&to=${w.to}`;
}

/** An answer to the new query counts only if it names the kind asked for (a route that defaulted to another
 *  period must never be shown under this period's name). */
export function isNewAnswer(per: Per, period: { kind: string } | undefined, hasSeries: boolean): boolean {
  return hasSeries && period?.kind === KIND[per];
}
/** An answer to the fallback query counts only if it is exactly the window asked for. */
export function isFallbackAnswer(per: Per, period: { kind: string; from: string; to: string } | undefined, now = new Date()): boolean {
  if (!period) return false;
  const w = fallbackWindow(per, now);
  return w.kind === 'mtd' ? period.kind === 'mtd' : period.kind === 'custom' && period.from === w.from && period.to === w.to;
}

/** Change as a percentage, or null when there's nothing honest to say: no prior, or a prior at or below zero
 *  (fees given back can make a period negative, and a percentage across that flips its sign). */
export function pct(cur: number, prior: number): number | null {
  return prior <= 0 ? null : ((cur - prior) / prior) * 100;
}

export type PayoutState = { label: string; tone: 'bad' | 'warn' } | null;
/** What a course's payout state at Stripe says. Only paused payouts are "not paid"; a course Stripe wants
 *  information from is still paid, and one Stripe didn't answer for is unknown. null = paying out normally. */
export function payoutState(c: { error: string | null; payoutsEnabled: boolean; needsInfo: boolean }): PayoutState {
  if (c.error) return { label: "Stripe didn't answer", tone: 'warn' };
  if (!c.payoutsEnabled) return { label: 'Payouts paused', tone: 'bad' };
  if (c.needsInfo) return { label: 'Needs information', tone: 'warn' };
  return null;
}

/** Whether the period is over. On Build's route only Last month is (its elapsedDays counts today, so the last day of
 *  a running month is not over yet); on the older route, a window that ended before today. */
export function periodDone(per: Per, ledger: boolean, to: string, today: string): boolean {
  return ledger ? per === 'last' : to < today;
}

/** The chart sentence's numbers. On Build's route they are the Revenue card's own (prior to the same point), so the
 *  sentence never contradicts the card; on the older route, the running series at the same day (or the whole prior
 *  period once over). */
export function chartSummary(series: { current: number[]; prior: number[] }, done: boolean, card?: { cents: number; priorCents: number }): { total: number; ahead: number } {
  if (card) return { total: card.cents / 100, ahead: (card.cents - card.priorCents) / 100 };
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const total = sum(series.current);
  const prior = done ? sum(series.prior) : sum(series.prior.slice(0, series.current.length));
  return { total, ahead: total - prior };
}

/** The revenue goal (Build's revenueGoal on GET ?period=month, owner only). */
export interface RevenueGoal { month: string; targetCents: number | null; progressCents: number; dayOfPeriod: number; daysInPeriod: number }

/** The route sent a usable goal block. */
export const isGoal = (v: unknown): v is RevenueGoal => {
  const x = v as RevenueGoal | null;
  const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return !!x && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.month) && fin(x.progressCents) && fin(x.dayOfPeriod) && fin(x.daysInPeriod) && x.daysInPeriod > 0
    && (x.targetCents === null || (fin(x.targetCents) && x.targetCents > 0));
};

/** "$4,000" or "4000.50" → cents; commas only as thousands groups; anything that isn't above zero and up to $20M → null. */
export function parseGoalCents(s: string): number | null {
  const t = s.trim().replace(/^\$/, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(parseFloat(t.replace(/,/g, '')) * 100);
  return c > 0 && c <= 2_000_000_000 ? c : null;
}

/** The goal bar's fill: never below empty (a negative month: more given back than taken) nor past full. */
export const fillPct = (progress: number, target: number) => Math.max(0, Math.min(100, (progress / target) * 100));

// Business analytics (ADMIN-REDO, Cam approved the mockup 2026-11-12): the page's pure rules. Every figure is the
// route's (GET /api/admin/business, Build's) — counted, never estimated; the page only compares, scales and exports.
// Run: npx tsx scripts/admin-business-test.ts

export type Per = 'y12' | 'm6' | 'm3' | 'ytd';
export const PERIODS: { v: Per; label: string; vs: string }[] = [
  { v: 'y12', label: 'Last 12 months', vs: 'the 12 months before' },
  { v: 'm6', label: 'Last 6 months', vs: 'the 6 months before' },
  { v: 'm3', label: 'Last 3 months', vs: 'the 3 months before' },
  { v: 'ytd', label: 'This year', vs: 'last year by today' },
];

export type StepKey = 'reached' | 'responded' | 'calls' | 'signed' | 'built' | 'live';
export const STEP_LABEL: Record<StepKey, string> = {
  reached: 'Reached out', responded: 'Responded', calls: 'Calls held', signed: 'Signed', built: 'Built', live: 'Live',
};

export interface BusinessData {
  period: { kind: string; from: string; to: string; priorFrom: string; priorTo: string };
  cards: {
    liveCourses: { now: number; prior: number | null };
    onlineBookings: { count: number; prior: number | null };
    teeSheetFill: { pct: number | null; prior: number | null };
  };
  months: { month: string; partial: boolean; online: number; counter: number }[];
  value: {
    onlineGreenFeesCents: number;
    afterHours: { count: number; pctOfOnline: number | null } | null;
    paidBeforeArrival: { count: number; cents: number }; // the course's share, our fee taken out
    noShowLateFeesCents: number;
  };
  joining: {
    // In Cam's order (Built before Signed). Responded's fromPrevPct is the share of outbound courses that replied; its count
    // also holds inbound inquiries, which start there. avgDaysAtStep is null for Live and where no course has both dates.
    steps: { key: StepKey; count: number | null; fromPrevPct?: number | null; avgDaysAtStep: number | null }[];
    entered?: number;
    reachedToLive: { pct: number | null; avgDays: number | null };
    inProgress: number;
    waitingOnUs: number;
  };
  courses: { courseId: string; name: string; online: number; onlinePrior: number | null; fillPct: number | null; onlineSharePct: number | null; ourRevenueCents: number | null }[]; // ourRevenueCents null without the Money area
}

/** The route answered the period asked for, with the parts the page reads. */
export function isAnswer(per: Per, d: unknown): d is BusinessData {
  const x = d as BusinessData | null;
  const obj = (v: unknown) => !!v && typeof v === 'object';
  // Deep enough that the page never throws on a part it reads (no error boundary catches a render crash here).
  return !!x && x.period?.kind === per && Array.isArray(x.months) && Array.isArray(x.courses) && obj(x.cards) && obj(x.value) && obj(x.joining)
    && Array.isArray(x.joining.steps) && obj(x.cards.liveCourses) && obj(x.cards.onlineBookings) && obj(x.cards.teeSheetFill)
    && obj(x.value.paidBeforeArrival) && obj(x.joining.reachedToLive);
}

/** A percentage change, or null when there is nothing to compare with (never drawn across a zero or negative prior). */
export const pct = (now: number | null, was: number | null): number | null =>
  now === null || was === null || was <= 0 ? null : ((now - was) / was) * 100;
/** A fill rate moves in points, not in percent of a percent. */
export const points = (now: number | null, was: number | null): number | null => (now === null || was === null ? null : now - was);

/** One step's share of the step before it: the route's fromPrevPct when sent (Responded counts inbound too, so only the
 *  route can say what share replied), else counted here; null for the first step or across a missing or zero count. */
export function stepRate(steps: { count: number | null; fromPrevPct?: number | null }[], i: number): number | null {
  if (steps[i] && steps[i].fromPrevPct !== undefined) return steps[i].fromPrevPct ?? null; // the route's own rate wins
  if (i === 0) return null;
  const a = steps[i - 1]?.count, b = steps[i]?.count;
  return a && b !== null && b !== undefined ? (b / a) * 100 : null;
}

/** The bar chart's scale: a round step (100 · 250 · 500 · 1k …) and a top a little above the tallest bar. */
export function barScale(totals: number[]): { step: number; max: number } {
  const top = Math.max(0, ...totals);
  if (top <= 0) return { step: 1, max: 4 };
  const raw = (top * 1.15) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(s => s >= raw) ?? 10 * mag;
  return { step, max: Math.ceil((top * 1.15) / step) * step };
}

/** "Nov" (and "Nov*" for the running month); "Dec 2025" style only when asked. */
export function monthLabel(month: string, partial: boolean, withYear = false): string {
  const base = new Date(month + '-15T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return partial ? `${base}*` : base;
}

/** "1.5k" on the axis, plain under 1,000. */
export const axisLabel = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));

/** A CSV cell: quoted, inner quotes doubled, and a leading = + - @ written as text so a spreadsheet never runs it. */
export const cell = (v: string | number) => {
  const s = String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};
const blank = (v: number | null, f: (n: number) => string) => (v === null ? '' : f(v));
/** The courses table as a CSV, in the table's order. */
export function coursesCsv(rows: BusinessData['courses'], withRevenue = true): string {
  const head = ['Course', 'Online bookings', 'Online bookings before', 'Tee sheet filled %', 'Booked online %', ...(withRevenue ? ['Our revenue'] : [])];
  const body = rows.map(r => [r.name, r.online, blank(r.onlinePrior, String), blank(r.fillPct, n => n.toFixed(1)), blank(r.onlineSharePct, n => n.toFixed(1)), ...(withRevenue ? [blank(r.ourRevenueCents, c => (c / 100).toFixed(2))] : [])]);
  return [head, ...body].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

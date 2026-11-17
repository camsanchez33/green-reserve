// ANALYTICS-5 (Cam 2026-11-17, approved mockup lanes/dashboard/analytics-mockup.html; lanes/dashboard.md "Next" 5):
// what the Analytics page reads, as the routes return it. Fields marked "Build" are the additive ones asked of the
// Build lane (projections, no-shows by how they booked, spots filled again, stock value, written reports, the
// ledger's dashed "before" line). Until a route sends one, the part that needs it stays hidden: never filled in.
import type { Analytics } from '@/lib/analytics';
import type { ShopReport } from '@/lib/shop-report';

export type Range = { from: string; to: string };

export type Headline = {
  collectedCents: number; expectedCents: number; fillPct: number | null; lostCents: number; noShowPct: number | null; cancelPct: number | null;
  customers: number; returningPct: number | null; bookings: number; avgLeadDays: number | null; roundsPlayed?: number; perRoundCents?: number | null;
};
/** Build: bookings per bucket, the same definition as behavior.bookings. */
type SeriesRow = Analytics['revenue']['series'][number] & { bookings?: number };

/** Build: GET /api/operator/analytics/projections — the next 30 days against the last 30, and the week ahead. */
export type Projections = {
  today: string;
  last: { from: string; to: string; players: number; fillPct: number | null; revenueCents?: number | null };
  next: { from: string; to: string; players: number; fillPct: number | null; revenueCents?: number | null };
  change: { playersPct: number | null; fillPts: number | null; revenuePct?: number | null };
  week: { date: string; offered: number; booked: number; usualByNow: number | null; expected: number; status: 'on_pace' | 'behind' | 'short_day' | 'no_history' }[];
};

/** Build: GET /api/operator/analytics/no-shows. lostValueCents is value lost at posted prices, not revenue. */
export type RefillKey = '7d_plus' | '2_7d' | '24_48h' | 'under_24h';
export type NoShowReport = {
  range: Range; lateCancelHours: number;
  totals: { bookings: number; noShows: number; ratePct: number | null; lostValueCents: number; recoveredCents: number; lateCancelLostValueCents: number; lateCancelRecoveredCents: number; netCents: number };
  byHow: { key: string; bookings: number; noShows: number; ratePct: number | null; lostValueCents: number; recoveredCents: number; netCents: number }[];
  refill: { buckets: { key: RefillKey; cancelledSpots: number; refilledSpots: number; pct: number | null }[]; under48hPct: number | null };
  lateCancels: { spots: number; lostValueCents: number; refilledSpots: number; refilledCents: number; feesCents: number; netCents: number };
};

export type Data = Omit<Analytics, 'revenue' | 'customers' | 'behavior'> & {
  revenue: Omit<Analytics['revenue'], 'series'> & { series: SeriesRow[] };
  behavior: Analytics['behavior'] & {
    /** Build: share of twilight and standard player spots sold. */
    spotsSold?: { twilightPct: number | null; standardPct: number | null };
  };
  customers: Omit<Analytics['customers'], 'topByRounds'> & {
    topByRounds: (Analytics['customers']['topByRounds'][number] & { membership?: string; lastPlayed?: string })[];
    /** Build: golfers and rounds by membership, season pass and public. */
    byMembership?: { name: string; kind: 'membership' | 'pass' | 'public'; golfers: number; rounds: number; sharePct: number | null }[];
  };
  /** Build: the ledger's money for these dates and the same length before (money.payments logins). */
  ledger?: {
    range: Range; grossCents: number; refundsCents: number; netCents: number; series: { key: string; cents: number }[];
    before: { range: Range; grossCents: number; series: { key: string; cents: number }[] };
    /** Asked of Build: how the money in was paid, as the Revenue page's. */
    paid?: { onlineCents: number; readerCents: number; cashCents: number; otherCents: number };
  };
  headline: Headline;
  compare: { range: Range; headline: Headline; series?: SeriesRow[] } | null;
};

/** The page's one view of the ledger: Build's `ledger` block, or the Revenue page's money/sales `all` until it exists. */
export type Ledger = {
  grossCents: number; beforeGrossCents: number;
  series: { key: string; cents: number }[];
  beforeSeries: { key: string; cents: number }[] | null;
  paid: { onlineCents: number; readerCents: number; cashCents: number; otherCents: number } | null;
};
type SalesAll = { bucket: 'day' | 'week'; grossCents: number; beforeGrossCents: number; paid: Ledger['paid']; series: { key: string; cents: number }[] };
export type SalesReply = { today: string; all?: SalesAll };
export const ledgerOf = (L: NonNullable<Data['ledger']>): Ledger => ({
  grossCents: L.grossCents, beforeGrossCents: L.before.grossCents, series: L.series,
  beforeSeries: L.before.series.length === L.series.length ? L.before.series : null, paid: L.paid ?? null,
});
export const ledgerOfSales = (a: SalesAll): Ledger => ({ grossCents: a.grossCents, beforeGrossCents: a.beforeGrossCents, series: a.series, beforeSeries: null, paid: a.paid });

export type Shop = Omit<ShopReport, 'totals' | 'categories'> & {
  totals: ShopReport['totals'] & { transactions?: number };
  categories: (ShopReport['categories'][number] & { beforeSalesCents?: number })[];
  /** Build: the ledger's shop money for these dates — the "Shop revenue" figure. */
  ledgerSalesCents?: number;
  /** Build: stock on hand, and what hasn't sold in `staleDays`. */
  stock?: { units: number; retailValueCents: number; costValueCents?: number; uncountedItems: number; staleDays: number; notSellingRetailCents: number; notSellingCostCents?: number;
    notSelling: { id: string; name: string; inStock: number; retailValueCents: number; costValueCents?: number; lastSoldAt: string | null }[] };
};

/** BI-1's monthly review (GET /api/operator/monthly-reviews); `byArea` only when the stored review has it. */
export type Review = {
  month: string; label: string; isBaseline: boolean; thin: boolean; writtenAt: string;
  review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[]; byArea?: { area: string; thisMonth: string; lastMonth: string; change: string }[] };
};

// ── Formatting ────────────────────────────────────────────────────────────────
export const usd = (c: number) => `${c < 0 ? '−' : ''}$${Math.round(Math.abs(c) / 100).toLocaleString('en-US')}`;
export const usd2 = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Money lost: red, with a minus. */
export const lost = (c: number) => `−$${Math.round(Math.abs(c) / 100).toLocaleString('en-US')}`;
/** Money recovered: green, with a plus. */
export const gained = (c: number) => `+$${Math.round(Math.abs(c) / 100).toLocaleString('en-US')}`;
export const signed = (c: number) => (c < 0 ? lost(c) : gained(c));
export const pct = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p)}%`);
export const pct1 = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p * 10) / 10}%`);
export const num = (n: number) => n.toLocaleString('en-US');

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
export const dayShort = (d: string) => { const x = at(d); return `${MO[x.getUTCMonth()]} ${x.getUTCDate()}`; };
export const dayWeek = (d: string) => { const x = at(d); return `${WD[x.getUTCDay()]} ${MO[x.getUTCMonth()]} ${x.getUTCDate()}`; };
export const isWeekend = (d: string) => { const w = at(d).getUTCDay(); return w === 0 || w === 6; };
export const addDays = (d: string, n: number) => { const x = at(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const hourShort = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
export const hourLong = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
export const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
/** "Oct 17 – Nov 16" */
export const periodText = (r: Range) => (r.from === r.to ? dayShort(r.from) : `${dayShort(r.from)} – ${dayShort(r.to)}`);

/** The change against the period before, worded for the tiles: "+12%", "−4 pts". */
export function change(now: number | null | undefined, before: number | null | undefined, unit: 'pct' | 'pts'): { text: string; up: boolean } | null {
  if (now == null || before == null) return null;
  if (unit === 'pts') { const d = Math.round(now - before); return d === 0 ? { text: 'Same', up: true } : { text: `${d > 0 ? '+' : '−'}${Math.abs(d)} pt${Math.abs(d) === 1 ? '' : 's'}`, up: d > 0 }; }
  if (before === 0) return null;
  const d = Math.round(((now - before) / before) * 100);
  return d === 0 ? { text: 'Same', up: true } : { text: `${d > 0 ? '+' : '−'}${Math.abs(d)}%`, up: d > 0 };
}

/** The default snapshot: the last 30 whole days, ending yesterday. */
export const lastMonth = (today: string): Range => ({ from: addDays(today, -30), to: addDays(today, -1) });
/** The last three whole calendar months, newest first. */
export function pastMonths(today: string, n = 3): { label: string; range: Range }[] {
  const out: { label: string; range: Range }[] = [];
  const [y, m] = today.split('-').map(Number);
  for (let i = 1; i <= n; i++) {
    const s = new Date(Date.UTC(y, m - 1 - i, 1)), e = new Date(Date.UTC(y, m - i, 0));
    out.push({ label: `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][s.getUTCMonth()]} ${s.getUTCFullYear()}`, range: { from: s.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) } });
  }
  return out;
}

/** CSV out of the browser; formula-looking text is defused for spreadsheets. */
export function downloadCsv(name: string, rows: (string | number | null)[][]): boolean {
  if (rows.length < 2) return false;
  const esc = (v: string | number | null) => { const t = v == null ? '' : String(v); const safe = typeof v === 'string' && /^[=+\-@]/.test(t) ? `'${t}` : t; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  return true;
}

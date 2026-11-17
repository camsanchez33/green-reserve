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

/** Build: the next 30 days against the last 30, and the next 7 day by day. */
export type Projection = {
  rounds: number; roundsLast30: number; fillPct: number | null; fillPctLast30: number | null;
  /** Ledger basis, money.payments only. */
  revenueCents?: number; revenueLast30Cents?: number;
  days: { date: string; booked: number; expected: number; usual: number | null; closesAt?: string | null }[];
};
export type ChannelRow = { label: string; bookings: number; noShows: number; ratePct: number | null; lostCents: number; recoveredCents: number | null; netCents: number };
export type RefillLead = '7d+' | '2-7d' | '24-48h' | 'under24h';

export type Data = Omit<Analytics, 'revenue' | 'noShows' | 'cancellations' | 'customers' | 'behavior'> & {
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
  noShows: Analytics['noShows'] & {
    /** Build, ledger basis. */
    money?: { lostCents: number; feesRecoveredCents: number; lateCancelLostCents: number; netCents: number };
    byChannel?: ChannelRow[]; byChannelAll?: ChannelRow; couldRecoverCents?: number;
  };
  cancellations: Analytics['cancellations'] & {
    /** Build: a spot counts as refilled when the same tee time gets a new booking after the cancel. */
    refill?: { cutoffHours: number; rows: { lead: RefillLead; cancelled: number; filled: number; filledPct: number | null }[] };
    late?: { spots: number; lostCents: number; refilledSpots: number; refilledCents: number; feesCents: number; netCents: number };
  };
  /** Build. */
  projection?: Projection;
  headline: Headline;
  compare: { range: Range; headline: Headline; series?: SeriesRow[] } | null;
};

/** The ledger's money for these dates (the Revenue page's `all`), read from /api/operator/money/sales. */
export type Ledger = {
  bucket: 'day' | 'week'; grossCents: number; beforeGrossCents: number;
  segments: { shopCents: number; fnbCents: number };
  paid: { onlineCents: number; readerCents: number; cashCents: number; otherCents: number };
  series: { key: string; cents: number }[];
  /** Build: the same length of time just before, same keys count and bucket. */
  beforeSeries?: { key: string; cents: number }[];
};
export type SalesReply = { today: string; all?: Ledger };

export type Shop = Omit<ShopReport, 'totals' | 'categories'> & {
  totals: ShopReport['totals'] & { transactions?: number };
  categories: (ShopReport['categories'][number] & { beforeSalesCents?: number })[];
  /** Build: stock on hand, and what hasn't sold in 60+ days. */
  stock?: { valueCents: number; staleValueCents: number; stale: { name: string; inStock: number; valueCents: number; lastSold: string | null }[] };
};

/** BI-1's monthly review; `report` and `pdfUrl` are Build's written report. */
export type Review = {
  month: string; label: string; isBaseline: boolean; thin: boolean; writtenAt: string;
  review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] };
  report?: { sections: { heading: string; paragraphs: { lead?: string; text: string }[] }[]; byArea?: { area: string; thisMonth: string; lastMonth: string; change: string; good: boolean }[]; forecast?: string };
  pdfUrl?: string;
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

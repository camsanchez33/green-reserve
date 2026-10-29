'use client';
// DENSE-1 (DENSE_UI_SPEC.md, Cam 2026-10-27: "too much words on the pages … think
// Stripe, Toast"): lots of data, almost no sentences. Top to bottom:
//   1. Analytics + ONE sentence built from the numbers; the date button.
//   2. The four headline numbers (Revenue, Tee sheet filled, Rounds played, Per
//      round). Picking one plots it below against the period before (dashed).
//   3. Eight more numbers, each label · value · change; each opens its tab.
//   4. "What to look at": one line each, with the button that acts on it.
//   5. The monthly review, one line until there is one.
//   6. The detail behind tabs.
// A number's definition sits behind its dotted label (lib/analytics-terms.ts) —
// never as a sentence under it. Every number still comes from lib/analytics.ts
// (AN-1). Charts are plain HTML/CSS/SVG — no chart library.
import { useCallback, useEffect, useId, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { toast } from '@/components/dashboard/Toast';
import { Loader2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import DateRangeButton, { type DateRange } from '@/components/dashboard/DateRangeButton';
import { dfetch } from '@/lib/dashboard-fetch';
import { askBirdie, useBirdieReady } from '@/lib/birdie/ask';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import type { PermissionKey } from '@/lib/staff-permissions';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { TERMS, type TermKey } from '@/lib/analytics-terms';
import type { Analytics } from '@/lib/analytics';

type Headline = { collectedCents: number; expectedCents: number; fillPct: number | null; lostCents: number; noShowPct: number | null; cancelPct: number | null; customers: number; returningPct: number | null; bookings: number; avgLeadDays: number | null; roundsPlayed?: number; perRoundCents?: number | null };
type SeriesRow = Analytics['revenue']['series'][number];
type Data = Analytics & { headline: Headline; compare: { range: { from: string; to: string }; headline: Headline; series?: SeriesRow[] } | null };
type Tab = 'revenue' | 'busy' | 'misses' | 'golfers' | 'booking';
type Metric = 'revenue' | 'fill' | 'rounds' | 'perRound';

const usd = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (p: number | null | undefined) => p == null ? '—' : `${Math.round(p)}%`;
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtWeekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const DAY_NAME: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const spanDays = (r: { from: string; to: string }) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  if (rows.length === 0) { toast('Nothing to download — this is empty for the dates you picked.', 'warn'); return; }
  const esc = (v: string | number | null) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[header, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast(`Downloaded ${name}.csv (${rows.length} row${rows.length === 1 ? '' : 's'}).`, 'ok');
}

/** A label whose definition sits behind it: dotted underline, shown on hover, focus or tap. */
function Term({ k, children, className = '' }: { k: TermKey; children: React.ReactNode; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block group">
      <button type="button" aria-describedby={id} onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); (e.currentTarget as HTMLElement).blur(); } }}
        className={'text-left underline decoration-dotted decoration-line-strong underline-offset-4 hover:decoration-ink-muted ' + className}>{children}</button>
      <span role="tooltip" id={id}
        className={(open ? 'block ' : 'hidden ') + 'group-hover:block group-focus-within:block absolute left-0 top-full mt-1.5 z-20 w-64 rounded-md bg-ink text-white text-[12.5px] font-normal leading-snug px-3 py-2 shadow-card'}>{TERMS[k]}</span>
    </span>
  );
}

/** The change against the period before. */
function changeOf(now: number | null | undefined, prev: number | null | undefined, unit: 'pct' | 'pts' | 'usd' | 'num'): { n: number; up: boolean; text: string } | null {
  if (now == null || prev == null) return null;
  const diff = now - prev;
  if (unit === 'pct' && prev === 0) return now === 0 ? { n: 0, up: false, text: 'same' } : { n: 1, up: now > 0, text: 'from 0' };
  const n = unit === 'pct' ? Math.abs(Math.round((diff / prev) * 100)) : unit === 'num' ? Math.abs(Math.round(diff * 10) / 10) : Math.abs(Math.round(diff));
  if (n === 0) return { n: 0, up: false, text: 'same' };
  const text = unit === 'pts' ? `${n} pt${n === 1 ? '' : 's'}` : unit === 'usd' ? usd2(n) : unit === 'num' ? String(n) : `${n}%`;
  return { n, up: diff > 0, text };
}

function Delta({ now, prev, unit, goodWhenUp = true }: { now: number | null | undefined; prev: number | null | undefined; unit: 'pct' | 'pts' | 'usd' | 'num'; goodWhenUp?: boolean }) {
  const c = changeOf(now, prev, unit);
  if (!c) return <span className="text-ink-muted">No earlier period</span>;
  if (c.n === 0) return <span className="text-ink-muted">Same as before</span>;
  return <span className={'font-semibold ' + (c.up === goodWhenUp ? 'text-ok' : 'text-bad')}>{c.up ? '↑' : '↓'} {c.text}</span>;
}

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return <div className="flex-1 h-2.5 bg-line-soft rounded-full overflow-hidden"><div className="h-full rounded-full bg-pine" style={{ width: `${w}%` }} /></div>;
}

function BarRow({ label, value, max, right, labelW = 'w-24', hint }: { label: string; value: number; max: number; right: string; labelW?: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]" title={hint}>
      <span className={labelW + ' shrink-0 text-ink'}>{label}</span>
      <Bar value={value} max={max} />
      <span className="w-14 shrink-0 text-right tabular-nums font-semibold text-ink">{right}</span>
    </div>
  );
}

function Line({ label, value, sub, strong }: { label: React.ReactNode; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-4 py-2 text-[13.5px] ' + (strong ? 'font-semibold' : '')}>
      <span className="text-ink">{label}{sub && <span className="ml-2 text-[12.5px] font-normal text-ink-muted tabular-nums">{sub}</span>}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** "Ask the assistant" — shown only once the assistant is on, so it never does nothing. */
function Ask({ q, children = 'Ask' }: { q: string; children?: React.ReactNode }) {
  const on = useBirdieReady();
  if (!on) return null;
  return <button onClick={() => askBirdie(q)} className="shrink-0 text-[12.5px] font-medium text-pine hover:underline underline-offset-4">{children}</button>;
}

/** One block of a tab: a title whose meaning sits behind it, then the detail. */
function Section({ title, term, children, action }: { title: string; term: TermKey; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h3 className="text-[15px] font-semibold text-ink"><Term k={term}>{title}</Term></h3>
        {action && <div className="flex items-baseline gap-4">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Download({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="shrink-0 text-[12.5px] font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line-strong">CSV</button>;
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-[13px] text-ink-muted py-2">{empty}</p>;
  return (
    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white"><tr className="text-left">{head.map((h, i) => <th key={h} className={'py-2 pr-4 text-[12.5px] font-semibold text-ink border-b border-line ' + (i > 0 ? 'text-right' : '')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line-soft">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={'py-2 pr-4 tabular-nums ' + (j > 0 ? 'text-right' : 'text-ink')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** A small figure inside a tab: label, number, and only data under it. */
function Fig({ label, value, sub, term }: { label: string; value: string; sub?: string; term?: TermKey }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-ink">{term ? <Term k={term}>{label}</Term> : label}</div>
      <div className="text-[24px] font-semibold tabular-nums mt-1 text-ink">{value}</div>
      {sub && <div className="text-[12.5px] text-ink-muted mt-1 tabular-nums">{sub}</div>}
    </div>
  );
}

const busiestDay = (d: Data) => [...d.utilization.byDow].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (b.fillPct ?? 0) - (a.fillPct ?? 0))[0];
const quietestDay = (d: Data) => [...d.utilization.byDow].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (a.fillPct ?? 0) - (b.fillPct ?? 0))[0];
const busiestHour = (d: Data) => [...d.utilization.byHour].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (b.fillPct ?? 0) - (a.fillPct ?? 0))[0];

/** The one line under "Analytics": what happened, from the numbers only. */
function summary(d: Data): string {
  if (d.behavior.bookings === 0 && d.revenue.collectedCents === 0) return 'No bookings in these dates yet.';
  const parts: string[] = [];
  const c = changeOf(d.headline.collectedCents, d.compare?.headline.collectedCents, 'pct');
  parts.push(`You took in ${usd(d.revenue.collectedCents)}${c && c.n > 0 ? `, ${c.up ? 'up' : 'down'} ${c.text}` : ''}`);
  const bd = busiestDay(d); const bh = busiestHour(d);
  if (bd && bh) parts.push(`${DAY_NAME[bd.dow] ?? bd.dow}s and ${fmtHour(bh.hour)} filled best`);
  return parts.join('. ') + '.';
}

type Note = { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string; go?: { label: string; href?: string; tab?: Tab }; ask: string };

/** "What to look at": one line of numbers this page already shows, and the button that acts on it. */
function insights(d: Data, can: (k: PermissionKey) => boolean, isOwner: boolean): Note[] {
  const out: Note[] = [];
  if (d.behavior.bookings === 0 && d.revenue.collectedCents === 0) return [];
  const qd = quietestDay(d); const bd = busiestDay(d);
  if (qd && bd && qd.dow !== bd.dow && (bd.fillPct ?? 0) - (qd.fillPct ?? 0) >= 15) out.push({
    tone: 'warn',
    text: `${DAY_NAME[qd.dow] ?? qd.dow}s ${pctS(qd.fillPct)} booked · ${DAY_NAME[bd.dow] ?? bd.dow}s ${pctS(bd.fillPct)}`,
    go: can('schedule.edit') ? { label: 'Set a price', href: '/dashboard/schedules' } : undefined,
    ask: `Why are ${DAY_NAME[qd.dow] ?? qd.dow}s my quietest day, and what could I try to fill them?`,
  });
  if (d.noShows.count > 0) {
    const repeat = d.noShows.repeat.slice(0, 3).map(r => r.name).join(', ');
    out.push({
      tone: 'bad',
      text: `${plural(d.noShows.count, 'no-show')} · ${pctS(d.noShows.ratePct)} of bookings${repeat ? ` · more than once: ${repeat}` : ''}`,
      // The cancellation policy is the owner's alone (settings route OWNER_ONLY_FIELDS).
      go: isOwner ? { label: 'No-show fee', href: '/dashboard/settings?section=Prices+%26+fees' } : undefined,
      ask: 'Who didn’t show up in these dates, and would a no-show fee help?',
    });
  }
  if (d.revenue.outstandingBookings > 0) out.push({
    tone: 'warn',
    text: `${usd(d.revenue.outstandingCents)} not paid · ${plural(d.revenue.outstandingBookings, 'group')}`,
    go: can('money.payments') ? { label: 'See them', href: '/dashboard/money?tab=payments&show=unpaid' } : undefined,
    ask: 'Which groups in these dates were never paid?',
  });
  if (d.cancellations.count > 0) out.push({
    tone: 'neutral',
    text: `${plural(d.cancellations.count, 'cancellation')}${d.cancellations.rebookedPct != null ? ` · ${pctS(d.cancellations.rebookedPct)} rebooked` : ''}`,
    go: { label: 'Details', tab: 'misses' },
    ask: 'How far ahead do golfers cancel, and is my cancellation window right?',
  });
  if (d.customers.goneQuiet.length > 0) out.push({
    tone: 'neutral',
    text: `${plural(d.customers.goneQuiet.length, 'regular')} gone quiet`,
    go: { label: 'Who', tab: 'golfers' },
    ask: 'Who used to come often but hasn’t been back?',
  });
  return out.slice(0, 5);
}

// BI-1 (PLATFORM_ROADMAP_SPEC §1): the monthly AI review. Its own fetch — it
// does not follow the date button. The words are the model's; the numbers in
// them were checked against lib/analytics.ts before the review was stored.
type Review = { month: string; label: string; isBaseline: boolean; thin: boolean; writtenAt: string; review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] } };

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">{items.map(i => <li key={i} className="text-[13.5px] text-ink leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-2 before:h-0.5 before:bg-fairway">{i}</li>)}</ul>
    </div>
  );
}

function MonthlyReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(-1);
  const load = useCallback(async () => {
    setError('');
    const res = await dfetch<{ reviews: Review[] }>('/api/operator/monthly-reviews');
    if (res.ok) setReviews(res.data.reviews); else setError(res.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Card id="reviews" className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">Monthly review</h2>
        {reviews && reviews.length === 0 && <span className="text-[13px] text-ink-muted">First one after a full month</span>}
        {reviews && reviews.length > 0 && <span className="text-[12.5px] text-ink-muted">On the 1st of each month</span>}
      </div>
      {error && <div className="mt-3"><LoadError message={error} onRetry={load} /></div>}
      {!reviews && !error && <div className="py-3 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
      {reviews && reviews.length > 0 && (
        <div className="mt-2 divide-y divide-line-soft">
          {reviews.map((r, i) => (
            <div key={r.month} className="py-2">
              <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="w-full flex items-baseline justify-between gap-3 text-left">
                <span className="text-[14px] font-semibold text-ink">{r.label}{r.isBaseline ? <span className="ml-2 font-normal text-[12.5px] text-ink-muted">Starting line</span> : null}</span>
                <span className="text-[12.5px] font-medium text-pine">{open === i ? 'Hide' : 'Read'}</span>
              </button>
              {open !== i && <p className="text-[13px] text-ink-soft mt-0.5 line-clamp-1">{r.review.verdict}</p>}
              {open === i && (
                <div className="mt-2 max-w-[62em] pb-2">
                  <p className="text-[14px] text-ink leading-relaxed">{r.review.verdict}</p>
                  {r.thin && <p className="text-[12.5px] text-ink-muted mt-1">A quiet month: too few bookings to draw firm conclusions.</p>}
                  <ReviewList title="What went well" items={r.review.wentWell} />
                  <ReviewList title="Where you fell short" items={r.review.fellShort} />
                  <ReviewList title="What to try next" items={r.review.recommendations} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const METRICS: { key: Metric; label: string; term: TermKey }[] = [
  { key: 'revenue', label: 'Revenue', term: 'revenue' },
  { key: 'fill', label: 'Tee sheet filled', term: 'fill' },
  { key: 'rounds', label: 'Rounds played', term: 'rounds' },
  { key: 'perRound', label: 'Average per round', term: 'perRound' },
];
const pointOf = (r: SeriesRow, m: Metric): number | null =>
  m === 'revenue' ? r.collectedCents : m === 'fill' ? r.fillPct : m === 'rounds' ? r.rounds : r.perRoundCents;
const labelOf = (v: number | null, m: Metric) => v == null ? '—' : m === 'revenue' ? usd(v) : m === 'fill' ? pctS(v) : m === 'rounds' ? v.toLocaleString() : usd2(v);

/** The four headline numbers; the picked one is plotted against the period before. */
function Headline({ d, metric, setMetric }: { d: Data; metric: Metric; setMetric: (m: Metric) => void }) {
  const prev = d.compare?.headline;
  const values: Record<Metric, { value: string; delta: React.ReactNode }> = {
    revenue: { value: usd(d.revenue.collectedCents), delta: <Delta now={d.headline.collectedCents} prev={prev?.collectedCents} unit="pct" /> },
    fill: { value: pctS(d.utilization.fillPct), delta: <Delta now={d.headline.fillPct} prev={prev?.fillPct} unit="pts" /> },
    rounds: { value: d.revenue.roundsPlayed.toLocaleString(), delta: <Delta now={d.headline.roundsPlayed} prev={prev?.roundsPlayed} unit="pct" /> },
    perRound: { value: usd2(d.revenue.perRoundCents), delta: <Delta now={d.headline.perRoundCents} prev={prev?.perRoundCents} unit="usd" /> },
  };
  const cur = d.revenue.series;
  // Weekly buckets are calendar weeks, and the period before starts on a different
  // weekday, so its partial weeks fall at the other end: compare day by day only.
  const before = d.revenue.bucket === 'day' ? (d.compare?.series ?? []) : [];
  const pts = cur.map(r => pointOf(r, metric));
  const prevPts = before.map(r => pointOf(r, metric));
  const unpaid = metric === 'revenue' ? cur.map(r => Math.max(0, r.expectedCents - r.collectedCents)) : cur.map(() => 0);
  const max = Math.max(1, ...pts.map((v, i) => (v ?? 0) + unpaid[i]), ...prevPts.map(v => v ?? 0));
  const young = pts.filter(v => v != null && v > 0).length < 2;
  const per = d.revenue.bucket === 'week' ? 'Week of ' : '';
  const n = cur.length;
  const line = prevPts.length === n && n > 1
    ? prevPts.map((v, i) => `${((i + 0.5) / n) * 100},${100 - ((v ?? 0) / max) * 100}`).join(' ')
    : '';
  const m = METRICS.find(x => x.key === metric)!;

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-line-soft" role="tablist" aria-label="Plot">
        {METRICS.map((x, i) => (
          <div key={x.key} className={'min-w-0 px-5 py-4 ' + (i ? 'border-l border-line-soft ' : '') + (metric === x.key ? 'bg-paper/70 shadow-[inset_0_-2px_0_var(--color-pine)]' : 'hover:bg-paper/40')}>
            <div className="text-[13.5px] font-semibold text-ink"><Term k={x.term}>{x.label}</Term></div>
            {/* The number is the control: picking it plots it below. */}
            <button type="button" role="tab" aria-selected={metric === x.key} onClick={() => setMetric(x.key)} className="block w-full text-left">
              <span className="sr-only">{x.label}: </span>
              <span className="block mt-1.5 text-[30px] leading-none font-semibold text-ink tabular-nums">{values[x.key].value}</span>
              <span className="block mt-2 text-[12.5px] tabular-nums">{values[x.key].delta}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2 text-[12.5px] text-ink-soft">
          <span className="flex flex-wrap gap-4">
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-pine inline-block" />{m.label}</span>
            {metric === 'revenue' && <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-line-strong inline-block" /><Term k="revenueChart">Played, not paid</Term></span>}
            {line && <span className="inline-flex items-center gap-1.5"><i className="w-3.5 border-t-2 border-dashed border-[#9AA89E] inline-block" />Period before</span>}
          </span>
          <span className="flex gap-4">
            <Ask q="Walk me through these numbers — what changed, and why?" />
            <Download onClick={() => downloadCsv(`analytics-${d.range.from}-${d.range.to}`, [per ? 'Week of' : 'Date', 'Revenue', 'Not collected (no-shows included)', 'Rounds', 'Per round', 'Filled %'], cur.map(r => [r.key, r.collectedCents / 100, Math.max(0, r.gapCents) / 100, r.rounds, r.perRoundCents == null ? null : r.perRoundCents / 100, r.fillPct]))} />
          </span>
        </div>
        {young ? (
          <div className="h-44 border-b border-line flex items-center justify-center text-[13px] text-ink-muted">Fills in after a few days of rounds</div>
        ) : (<>
          <div className="relative h-44 border-b border-line" role="img" aria-label={`${m.label} each ${per ? 'week' : 'day'}: ${cur.map((r, i) => `${fmtDay(r.key)} ${labelOf(pts[i], metric)}`).join(', ')}`}>
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {cur.map((r, i) => (
                <div key={r.key} className="flex-1 h-full flex flex-col justify-end relative group">
                  {unpaid[i] > 0 && <div className="w-full bg-line-strong/60 rounded-t-[3px] mb-[2px]" style={{ height: `${(unpaid[i] / max) * 100}%` }} />}
                  <div className={'w-full bg-pine ' + (unpaid[i] > 0 ? '' : 'rounded-t-[3px]')} style={{ height: `${((pts[i] ?? 0) / max) * 100}%` }} />
                  <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-white text-[11.5px] px-2 py-1 rounded-md hidden group-hover:block z-10 tabular-nums">
                    {per}{fmtDay(r.key)}: {labelOf(pts[i], metric)}{unpaid[i] > 0 ? ` · ${usd(unpaid[i])} not paid` : ''}{prevPts.length === n ? ` · before ${labelOf(prevPts[i], metric)}` : ''}
                  </div>
                </div>
              ))}
            </div>
            {line && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={line} fill="none" stroke="#9AA89E" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          <div className="flex justify-between text-[12px] text-ink-muted mt-1.5 tabular-nums">
            <span>{per}{fmtDay(cur[0].key)}</span><span>{per}{fmtDay(cur[n - 1].key)}</span>
          </div>
        </>)}
      </div>
    </Card>
  );
}

/** Eight more numbers: label · value · change. The value opens the tab its rows are in (P3). */
function MoreNumbers({ d, open }: { d: Data; open: (t: Tab) => void }) {
  const p = d.compare?.headline;
  const h = d.headline;
  const cells: { label: string; term: TermKey; value: string; delta: React.ReactNode; tab: Tab }[] = [
    { label: 'Bookings', term: 'bookings', value: h.bookings.toLocaleString(), delta: <Delta now={h.bookings} prev={p?.bookings} unit="pct" />, tab: 'booking' },
    { label: 'Golfers', term: 'golfers', value: h.customers.toLocaleString(), delta: <Delta now={h.customers} prev={p?.customers} unit="pct" />, tab: 'golfers' },
    { label: 'Came back', term: 'cameBack', value: pctS(h.returningPct), delta: <Delta now={h.returningPct} prev={p?.returningPct} unit="pts" />, tab: 'golfers' },
    { label: 'Booked ahead', term: 'bookedAhead', value: h.avgLeadDays == null ? '—' : `${h.avgLeadDays} days`, delta: <Delta now={h.avgLeadDays} prev={p?.avgLeadDays} unit="num" />, tab: 'booking' },
    { label: 'No-shows', term: 'noShows', value: pctS(h.noShowPct), delta: <Delta now={h.noShowPct} prev={p?.noShowPct} unit="pts" goodWhenUp={false} />, tab: 'misses' },
    { label: 'Cancellations', term: 'cancellations', value: pctS(h.cancelPct), delta: <Delta now={h.cancelPct} prev={p?.cancelPct} unit="pts" goodWhenUp={false} />, tab: 'misses' },
    { label: 'Open spots', term: 'emptySpots', value: d.unfilled.openSpots.toLocaleString(), delta: <span className="text-ink-muted tabular-nums">{plural(d.unfilled.slots, 'tee time')}</span>, tab: 'busy' },
    { label: 'Rounds with a cart', term: 'cartRounds', value: pctS(d.revenue.beyond.cartPct), delta: <span className="text-ink-muted tabular-nums">{d.revenue.beyond.cartRounds} of {d.revenue.beyond.rounds}</span>, tab: 'revenue' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cells.map(c => (
        <Card key={c.label} className="px-4 py-3.5 min-w-0">
          <div className="text-[13px] text-ink-soft"><Term k={c.term}>{c.label}</Term></div>
          <button onClick={() => open(c.tab)} title={`Open ${c.label.toLowerCase()} detail`} className="mt-1 block text-[22px] font-semibold text-ink tabular-nums hover:text-pine">{c.value}</button>
          <div className="mt-1 text-[12px] tabular-nums">{c.delta}</div>
        </Card>
      ))}
    </div>
  );
}

function RevenueTab({ d }: { d: Data }) {
  const rangeBalls = Math.max(0, d.revenue.collectedCents - d.revenue.greenCents - d.revenue.cartCents);
  const r = d.revenue.rates;
  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="What it was for" term="whatFor">
          <div className="divide-y divide-line-soft">
            <Line label="Green fees" value={usd(d.revenue.greenCents)} />
            <Line label="Carts" value={usd(d.revenue.cartCents)} />
            {rangeBalls > 0 && <Line label="Range balls" value={usd(rangeBalls)} />}
            <Line label="Revenue" value={usd(d.revenue.collectedCents)} strong />
            {d.revenue.lateFeesKeptCents > 0 && <Line label="Late-cancel fees kept" value={usd(d.revenue.lateFeesKeptCents)} />}
          </div>
        </Section>
        <Section title="How golfers paid" term="howPaid">
          <div className="divide-y divide-line-soft">
            <Line label="By card" value={usd(d.revenue.cardCents)} />
            <Line label="At the counter" value={usd(d.revenue.counterCents)} />
            <Line label="Not paid yet" sub={plural(d.revenue.outstandingBookings, 'group')} value={usd(d.revenue.outstandingCents)} />
            <Line label="Per round" sub={plural(d.revenue.roundsPlayed, 'round')} value={usd2(d.revenue.perRoundCents)} />
            {d.revenue.perAvailableTeeTimeCents != null && <Line label="Per tee time offered" value={usd2(d.revenue.perAvailableTeeTimeCents)} />}
          </div>
        </Section>
      </div>

      {/* W2-8 (4): money beyond the green fee — its own line, never in revenue. */}
      <Section title="Beyond the green fee" term="beyond">
        <div className="divide-y divide-line-soft max-w-xl">
          <Line label="Rounds with a cart" sub={`${d.revenue.beyond.cartRounds} of ${d.revenue.beyond.rounds}`} value={pctS(d.revenue.beyond.cartPct)} />
          <Line label="Shop items on rounds" sub={d.revenue.beyond.shopPerRoundCents == null ? undefined : `${usd2(d.revenue.beyond.shopPerRoundCents)} per round`} value={usd(d.revenue.beyond.shopOnRoundsCents)} />
          <Line label="Walk-up shop sales" sub={plural(d.revenue.beyond.walkUpSales, 'sale')} value={usd(d.revenue.beyond.walkUpCents)} />
        </div>
      </Section>

      {/* W2-8 (2): what golfers paid against the price posted for their tee time. */}
      <Section title="Against your posted price" term="posted"
        action={r.rows.length > 0 ? <Download onClick={() => downloadCsv(`rate-vs-posted-${d.range.from}-${d.range.to}`, ['Rate', 'Players', 'Paid', 'Posted', '% of posted'], r.rows.map(x => [x.rate, x.players, x.paidCents / 100, x.postedCents / 100, x.ofPostedPct]))} /> : undefined}>
        {r.postedCents > 0 && (
          <div className="divide-y divide-line-soft max-w-xl mb-4">
            <Line label="Of posted price" value={pctS(r.ofPostedPct)} />
            <Line label={r.belowPostedCents >= 0 ? 'Below posted' : 'Above posted'} value={usd(Math.abs(r.belowPostedCents))} />
          </div>
        )}
        <Table head={['Rate', 'Players', 'Paid', 'Posted', 'Of posted']} empty="No paid rounds in these dates."
          rows={r.rows.map(x => [x.kind === 'member' ? `${x.rate} (member)` : x.rate, x.players, usd(x.paidCents), usd(x.postedCents), pctS(x.ofPostedPct)])} />
      </Section>

      <Section title="Coming up" term="comingUp">
        <div className="divide-y divide-line-soft max-w-xl">
          <Line label="Upcoming bookings" sub={plural(d.revenue.pipeline.upcomingBookings, 'booking')} value={usd(d.revenue.upcomingCents)} />
          {d.revenue.pipeline.cardOnFile.bookings - d.revenue.pipeline.cardOnFile.noCardRequired > 0 && <Line label="With a card saved" value={plural(d.revenue.pipeline.cardOnFile.bookings - d.revenue.pipeline.cardOnFile.noCardRequired, 'booking')} />}
          {d.revenue.pipeline.cardOnFile.noCardRequired > 0 && <Line label="Paying by link" value={plural(d.revenue.pipeline.cardOnFile.noCardRequired, 'booking')} />}
          {d.revenue.holdsHeldCents > 0 && <Line label="Cancellation holds taken" value={usd(d.revenue.holdsHeldCents)} />}
        </div>
      </Section>
    </div>
  );
}

function BusyTab({ d }: { d: Data }) {
  const emptiest = [...d.unfilled.rows].sort((a, b) => b.open - a.open || a.date.localeCompare(b.date)).slice(0, 12);
  // W2-8 (1): the same squares, shaded by what each hour EARNED per spot offered.
  const [earned, setEarned] = useState(false);
  const grid = earned ? d.utilization.earnedPerSpot : d.utilization.heatmap;
  const maxEarned = Math.max(1, ...d.utilization.earnedPerSpot.rows.flatMap(r => r.cells.map(c => c ?? 0)));
  const shade = (c: number) => earned ? (c / maxEarned) * 100 : c;
  const u = d.utilization;
  // W2-8 (5): the next two weeks against where the same days usually stand by now.
  const pace = u.pace.filter(p => p.offered > 0);
  const behind = pace.filter(p => p.usual != null && p.usual > 0 && p.booked < p.usual * 0.8);
  return (
    <div className="space-y-10">
      <Section title="The next two weeks" term="pace">
        <Table head={['Day', 'Booked so far', 'Usually by now', 'Spots offered']} empty="No tee times out for the next two weeks."
          rows={pace.map(p => [
            <span key="d" className="inline-flex items-center gap-2">{fmtWeekday(p.date)}{behind.includes(p) && <StatusDot status="warn" label="behind" />}</span>,
            p.booked, p.usual == null ? '—' : p.usual, p.offered,
          ])} />
      </Section>

      <Section title="When your tee sheet fills" term={earned ? 'heatEarned' : 'heatFull'}
        action={<><Ask q="Looking at when my tee sheet fills, which hours should I focus on filling?" /><Download onClick={() => downloadCsv(`${earned ? 'earned-per-spot' : 'how-full'}-${d.range.from}-${d.range.to}`, ['Day', ...grid.hours.map(h => `${h}:00`)], grid.rows.map(r => [r.dow, ...r.cells.map(c => c == null ? null : earned ? c / 100 : c)]))} /></>}>
        <div className="flex gap-1 mb-3 text-[12.5px]" role="group" aria-label="Show">
          {([[false, 'How full'], [true, 'Earned per spot']] as [boolean, string][]).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={earned === v} onClick={() => setEarned(v)}
              className={'px-2.5 py-1 rounded-md border ' + (earned === v ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:text-ink')}>{l}</button>
          ))}
        </div>
        {grid.hours.length === 0 ? <p className="text-[13px] text-ink-muted">No tee times in these dates.</p> : (
          <div className="overflow-x-auto">
            <table className="text-[12px] tabular-nums">
              <thead><tr><th />{grid.hours.map(h => <th key={h} className="px-0.5 pb-1 font-medium text-ink-muted">{fmtHour(h)}</th>)}</tr></thead>
              <tbody>{grid.rows.map(r => (
                <tr key={r.dow}><td className="pr-3 text-ink">{r.dow}</td>{r.cells.map((c, i) => (
                  <td key={i} className="p-[1px]"><div title={c == null ? (earned ? 'Nothing played yet' : 'No tee times') : `${DAY_NAME[r.dow] ?? r.dow} ${fmtHour(grid.hours[i])}: ${earned ? `${usd2(c)} per spot offered` : `${Math.round(c)}% booked`}`}
                    className={'w-12 h-8 rounded-[4px] flex items-center justify-center ' + (c == null ? 'bg-paper text-ink-faint' : shade(c) >= 60 ? 'text-white' : 'text-ink')}
                    style={c == null ? undefined : { background: `color-mix(in srgb, var(--color-pine) ${Math.round(8 + shade(c) * 0.92)}%, white)` }}>{c == null ? '' : earned ? `$${Math.round(c / 100)}` : `${Math.round(c)}`}</div></td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="By day of the week" term="byDow">
          <div className="space-y-2">{d.utilization.byDow.map(r => <BarRow key={r.dow} label={DAY_NAME[r.dow] ?? r.dow} value={r.fillPct ?? 0} max={100} right={pctS(r.fillPct)} hint={`${r.booked} of ${r.sale} spots`} />)}</div>
        </Section>
        <Section title="By hour" term="byHour">
          {d.utilization.byHour.length === 0 ? <p className="text-[13px] text-ink-muted">No tee times in these dates.</p>
            : <div className="space-y-2">{d.utilization.byHour.map(r => <BarRow key={r.hour} label={fmtHour(r.hour)} labelW="w-14" value={r.fillPct ?? 0} max={100} right={pctS(r.fillPct)} hint={`${r.booked} of ${r.sale} spots`} />)}</div>}
        </Section>
      </div>

      {/* W2-8 (6): where demand was more than the tee sheet offered. */}
      <Section title="Golfers you turned away" term="turnedAway"
        action={u.alerts.count > 0 ? <Download onClick={() => downloadCsv(`waiting-for-a-time-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Players', 'Told'], u.alerts.rows.map(a => [a.date, a.time, a.players, a.notified ? 'yes' : 'no']))} /> : undefined}>
        <div className="divide-y divide-line-soft max-w-xl mb-4">
          <Line label="Tee times sold out" value={u.soldOutTimes.toLocaleString()} />
          <Line label="Asked to hear of an opening" sub={plural(u.alerts.players, 'player')} value={plural(u.alerts.count, 'golfer')} />
          {u.alerts.count > 0 && <Line label="Told a time opened" value={u.alerts.notified.toLocaleString()} />}
          {u.blockedTimes > 0 && <Line label="Times you blocked" value={u.blockedTimes.toLocaleString()} />}
        </div>
        <Table head={['Day', 'Hour', 'Times sold out']} empty="Nothing sold out in these dates."
          rows={u.soldOutByHour.map(r => [DAY_NAME[r.dow] ?? r.dow, fmtHour(r.hour), r.times])} />
      </Section>

      <Section title="Tee times that went out with open spots" term="openSpots"
        action={<Download onClick={() => downloadCsv(`open-spots-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Spots open'], d.unfilled.rows.map(r => [r.date, r.time, r.open]))} />}>
        <div className="divide-y divide-line-soft max-w-xl mb-4">
          <Line label="Tee times" value={d.unfilled.slots.toLocaleString()} />
          <Line label="Open spots" value={d.unfilled.openSpots.toLocaleString()} />
        </div>
        <Table head={['Day', 'Time', 'Spots open']} empty="Every tee time in these dates went out full."
          rows={emptiest.map(r => [fmtDay(r.date), fmtTime(r.time), r.open])} />
      </Section>
    </div>
  );
}

function MissesTab({ d }: { d: Data }) {
  const c = d.cancellations;
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Fig label="No-shows" term="noShows" value={String(d.noShows.count)} sub={`${pctS(d.noShows.ratePct)} of bookings`} />
        <Fig label="Their rounds" value={usd(d.noShows.impactCents)} />
        <Fig label="Cancellations" term="cancellations" value={String(c.count)} sub={`${pctS(c.ratePct)} of bookings`} />
        <Fig label="Booked again" value={pctS(c.rebookedPct)} sub="of cancelled times" />
      </div>
      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="No-shows" term="noShowRule"
          action={<><Ask q="Who didn’t show up in these dates, and what can I do about repeat no-shows?" /><Download onClick={() => downloadCsv(`no-shows-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Worth', 'Marked by staff'], d.noShows.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.marked ? 'yes' : 'no']))} /></>}>
          <div className="divide-y divide-line-soft mb-5">
            {d.noShows.shortShows.groups > 0 && <Line label="Turned up short" sub={plural(d.noShows.shortShows.missingPlayers, 'player')} value={plural(d.noShows.shortShows.groups, 'group')} />}
            {/* W2-8 (7): the evidence a course needs before turning on a no-show fee. */}
            {(d.noShows.byFeePolicy.withFee.bookings > 0 && d.noShows.byFeePolicy.withoutFee.bookings > 0) && (<>
              <Line label={<Term k="feePolicy">With a card and a fee</Term>} value={`${pctS(d.noShows.byFeePolicy.withFee.noShowPct)} no-shows`} sub={plural(d.noShows.byFeePolicy.withFee.bookings, 'booking')} />
              <Line label="With no fee" value={`${pctS(d.noShows.byFeePolicy.withoutFee.noShowPct)} no-shows`} sub={plural(d.noShows.byFeePolicy.withoutFee.bookings, 'booking')} />
            </>)}
          </div>
          <h4 className="text-[13px] font-semibold text-ink mb-1">Missed more than once</h4>
          <Table head={['Golfer', 'Times']} empty="Nobody missed more than once." rows={d.noShows.repeat.map(r => [r.name, r.count])} />
        </Section>
        <Section title="Cancellations" term="cancellations"
          action={<><Ask q="How far ahead do golfers cancel, and is my cancellation window right?" /><Download onClick={() => downloadCsv(`cancellations-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Worth', 'Cancelled at', 'Cancelled by'], c.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.cancelledAt, r.by ?? 'not tracked']))} /></>}>
          <div className="divide-y divide-line-soft mb-5">
            {c.count > 0 && <Line label="Worth" value={usd(c.lostCents)} />}
            {c.lateFeesKeptCents > 0 && <Line label="Late fees kept" value={usd(c.lateFeesKeptCents)} />}
            {/* W2-8 (8): weather and closures are the course's call, not the golfer's. */}
            {c.calledOff.bookings > 0 && <Line label="You called off" sub={[c.calledOff.weather ? `${c.calledOff.weather} weather` : '', c.calledOff.closure ? `${c.calledOff.closure} closure` : '', plural(c.calledOff.players, 'player')].filter(Boolean).join(' · ')} value={plural(c.calledOff.bookings, 'booking')} />}
            {d.utilization.closedDays.length > 0 && <Line label="Closed" sub={d.utilization.closedDays.map(x => `${fmtDay(x.date)}${x.reason ? ` (${x.reason})` : ''}`).join(', ')} value={plural(d.utilization.closedDays.length, 'day')} />}
          </div>
          {c.count > 0 && (<>
            <h4 className="text-[13px] font-semibold text-ink mb-2"><Term k="cancelLead">How long before</Term></h4>
            <div className="space-y-2 mb-6">
              {([['Under a day', c.lead.under24h], ['1 to 3 days', c.lead.d1to3], ['More than 3 days', c.lead.over3d]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} labelW="w-32" value={v} max={Math.max(c.count, 1)} right={String(v)} />)}
            </div>
            <h4 className="text-[13px] font-semibold text-ink mb-1">Who cancelled</h4>
            {c.byCustomer + c.byStaff === 0 ? <p className="text-[12.5px] text-ink-muted">Tracked from {fmtDay(d.eventLogStart)}</p> : (
              <div className="divide-y divide-line-soft">
                <Line label="The golfer" value={String(c.byCustomer)} />
                <Line label="Your staff or GreenReserve" value={String(c.byStaff)} />
                {c.actorUnknown > 0 && <Line label="Before we tracked it" value={String(c.actorUnknown)} />}
              </div>
            )}
          </>)}
        </Section>
      </div>
    </div>
  );
}

function GolfersTab({ d }: { d: Data }) {
  const g = d.customers;
  return (
    <div className="space-y-10">
      <p className="text-[13px] text-ink-soft">
        From bookings at your course — for looking after your regulars, not for marketing they didn’t ask for (<Link href="/privacy" target="_blank" className="text-pine underline underline-offset-4">Privacy Policy</Link>).
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Fig label="Golfers" term="golfers" value={g.identified.toLocaleString()} sub={`${g.newCustomers} new · ${g.returning} back`} />
        <Fig label="Came back" term="cameBack" value={pctS(g.returningPct)} />
        <Fig label="Kept from before" term="keptFromBefore" value={pctS(g.retentionPct)} sub={`${g.retained} of ${g.previousCustomers}`} />
        <Fig label="Members" value={String(g.members.active)} sub={`of ${g.members.onFile} on file`} />
      </div>

      <Section title="Your regulars" term="regulars"
        action={<><Ask q="Who are my regulars, and who used to come often but hasn’t been back?" /><Download onClick={() => downloadCsv(`regulars-${d.range.from}-${d.range.to}`, ['Golfer', 'Bookings', 'Players', 'Spent'], g.topByRounds.map(r => [r.name, r.rounds, r.players, r.spendCents / 100]))} /></>}>
        <Table head={['Golfer', 'Bookings', 'Players', 'Spent']} empty="No golfers yet." rows={g.topByRounds.map(r => [r.name, r.rounds, r.players, usd(r.spendCents)])} />
        {g.unidentifiedBookings > 0 && <p className="text-[12.5px] text-ink-muted mt-2">{plural(g.unidentifiedBookings, 'walk-in')} with no email or phone</p>}
      </Section>

      {/* W2-8 (9): the regulars to call — Cam 2026-10-22: name, email and phone shown. */}
      <Section title="Regulars who’ve gone quiet" term="goneQuiet"
        action={g.goneQuiet.length > 0 ? <Download onClick={() => downloadCsv(`gone-quiet-${d.range.to}`, ['Golfer', 'Email', 'Phone', 'Rounds', 'Last played', 'Usually every (days)', 'Days since'], g.goneQuiet.map(r => [r.name, r.email, r.phone, r.rounds, r.lastPlayed, r.usualGapDays, r.daysSince]))} /> : undefined}>
        <Table head={['Golfer', 'Email', 'Phone', 'Rounds', 'Last played', 'Usually every']} empty="Nobody who played regularly has gone quiet."
          rows={g.goneQuiet.slice(0, 15).map(r => [r.name, r.email ? <a href={`mailto:${r.email}`} className="text-pine hover:underline">{r.email}</a> : '—', r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="text-pine hover:underline">{r.phone}</a> : '—', r.rounds, fmtDay(r.lastPlayed), `${r.usualGapDays} days`])} />
      </Section>

      {/* W2-8 (3): the table a city or county asks for, as a download. */}
      {(() => {
        const rows = g.residents.rows;
        const t = rows.reduce((a, r) => ({ rp: a.rp + r.resPlayers, op: a.op + r.otherPlayers, rc: a.rc + r.resCents, oc: a.oc + r.otherCents }), { rp: 0, op: 0, rc: 0, oc: 0 });
        if (t.rp === 0) return null;
        return (
          <Section title="Residents and everyone else" term="residents"
            action={<Download onClick={() => downloadCsv(`residents-${d.range.from}-${d.range.to}`, ['Date', 'Resident players', 'Other players', 'Resident green fees', 'Other green fees'], rows.map(r => [r.date, r.resPlayers, r.otherPlayers, r.resCents / 100, r.otherCents / 100]))} />}>
            <div className="divide-y divide-line-soft max-w-md">
              <Line label="Resident players" value={t.rp.toLocaleString()} sub={usd(t.rc)} />
              <Line label="Everyone else" value={t.op.toLocaleString()} sub={usd(t.oc)} />
            </div>
            <p className="text-[12.5px] text-ink-muted mt-2">From {fmtDay(g.residents.since)}</p>
          </Section>
        );
      })()}
    </div>
  );
}

function BookingTab({ d }: { d: Data }) {
  const b = d.behavior;
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Fig label="Bookings" term="bookings" value={b.bookings.toLocaleString()} sub={plural(b.players, 'player')} />
        <Fig label="Online" value={pctS(b.bookings ? ((b.channel.online ?? 0) / b.bookings) * 100 : null)} />
        <Fig label="Group size" value={b.avgGroupSize == null ? '—' : String(b.avgGroupSize)} sub="players" />
        <Fig label="Booked ahead" term="bookedAhead" value={b.avgLeadDays == null ? '—' : `${b.avgLeadDays} days`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="Where bookings came from" term="channel"
          action={<Ask q="How are golfers booking, and how can I move more of them online?" />}>
          <div className="space-y-2">
            {([['Online', b.channel.online ?? 0], ['Walked in', b.channel.walk_in ?? 0], ['By phone', b.channel.phone ?? 0]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} value={v} max={Math.max(b.bookings, 1)} right={String(v)} />)}
          </div>
        </Section>
        <Section title="How far ahead they book" term="lead">
          <div className="space-y-2">
            {([['Same day', b.lead.sameDay], ['1–2 days', b.lead.d1to2], ['3–7 days', b.lead.d3to7], ['8–14 days', b.lead.d8to14], ['15+ days', b.lead.d15plus]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} value={v} max={Math.max(b.bookings, 1)} right={String(v)} />)}
          </div>
        </Section>
      </div>
    </div>
  );
}

const TABS: [Tab, string][] = [['revenue', 'Revenue'], ['busy', 'Busy times'], ['misses', 'No-shows & cancellations'], ['golfers', 'Golfers'], ['booking', 'How they book']];

function AnalyticsInner() {
  const [range, setRange] = useState<DateRange | null>(null);
  const [today, setToday] = useState('');
  const [tab, setTab] = useState<Tab>('revenue');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Review (admin-UX): a refusal is not a failure — a staff login gets a plain
  // explanation and a way back, never a Retry that can only fail again.
  const [denied, setDenied] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const seq = useRef(0); // only the newest request may write state
  const tabsRef = useRef<HTMLDivElement>(null);
  const access = useDashboardAccess();

  const load = useCallback(async (r: DateRange | null) => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    // AN-3: the first load asks for the last 7 days; the server knows the course's date.
    const qs = new URLSearchParams({ ...(r ? r : { days: '7' }), compare: '1' });
    const res = await dfetch<Data>(`/api/operator/analytics?${qs}`);
    if (mine !== seq.current) return; // a newer pick superseded this one
    if (res.ok) { setData(res.data); setToday(res.data.today); setRange(res.data.range); }
    else if (res.status === 403) setDenied(true);
    else if (res.status === 401) setSignedOut(true);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(null); }, [load]);

  const openTab = (t: Tab) => { setTab(t); tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const d = data;

  if (denied || signedOut) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-xl mx-auto px-6 py-16">
          <Card className="p-6">
            <h1 className="text-[20px] font-serif font-semibold text-ink">{denied ? 'Your login doesn’t include Analytics' : 'Your session ended'}</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">{denied
              ? 'The course owner can turn on “See analytics” for you in Settings → Staff & permissions.'
              : 'Sign in again to see your analytics.'}</p>
            <Link href={denied ? '/dashboard' : '/dashboard/login'} className="inline-flex mt-4 px-4 py-2 rounded-md bg-pine text-white text-[13px] font-semibold hover:bg-pine-hover">{denied ? 'Back to the tee sheet' : 'Sign in'}</Link>
          </Card>
        </div>
      </main>
    </div>
  );

  const notes = d ? insights(d, access.can, access.loaded && !access.isStaff) : [];

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-10 py-7">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div className="min-w-0 max-w-[46em]">
              <h1 className="font-serif text-[32px] leading-none text-ink">Analytics</h1>
              <p className="text-[15px] text-ink mt-2.5 leading-snug">{d ? summary(d) : 'Loading…'}</p>
            </div>
            {range && today && <DateRangeButton value={range} today={today} onChange={r => { setRange(r); load(r); }} />}
          </div>

          {error && <div className="mb-5"><LoadError message={d ? `${error} Still showing ${fmtDay(d.range.from)} – ${fmtDay(d.range.to)}.` : error} onRetry={() => load(range)} /></div>}
          {loading && !d && <div className="py-24 text-center text-ink-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}

          {d && (
            <div className={'space-y-5 ' + (loading ? 'opacity-60 pointer-events-none' : '')}>
              <Headline d={d} metric={metric} setMetric={setMetric} />
              <MoreNumbers d={d} open={openTab} />

              {notes.length > 0 && (
                <Card className="overflow-hidden">
                  <h2 className="px-5 pt-4 pb-2 text-[15px] font-semibold text-ink">What to look at</h2>
                  <ul>
                    {notes.map((n, i) => (
                      <li key={i} className={'flex items-center gap-3 px-5 py-3 border-t border-line-soft border-l-[3px] ' + (n.tone === 'bad' ? 'border-l-bad' : n.tone === 'warn' ? 'border-l-warn' : n.tone === 'ok' ? 'border-l-ok' : 'border-l-transparent')}>
                        <p className="min-w-0 flex-1 text-[14px] text-ink tabular-nums">{n.text}</p>
                        <Ask q={n.ask} />
                        {n.go?.href && <Link href={n.go.href} className="shrink-0 px-3 py-1.5 rounded-md border border-line bg-white text-[13px] font-medium text-ink hover:border-line-strong">{n.go.label}</Link>}
                        {n.go?.tab && <button onClick={() => openTab(n.go!.tab!)} className="shrink-0 px-3 py-1.5 rounded-md border border-line bg-white text-[13px] font-medium text-ink hover:border-line-strong">{n.go.label}</button>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <MonthlyReviews />

              {/* The detail, one subject at a time */}
              <Card className="p-5">
                <div ref={tabsRef} className="flex gap-x-6 gap-y-1 border-b border-line mb-6 overflow-x-auto scroll-mt-4" role="tablist">
                  {TABS.map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={'shrink-0 pb-2.5 -mb-px text-[14px] font-semibold border-b-2 transition-colors ' + (tab === k ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{l}</button>
                  ))}
                </div>
                {tab === 'revenue' && <RevenueTab d={d} />}
                {tab === 'busy' && <BusyTab d={d} />}
                {tab === 'misses' && <MissesTab d={d} />}
                {tab === 'golfers' && <GolfersTab d={d} />}
                {tab === 'booking' && <BookingTab d={d} />}
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-paper" />}><AnalyticsInner /></Suspense>;
}

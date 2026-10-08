'use client';
// AN-1 (Cam 2026-10-01): the full Analytics tab. Every metric the operational
// tabs used to carry (stat tiles, charts, the day's totals) lives here now, and
// every number comes from /api/operator/analytics (lib/analytics.ts) — nothing
// is computed or invented in the browser except the CSV text of a table.
// Charts are plain HTML/CSS bars like the rest of the dashboard: no chart
// library, so the golfer-page performance budget is untouched.
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { toast } from '@/components/dashboard/Toast';
import { Loader2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import type { Analytics } from '@/lib/analytics';

type Headline = { collectedCents: number; expectedCents: number; fillPct: number | null; lostCents: number; noShowPct: number | null; cancelPct: number | null; customers: number; returningPct: number | null; bookings: number; avgLeadDays: number | null };
type Data = Analytics & { headline: Headline; compare: { range: { from: string; to: string }; headline: Headline } | null };
type Preset = 'today' | '7d' | '30d' | 'season' | 'custom';

const usd = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (p: number | null | undefined) => p == null ? '—' : `${p}%`;
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtHour = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;

function rangeFor(p: Preset, today: string): { from: string; to: string } {
  if (p === 'today') return { from: today, to: today };
  if (p === '7d') return { from: addDays(today, -6), to: today };
  if (p === 'season') {
    // The golf season, Mar 1 → today (last year's Mar 1 before March).
    const y = Number(today.slice(0, 4)) - (today.slice(5) < '03-01' ? 1 : 0);
    return { from: `${y}-03-01`, to: today };
  }
  return { from: addDays(today, -29), to: today };
}

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  if (rows.length === 0) { toast('Nothing to export — this table is empty for the range.', 'warn'); return; }
  const esc = (v: string | number | null) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[header, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast(`Downloaded ${name}.csv (${rows.length} row${rows.length === 1 ? '' : 's'}).`, 'ok');
}

function CsvBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-ink">CSV</button>;
}

function Section({ title, note, children, csv }: { title: string; note?: string; children: React.ReactNode; csv?: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {note && <p className="text-[12.5px] text-ink-soft mt-1 max-w-[62em]">{note}</p>}
        </div>
        {csv && <CsvBtn onClick={csv} />}
      </div>
      {children}
    </Card>
  );
}

/** A sub-table's label with its own CSV — every table on the page exports. */
function SubHead({ label, csv }: { label: string; csv: () => void }) {
  return <div className="flex items-center justify-between mb-2"><Eyebrow>{label}</Eyebrow><CsvBtn onClick={csv} /></div>;
}

function Stat({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1.5 text-[22px] leading-none font-semibold text-ink tabular-nums">{value}</div>
      {(sub || delta) && <div className="mt-1.5 text-[12.5px] text-ink-soft flex items-center gap-2 flex-wrap">{delta}{sub}</div>}
    </div>
  );
}

/** "Tracking starts …" for metrics that need the event log (EV-1). */
function Tracking({ since }: { since: string }) {
  return <span className="text-[12.5px] italic text-ink-muted">Tracking starts {new Date(since + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>;
}

function Delta({ now, prev, unit, goodWhenUp = true }: { now: number | null; prev: number | null | undefined; unit: 'pct' | 'pp' | 'cents' | 'n'; goodWhenUp?: boolean }) {
  if (now == null || prev == null) return null;
  const diff = now - prev;
  if (diff === 0) return <span className="text-ink-muted">no change</span>;
  const up = diff > 0;
  const good = up === goodWhenUp;
  const text = unit === 'pp' ? `${Math.abs(Math.round(diff * 10) / 10)} pts`
    : unit === 'cents' ? usd(Math.abs(diff))
    : unit === 'pct' && prev !== 0 ? `${Math.abs(Math.round((diff / prev) * 100))}%`
    : `${Math.abs(Math.round(diff * 10) / 10)}`;
  return <span className={'inline-flex items-center gap-0.5 font-semibold ' + (good ? 'text-ok' : 'text-bad')}>{up ? '+' : '−'}{text}</span>;
}

function Bar({ value, max, tone = 'pine' }: { value: number; max: number; tone?: 'pine' | 'soft' | 'bad' }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  const bg = tone === 'pine' ? 'bg-pine' : tone === 'bad' ? 'bg-bad/70' : 'bg-line-strong';
  return <div className="flex-1 h-2.5 bg-line-soft rounded-full overflow-hidden"><div className={'h-full rounded-full ' + bg} style={{ width: `${w}%` }} /></div>;
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft py-3">{empty}</p>;
  return (
    <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white"><tr className="text-left">{head.map((h, i) => <th key={h} className={'py-2 pr-4 text-[12.5px] font-semibold text-ink border-b border-line ' + (i > 0 ? 'text-right' : '')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line-soft">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={'py-1.5 pr-4 tabular-nums ' + (j > 0 ? 'text-right' : 'text-ink')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// BI-1 (PLATFORM_ROADMAP_SPEC §1): the monthly AI review. Its own fetch — it
// does not follow the range picker. The words are the model's, the numbers in
// them were checked against lib/analytics.ts before the review was stored.
type Review = { month: string; label: string; isBaseline: boolean; thin: boolean; writtenAt: string; review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] } };

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
      <ul className="mt-1.5 space-y-1.5">{items.map(i => <li key={i} className="text-[13.5px] text-ink leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-2 before:h-0.5 before:bg-fairway">{i}</li>)}</ul>
    </div>
  );
}

function MonthlyReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(0);
  const load = useCallback(async () => {
    setError('');
    const res = await dfetch<{ reviews: Review[] }>('/api/operator/monthly-reviews');
    if (res.ok) setReviews(res.data.reviews); else setError(res.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div id="reviews" className="mb-5">
      <Section title="Monthly reviews" note="Written on the 1st about the month before. Your first full month is your starting line; every review after measures against it and the month before. Every number comes from the figures below.">
        {error && <LoadError message={error} onRetry={load} />}
        {!reviews && !error && <div className="py-6 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
        {reviews && reviews.length === 0 && <p className="text-[13.5px] text-ink-soft">Your first review arrives after your first full month on GreenReserve.</p>}
        {reviews && reviews.map((r, i) => (
          <div key={r.month} className={i > 0 ? 'border-t border-line pt-4 mt-4' : ''}>
            <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="w-full flex items-baseline justify-between gap-3 text-left">
              <span className="font-serif text-[20px] text-ink">{r.label}{r.isBaseline ? <span className="ml-2 font-sans text-[12.5px] text-ink-muted">Starting line</span> : null}</span>
              <span className="text-[12.5px] font-semibold text-ink-soft">{open === i ? 'Hide' : 'Read'}</span>
            </button>
            {open === i && (
              <div className="mt-2 max-w-[62em]">
                <p className="text-[14.5px] text-ink leading-relaxed">{r.review.verdict}</p>
                {r.thin && <p className="text-[12.5px] text-ink-muted mt-1">A quiet month: too few bookings to draw firm conclusions.</p>}
                <ReviewList title="What went well" items={r.review.wentWell} />
                <ReviewList title="Where you fell short" items={r.review.fellShort} />
                <ReviewList title="What to try next" items={r.review.recommendations} />
              </div>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}

function AnalyticsInner() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [today, setToday] = useState('');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Review (admin-UX): a refusal is not a failure — a staff login gets a plain
  // explanation and a way back, never a Retry that can only fail again.
  const [denied, setDenied] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const seq = useRef(0); // only the newest request may write state

  const load = useCallback(async (p: Preset, c: { from: string; to: string }, cmp: boolean, t: string) => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    const r = p === 'custom' ? c : t ? rangeFor(p, t) : null;
    const qs = new URLSearchParams({ ...(r ? r : {}), ...(cmp ? { compare: '1' } : {}) });
    const res = await dfetch<Data>(`/api/operator/analytics?${qs}`);
    if (mine !== seq.current) return; // a newer click superseded this one
    if (res.ok) { setData(res.data); if (!t) setToday(res.data.today); if (!c.from) setCustom({ from: res.data.range.from, to: res.data.range.to }); }
    else if (res.status === 403) setDenied(true);
    else if (res.status === 401) setSignedOut(true);
    else setError(res.error);
    setLoading(false);
  }, []);
  const customInvalid = !!custom.from && !!custom.to && custom.from > custom.to;

  useEffect(() => { load('30d', { from: '', to: '' }, true, ''); }, [load]);

  const pick = (p: Preset) => { setPreset(p); if (p !== 'custom') load(p, custom, compare, today); };
  const prev = data?.compare?.headline;
  const d = data;

  if (denied || signedOut) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-xl mx-auto px-6 py-16">
          <Card className="p-6">
            <h1 className="text-[20px] font-serif font-semibold text-ink">{denied ? 'Your login doesn’t include Analytics' : 'Your session ended'}</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">{denied
              ? 'It shows revenue and what each golfer spends. The course owner can turn on “See analytics” for you in Settings → Staff & permissions.'
              : 'Sign in again to see your analytics.'}</p>
            <Link href={denied ? '/dashboard' : '/dashboard/login'} className="inline-flex mt-4 px-4 py-2 rounded-md bg-pine text-white text-[13px] font-semibold hover:bg-pine-hover">{denied ? 'Back to the tee sheet' : 'Sign in'}</Link>
          </Card>
        </div>
      </main>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <h1 className="text-[30px] font-serif font-semibold leading-none tracking-tight text-ink">Analytics</h1>
              <p className="text-[13px] text-ink-soft mt-2">
                {denied || signedOut ? '' : d ? `${fmtDay(d.range.from)} – ${fmtDay(d.range.to)}${d.compare ? ` · compared with ${fmtDay(d.compare.range.from)} – ${fmtDay(d.compare.range.to)}` : ''} · by tee-time date` : 'Loading…'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['season', 'Season'], ['custom', 'Custom']] as [Preset, string][]).map(([k, l]) => (
                <button key={k} onClick={() => pick(k)} aria-pressed={preset === k}
                  className={'px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors ' + (preset === k ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:text-ink')}>{l}</button>
              ))}
              <label className="ml-1 inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft cursor-pointer">
                <input type="checkbox" checked={compare} onChange={e => { setCompare(e.target.checked); load(preset, custom, e.target.checked, today); }} className="accent-pine" />Compare to previous period
              </label>
              <button onClick={() => load(preset, custom, compare, today)} className="inline-flex items-center gap-1 text-[12.5px] text-ink-soft px-2.5 py-1.5 rounded-md border border-line hover:text-ink">Refresh</button>
            </div>
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 mb-5 text-[13px]">
              <input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="bg-white border border-line rounded-md px-2.5 py-1.5" />
              <span className="text-ink-muted">to</span>
              <input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="bg-white border border-line rounded-md px-2.5 py-1.5" />
              {customInvalid && <span className="text-bad">The start date is after the end date — swap them.</span>}
              <button onClick={() => load('custom', custom, compare, today)} disabled={!custom.from || !custom.to || customInvalid}
                className="px-3 py-1.5 rounded-md bg-pine text-white font-semibold disabled:opacity-50">Apply</button>
            </div>
          )}

          <MonthlyReviews />

          {error && <LoadError message={d ? `${error} Still showing ${fmtDay(d.range.from)} – ${fmtDay(d.range.to)}.` : error} onRetry={() => load(preset, custom, compare, today)} />}
          {loading && !d && <div className="py-24 text-center text-ink-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}

          {d && (
            <div className={'space-y-5 ' + (loading ? 'opacity-60 pointer-events-none' : '')}>
              {/* ── 1. Revenue ── */}
              <Section title="Revenue"
                note="Course share only (green, cart, range balls) — GreenReserve's booking fee is the golfer's, not yours. Expected = every non-cancelled booking whose tee time has passed. Cards are charged at check-in; there is no online prepayment."
                csv={() => downloadCsv(`revenue-${d.range.from}-${d.range.to}`, [d.revenue.bucket === 'week' ? 'Week of' : 'Date', 'Expected', 'Collected', 'Gap', 'Gap %'], d.revenue.series.map(r => [r.key, r.expectedCents / 100, r.collectedCents / 100, r.gapCents / 100, r.gapPct]))}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="Collected" value={usd(d.revenue.collectedCents)} delta={<Delta now={d.headline.collectedCents} prev={prev?.collectedCents} unit="pct" />} sub={`of ${usd(d.revenue.expectedCents)} expected`} />
                  <Stat label="Gap" value={usd(d.revenue.gapCents)} sub={d.revenue.gapPct == null ? undefined : `${d.revenue.gapPct}% of expected`} />
                  <Stat label="Per round" value={usd2(d.revenue.perRoundCents)} sub={`${d.revenue.roundsPlayed} rounds played`} />
                  <Stat label="Per available tee time" value={usd2(d.revenue.perAvailableTeeTimeCents)} sub="collected ÷ tee times for sale" />
                </div>
                <div className="grid sm:grid-cols-3 gap-x-6 gap-y-2 mb-5 text-[13px]">
                  {([['Card, charged at check-in', d.revenue.cardCents, 'pine'], ['Paid at the counter', d.revenue.counterCents, 'pine'], [`Outstanding (${d.revenue.outstandingBookings} bookings)`, d.revenue.outstandingCents, 'bad']] as [string, number, 'pine' | 'bad'][]).map(([l, v, tone]) => (
                    <div key={l}><div className="flex justify-between mb-1"><span className="text-ink-soft">{l}</span><b className="tabular-nums">{usd(v)}</b></div><Bar value={v} max={Math.max(d.revenue.expectedCents, 1)} tone={tone} /></div>
                  ))}
                </div>
                <div className="flex items-end gap-[2px] h-28 border-b border-line">
                  {d.revenue.series.map(r => {
                    const max = Math.max(...d.revenue.series.map(x => x.expectedCents), 1);
                    return (
                      <div key={r.key} className="flex-1 h-full flex flex-col justify-end relative group">
                        <div className="w-full bg-line-strong/70" style={{ height: `${(Math.max(0, r.expectedCents - r.collectedCents) / max) * 100}%` }} />
                        <div className="w-full bg-pine" style={{ height: `${(r.collectedCents / max) * 100}%` }} />
                        <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-white text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 z-10">{fmtDay(r.key)}: {usd(r.collectedCents)} of {usd(r.expectedCents)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[11.5px] text-ink-muted mt-1"><span>{d.revenue.series[0] && fmtDay(d.revenue.series[0].key)}</span><span className="flex gap-3"><span className="inline-flex items-center gap-1"><i className="w-2 h-2 bg-pine inline-block" />Collected</span><span className="inline-flex items-center gap-1"><i className="w-2 h-2 bg-line-strong inline-block" />Not collected</span></span><span>{d.revenue.series.at(-1) && fmtDay(d.revenue.series.at(-1)!.key)}</span></div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 text-[13px]">
                  <div><Eyebrow>Green fees</Eyebrow><div className="font-semibold tabular-nums mt-1">{usd(d.revenue.greenCents)}</div></div>
                  <div><Eyebrow>Cart</Eyebrow><div className="font-semibold tabular-nums mt-1">{usd(d.revenue.cartCents)}</div></div>
                  <div><Eyebrow>Late fees kept</Eyebrow><div className="font-semibold tabular-nums mt-1">{usd(d.revenue.lateFeesKeptCents)}</div></div>
                  <div><Eyebrow>Holds held now</Eyebrow><div className="font-semibold tabular-nums mt-1">{usd(d.revenue.holdsHeldCents)}</div><div className="text-[11.5px] text-ink-muted">refunded at check-in</div></div>
                </div>
                <div className="mt-5 pt-4 border-t border-line">
                  <SubHead label="Still to come in this range" csv={() => downloadCsv(`revenue-summary-${d.range.from}-${d.range.to}`, ['Measure', 'Bookings', 'Amount'], [
                    ['Collected — card at check-in', null, d.revenue.cardCents / 100], ['Collected — paid at the counter', null, d.revenue.counterCents / 100],
                    ['Outstanding (tee time passed)', d.revenue.outstandingBookings, d.revenue.outstandingCents / 100], ['Green fees collected', null, d.revenue.greenCents / 100],
                    ['Cart collected', null, d.revenue.cartCents / 100], ['Late fees kept', null, d.revenue.lateFeesKeptCents / 100],
                    ['Holds held now', d.revenue.pipeline.holdsHeldBookings, d.revenue.holdsHeldCents / 100], ['Upcoming — card on file', d.revenue.pipeline.cardOnFile.bookings, d.revenue.pipeline.cardOnFile.cents / 100],
                    ['Upcoming — awaiting check-in', d.revenue.pipeline.awaitingCheckIn.bookings, d.revenue.pipeline.awaitingCheckIn.cents / 100], ['GreenReserve booking fees (golfer-paid)', null, d.revenue.greenReserveFeesCents / 100],
                  ])} />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
                    <div><div className="text-ink-muted">Upcoming bookings</div><div className="font-semibold tabular-nums">{d.revenue.pipeline.upcomingBookings} · {usd(d.revenue.upcomingCents)}</div></div>
                    <div><div className="text-ink-muted">Card on file</div><div className="font-semibold tabular-nums">{d.revenue.pipeline.cardOnFile.bookings} · ~{usd(d.revenue.pipeline.cardOnFile.cents)}</div>{d.revenue.pipeline.cardOnFile.noCardRequired > 0 && <div className="text-[11.5px] text-ink-muted">{d.revenue.pipeline.cardOnFile.noCardRequired} no card required</div>}</div>
                    <div><div className="text-ink-muted">Awaiting check-in</div><div className="font-semibold tabular-nums">{d.revenue.pipeline.awaitingCheckIn.bookings} · ~{usd(d.revenue.pipeline.awaitingCheckIn.cents)}</div></div>
                    <div><div className="text-ink-muted">GreenReserve fees (golfer-paid)</div><div className="font-semibold tabular-nums">{usd(d.revenue.greenReserveFeesCents)}</div><div className="text-[11.5px] text-ink-muted">{d.revenue.pipeline.holdsHeldBookings} hold{d.revenue.pipeline.holdsHeldBookings === 1 ? '' : 's'} held now</div></div>
                  </div>
                </div>
              </Section>

              {/* ── 2. Utilization ── */}
              <Section title="Utilization" note="Fill rate = booked spots ÷ spots for sale (blocked times excluded)."
                csv={() => downloadCsv(`fill-rate-${d.range.from}-${d.range.to}`, ['Date', 'Spots for sale', 'Booked', 'Fill %'], d.utilization.byDay.map(r => [r.date, r.sale, r.booked, r.fillPct]))}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="Fill rate" value={pctS(d.utilization.fillPct)} delta={<Delta now={d.headline.fillPct} prev={prev?.fillPct} unit="pp" />} />
                  <Stat label="Spots for sale" value={d.utilization.spotsForSale.toLocaleString()} />
                  <Stat label="Spots booked" value={d.utilization.spotsBooked.toLocaleString()} />
                  <Stat label="Blocked times" value={d.utilization.blockedTimes.toLocaleString()} sub="off the sheet, not for sale" />
                </div>
                <Eyebrow className="mb-2">By day</Eyebrow>
                <div className="flex items-end gap-[2px] h-20 border-b border-line mb-1">
                  {d.utilization.byDay.map(r => (
                    <div key={r.date} className="flex-1 h-full flex flex-col justify-end relative group">
                      <div className="w-full bg-pine/80" style={{ height: `${r.fillPct ?? 0}%` }} />
                      <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-white text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 z-10">{fmtDay(r.date)}: {pctS(r.fillPct)} full</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11.5px] text-ink-muted mb-5"><span>{d.utilization.byDay[0] && fmtDay(d.utilization.byDay[0].date)}</span><span>{d.utilization.byDay.at(-1) && fmtDay(d.utilization.byDay.at(-1)!.date)}</span></div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <div>
                    <SubHead label="By day of week" csv={() => downloadCsv(`fill-by-weekday-${d.range.from}-${d.range.to}`, ['Day', 'Spots for sale', 'Booked', 'Fill %'], d.utilization.byDow.map(r => [r.dow, r.sale, r.booked, r.fillPct]))} />
                    <div className="space-y-1.5">{d.utilization.byDow.map(r => <div key={r.dow} className="flex items-center gap-3 text-[13px]"><span className="w-9 text-ink-muted">{r.dow}</span><Bar value={r.fillPct ?? 0} max={100} /><span className="w-12 text-right tabular-nums font-semibold">{pctS(r.fillPct)}</span></div>)}</div>
                  </div>
                  <div>
                    <SubHead label="By hour" csv={() => downloadCsv(`fill-by-hour-${d.range.from}-${d.range.to}`, ['Hour', 'Spots for sale', 'Booked', 'Fill %'], d.utilization.byHour.map(r => [`${r.hour}:00`, r.sale, r.booked, r.fillPct]))} />
                    <div className="space-y-1.5">{d.utilization.byHour.map(r => <div key={r.hour} className="flex items-center gap-3 text-[13px]"><span className="w-9 text-ink-muted">{fmtHour(r.hour)}</span><Bar value={r.fillPct ?? 0} max={100} /><span className="w-12 text-right tabular-nums font-semibold">{pctS(r.fillPct)}</span></div>)}</div>
                  </div>
                </div>
                <div className="mt-6"><SubHead label="Day of week × tee time (fill %)" csv={() => downloadCsv(`fill-heatmap-${d.range.from}-${d.range.to}`, ['Day', ...d.utilization.heatmap.hours.map(h => `${h}:00`)], d.utilization.heatmap.rows.map(r => [r.dow, ...r.cells]))} /></div>
                {d.utilization.heatmap.hours.length === 0 ? <p className="text-[13px] text-ink-soft">No tee times in this range.</p> : (
                  <div className="overflow-x-auto">
                    <table className="text-[11.5px] tabular-nums">
                      <thead><tr><th />{d.utilization.heatmap.hours.map(h => <th key={h} className="px-1 pb-1 font-semibold text-ink-muted">{fmtHour(h)}</th>)}</tr></thead>
                      <tbody>{d.utilization.heatmap.rows.map(r => (
                        <tr key={r.dow}><td className="pr-2 text-ink-muted">{r.dow}</td>{r.cells.map((c, i) => (
                          <td key={i} className="p-0.5"><div title={c == null ? 'No tee times' : `${c}% full`}
                            className={'w-11 h-7 rounded flex items-center justify-center ' + (c == null ? 'bg-paper text-ink-faint' : c >= 60 ? 'text-white' : 'text-ink')}
                            style={c == null ? undefined : { background: `color-mix(in srgb, var(--color-pine) ${Math.round(8 + c * 0.92)}%, white)` }}>{c == null ? '·' : `${Math.round(c)}`}</div></td>
                        ))}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* ── 3. Unfilled slots ── */}
              <Section title="Unfilled slots" note="Tee times that went off with open spots. Lost revenue = open spots × that time's green fee."
                csv={() => downloadCsv(`unfilled-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Spots open', 'Revenue lost'], d.unfilled.rows.map(r => [r.date, r.time, r.open, r.lostCents / 100]))}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="Revenue lost" value={usd(d.unfilled.lostCents)} delta={<Delta now={d.headline.lostCents} prev={prev?.lostCents} unit="pct" goodWhenUp={false} />} />
                  <Stat label="Slots with open spots" value={d.unfilled.slots.toLocaleString()} />
                  <Stat label="Open spots" value={d.unfilled.openSpots.toLocaleString()} />
                </div>
                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2"><Table head={['Date', 'Time', 'Spots open', 'Revenue lost']} empty="No unfilled tee times in this range."
                    rows={[...d.unfilled.rows].reverse().map(r => [fmtDay(r.date), fmtTime(r.time), r.open, usd(r.lostCents)])} /></div>
                  <div>
                    <SubHead label="Worst hours" csv={() => downloadCsv(`unfilled-worst-hours-${d.range.from}-${d.range.to}`, ['Hour', 'Slots', 'Open spots', 'Revenue lost'], d.unfilled.worstHours.map(r => [`${r.hour}:00`, r.slots, r.open, r.lostCents / 100]))} />
                    <div className="space-y-1.5 mb-4">{d.unfilled.worstHours.map(r => <div key={r.hour} className="flex justify-between text-[13px]"><span>{fmtHour(r.hour)}</span><span className="tabular-nums text-ink-soft">{r.open} spots · <b className="text-ink">{usd(r.lostCents)}</b></span></div>)}</div>
                    <SubHead label="Worst days" csv={() => downloadCsv(`unfilled-worst-days-${d.range.from}-${d.range.to}`, ['Day', 'Slots', 'Open spots', 'Revenue lost'], d.unfilled.worstDays.map(r => [r.dow, r.slots, r.open, r.lostCents / 100]))} />
                    <div className="space-y-1.5">{d.unfilled.worstDays.map(r => <div key={r.dow} className="flex justify-between text-[13px]"><span>{r.dow}</span><span className="tabular-nums text-ink-soft">{r.open} spots · <b className="text-ink">{usd(r.lostCents)}</b></span></div>)}</div>
                  </div>
                </div>
              </Section>

              {/* ── 4. No-shows ── */}
              <Section title="No-shows" note={`Booked, not cancelled, and never checked in by ${d.graceMinutes} minutes after the tee time — whether or not staff marked it.`}
                csv={() => downloadCsv(`no-shows-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Value', 'Marked by staff'], d.noShows.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.marked ? 'yes' : 'no']))}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="No-shows" value={d.noShows.count.toLocaleString()} sub={`${d.noShows.markedByStaff} marked by staff`} />
                  <Stat label="Rate" value={pctS(d.noShows.ratePct)} delta={<Delta now={d.headline.noShowPct} prev={prev?.noShowPct} unit="pp" goodWhenUp={false} />} />
                  <Stat label="Value not collected" value={usd(d.noShows.impactCents)} />
                </div>
                <SubHead label="Repeat no-shows" csv={() => downloadCsv(`repeat-no-shows-${d.range.from}-${d.range.to}`, ['Golfer', 'No-shows'], d.noShows.repeat.map(r => [r.name, r.count]))} />
                <Table head={['Golfer', 'No-shows']} empty="No golfer missed more than once in this range."
                  rows={d.noShows.repeat.map(r => [r.name, r.count])} />
              </Section>

              {/* ── 5. Cancellations ── */}
              <Section title="Cancellations" note="Lost = the cancelled bookings' value, less any late fee kept. Rebooked = someone else booked the same tee time after the cancellation."
                csv={() => downloadCsv(`cancellations-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Value', 'Cancelled at', 'Cancelled by'], d.cancellations.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.cancelledAt, r.by ?? 'not tracked']))}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="Cancellations" value={d.cancellations.count.toLocaleString()} />
                  <Stat label="Rate" value={pctS(d.cancellations.ratePct)} delta={<Delta now={d.headline.cancelPct} prev={prev?.cancelPct} unit="pp" goodWhenUp={false} />} />
                  <Stat label="Revenue lost" value={usd(d.cancellations.lostCents)} sub={`${usd(d.cancellations.lateFeesKeptCents)} late fees kept`} />
                  <Stat label="Rebooked" value={pctS(d.cancellations.rebookedPct)} sub={`${d.cancellations.rebooked} of ${d.cancellations.count}`} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <div>
                    <SubHead label="How far ahead they cancelled" csv={() => downloadCsv(`cancellation-lead-${d.range.from}-${d.range.to}`, ['When', 'Cancellations'], [['Under 24 hours', d.cancellations.lead.under24h], ['1-3 days', d.cancellations.lead.d1to3], ['More than 3 days', d.cancellations.lead.over3d], ['Unknown', d.cancellations.lead.unknown]])} />
                    {([['Under 24 hours', d.cancellations.lead.under24h], ['1–3 days', d.cancellations.lead.d1to3], ['More than 3 days', d.cancellations.lead.over3d]] as [string, number][]).map(([l, v]) => (
                      <div key={l} className="flex items-center gap-3 text-[13px] mb-1.5"><span className="w-32 text-ink-soft">{l}</span><Bar value={v} max={Math.max(d.cancellations.count, 1)} /><span className="w-8 text-right tabular-nums font-semibold">{v}</span></div>
                    ))}
                  </div>
                  <div>
                    <SubHead label="Who cancelled" csv={() => downloadCsv(`cancelled-by-${d.range.from}-${d.range.to}`, ['Who', 'Cancellations'], [['Golfer', d.cancellations.byCustomer], ['Staff or GreenReserve', d.cancellations.byStaff], ['Before tracking started', d.cancellations.actorUnknown]])} />
                    {d.cancellations.byCustomer + d.cancellations.byStaff === 0 ? <Tracking since={d.eventLogStart} /> : (
                      <div className="text-[13px] space-y-1">
                        <div className="flex justify-between"><span>The golfer</span><b className="tabular-nums">{d.cancellations.byCustomer}</b></div>
                        <div className="flex justify-between"><span>Staff or GreenReserve</span><b className="tabular-nums">{d.cancellations.byStaff}</b></div>
                        {d.cancellations.actorUnknown > 0 && <div className="flex justify-between text-ink-muted"><span>Before tracking started</span><span className="tabular-nums">{d.cancellations.actorUnknown}</span></div>}
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              {/* ── 6. Customers ── */}
              <Section title="Customers" note="A customer is matched on email, then phone, then account. Returning = more than one booking with the same customer. Retention = share of last period's customers who played again this period."
                csv={() => downloadCsv(`top-customers-${d.range.from}-${d.range.to}`, ['Golfer', 'Bookings', 'Players', 'Spend'], d.customers.topByRounds.map(r => [r.name, r.rounds, r.players, r.spendCents / 100]))}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="Identified customers" value={d.customers.identified.toLocaleString()} sub={`${d.customers.newCustomers} new · ${d.customers.returning} returning`} delta={<Delta now={d.headline.customers} prev={prev?.customers} unit="pct" />} />
                  <Stat label="Returning" value={pctS(d.customers.returningPct)} />
                  <Stat label="Retention" value={pctS(d.customers.retentionPct)} sub={`${d.customers.retained} of ${d.customers.previousCustomers} came back`} />
                  <Stat label="Days between visits" value={d.customers.avgDaysBetweenVisits == null ? '—' : String(d.customers.avgDaysBetweenVisits)} sub="average, returning customers" />
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <div><Eyebrow className="mb-2">Top by rounds</Eyebrow><Table head={['Golfer', 'Bookings', 'Players']} empty="No identified customers yet." rows={d.customers.topByRounds.map(r => [r.name, r.rounds, r.players])} /></div>
                  <div><div className="flex items-center justify-between mb-2"><Eyebrow>Top by spend</Eyebrow><CsvBtn onClick={() => downloadCsv(`top-spend-${d.range.from}-${d.range.to}`, ['Golfer', 'Spend', 'Bookings'], d.customers.topBySpend.map(r => [r.name, r.spendCents / 100, r.rounds]))} /></div>
                    <Table head={['Golfer', 'Spend', 'Bookings']} empty="No identified customers yet." rows={d.customers.topBySpend.map(r => [r.name, usd(r.spendCents), r.rounds])} /></div>
                </div>
                <p className="text-[12.5px] text-ink-soft mt-4">Members today: <b className="text-ink">{d.customers.members.active}</b> active of {d.customers.members.onFile} on file, across {d.customers.members.tiers} tier{d.customers.members.tiers === 1 ? '' : 's'}.</p>
                <p className="text-[12.5px] text-ink-soft mt-1">Unidentified: {d.customers.unidentifiedBookings} booking{d.customers.unidentifiedBookings === 1 ? '' : 's'} ({d.customers.unidentifiedPlayers} players) — walk-ins with no email or phone. Take a phone number at the counter to count them.</p>
              </Section>

              {/* ── 7. Booking behaviour ── */}
              <Section title="Booking behavior" note="Lead time = from when the booking was made to the tee time."
                csv={() => downloadCsv(`booking-behavior-${d.range.from}-${d.range.to}`, ['Measure', 'Value'], [['Bookings', d.behavior.bookings], ['Players', d.behavior.players], ['Average group size', d.behavior.avgGroupSize], ['Average lead days', d.behavior.avgLeadDays], ['Same day', d.behavior.lead.sameDay], ['1-2 days', d.behavior.lead.d1to2], ['3-7 days', d.behavior.lead.d3to7], ['8-14 days', d.behavior.lead.d8to14], ['15+ days', d.behavior.lead.d15plus], ...Object.entries(d.behavior.channel).map(([k, v]) => [`Channel: ${k}`, v] as [string, number])])}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
                  <Stat label="Bookings" value={d.behavior.bookings.toLocaleString()} delta={<Delta now={d.headline.bookings} prev={prev?.bookings} unit="pct" />} />
                  <Stat label="Average lead time" value={d.behavior.avgLeadDays == null ? '—' : `${d.behavior.avgLeadDays} days`} />
                  <Stat label="Average group" value={d.behavior.avgGroupSize == null ? '—' : `${d.behavior.avgGroupSize} players`} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <div>
                    <Eyebrow className="mb-2">How far ahead</Eyebrow>
                    {([['Same day', d.behavior.lead.sameDay], ['1–2 days', d.behavior.lead.d1to2], ['3–7 days', d.behavior.lead.d3to7], ['8–14 days', d.behavior.lead.d8to14], ['15+ days', d.behavior.lead.d15plus]] as [string, number][]).map(([l, v]) => (
                      <div key={l} className="flex items-center gap-3 text-[13px] mb-1.5"><span className="w-20 text-ink-soft">{l}</span><Bar value={v} max={Math.max(d.behavior.bookings, 1)} /><span className="w-10 text-right tabular-nums font-semibold">{v}</span></div>
                    ))}
                  </div>
                  <div>
                    <Eyebrow className="mb-2">Channel</Eyebrow>
                    {([['Online', d.behavior.channel.online ?? 0], ['Walk-in', d.behavior.channel.walk_in ?? 0], ['Phone (staff)', d.behavior.channel.phone ?? 0]] as [string, number][]).map(([l, v]) => (
                      <div key={l} className="flex items-center gap-3 text-[13px] mb-1.5"><span className="w-24 text-ink-soft">{l}</span><Bar value={v} max={Math.max(d.behavior.bookings, 1)} /><span className="w-10 text-right tabular-nums font-semibold">{v}</span></div>
                    ))}
                    <p className="text-[11.5px] text-ink-soft mt-2">Bookings GreenReserve support made for you count as online before {fmtDay(d.eventLogStart)}.</p>
                  </div>
                </div>
              </Section>
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

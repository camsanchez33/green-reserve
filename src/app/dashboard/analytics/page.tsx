'use client';
// AN-2 (Cam 2026-10-08: "the analytics tab needs to be completely reworked so that
// it actually makes sense … be organized, look clean and make sense"). The page
// answers one question top to bottom — how is the course doing?
//   1. Four numbers, in plain words, each against the period before.
//   2. "What to look at": short sentences built from those same numbers (no AI,
//      nothing invented — every figure is one /api/operator/analytics returned).
//   3. The monthly AI review (BI-1).
//   4. The detail, one subject at a time behind tabs: Money, Busy times,
//      No-shows & cancellations, Golfers.
// Every number still comes from lib/analytics.ts (AN-1). Charts are plain
// HTML/CSS — no chart library.
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { toast } from '@/components/dashboard/Toast';
import { Loader2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import type { Analytics } from '@/lib/analytics';

type Headline = { collectedCents: number; expectedCents: number; fillPct: number | null; lostCents: number; noShowPct: number | null; cancelPct: number | null; customers: number; returningPct: number | null; bookings: number; avgLeadDays: number | null };
type Data = Analytics & { headline: Headline; compare: { range: { from: string; to: string }; headline: Headline } | null };
type Preset = '7d' | '30d' | 'season' | 'custom';
type Tab = 'money' | 'busy' | 'misses' | 'golfers';

const usd = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (p: number | null | undefined) => p == null ? '—' : `${Math.round(p)}%`;
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const DAY_NAME: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function rangeFor(p: Preset, today: string): { from: string; to: string } {
  if (p === '7d') return { from: addDays(today, -6), to: today };
  if (p === 'season') {
    // The golf season, Mar 1 → today (last year's Mar 1 before March).
    const y = Number(today.slice(0, 4)) - (today.slice(5) < '03-01' ? 1 : 0);
    return { from: `${y}-03-01`, to: today };
  }
  return { from: addDays(today, -29), to: today };
}

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  if (rows.length === 0) { toast('Nothing to download — this is empty for the dates you picked.', 'warn'); return; }
  const esc = (v: string | number | null) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[header, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast(`Downloaded ${name}.csv (${rows.length} row${rows.length === 1 ? '' : 's'}).`, 'ok');
}

/** "↑ 12%" against the period before — green when it moved the right way. */
function Change({ now, prev, unit, goodWhenUp = true }: { now: number | null; prev: number | null | undefined; unit: 'pct' | 'pts'; goodWhenUp?: boolean }) {
  if (now == null || prev == null) return null;
  const diff = now - prev;
  if (Math.abs(diff) < 0.05) return <span className="text-ink-muted">Same as before</span>;
  if (unit === 'pct' && prev === 0) return <span className="text-ink-muted">None before</span>;
  const up = diff > 0;
  const pts = Math.abs(Math.round(diff));
  const text = unit === 'pts' ? `${pts} pt${pts === 1 ? '' : 's'}` : `${Math.abs(Math.round((diff / prev) * 100))}%`;
  return <span className={'font-semibold ' + (up === goodWhenUp ? 'text-ok' : 'text-bad')}>{up ? '↑' : '↓'} {text}</span>;
}

function Big({ label, value, explain, change }: { label: string; value: string; explain: string; change?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="text-[13px] font-semibold text-ink">{label}</div>
      <div className="mt-1.5 text-[30px] leading-none font-semibold text-ink tabular-nums">{value}</div>
      {change && <div className="mt-2 text-[12.5px]">{change} <span className="text-ink-muted">vs before</span></div>}
      <div className="mt-1 text-[12.5px] text-ink-soft leading-snug">{explain}</div>
    </div>
  );
}

function Bar({ value, max, tone = 'pine' }: { value: number; max: number; tone?: 'pine' | 'soft' | 'bad' }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  const bg = tone === 'pine' ? 'bg-pine' : tone === 'bad' ? 'bg-bad/70' : 'bg-line-strong';
  return <div className="flex-1 h-2.5 bg-line-soft rounded-full overflow-hidden"><div className={'h-full rounded-full ' + bg} style={{ width: `${w}%` }} /></div>;
}

function BarRow({ label, value, max, right, labelW = 'w-24' }: { label: string; value: number; max: number; right: string; labelW?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className={labelW + ' shrink-0 text-ink'}>{label}</span>
      <Bar value={value} max={max} />
      <span className="w-14 shrink-0 text-right tabular-nums font-semibold text-ink">{right}</span>
    </div>
  );
}

function Line({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-4 py-2 text-[13.5px] ' + (strong ? 'font-semibold' : '')}>
      <span className="text-ink">{label}{sub && <span className="ml-2 text-[12.5px] font-normal text-ink-muted">{sub}</span>}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Download({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="shrink-0 text-[12.5px] font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line-strong">Download CSV</button>;
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft py-2">{empty}</p>;
  return (
    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white"><tr className="text-left">{head.map((h, i) => <th key={h} className={'py-2 pr-4 text-[12.5px] font-semibold text-ink border-b border-line ' + (i > 0 ? 'text-right' : '')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line-soft">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={'py-2 pr-4 tabular-nums ' + (j > 0 ? 'text-right' : 'text-ink')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** "What to look at": plain sentences from the numbers on this page. Nothing is
 *  estimated or invented — each line restates figures the API returned. */
function insights(d: Data): { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string }[] {
  const out: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string }[] = [];
  if (d.behavior.bookings === 0 && d.revenue.collectedCents === 0) return [{ tone: 'neutral', text: 'No bookings in these dates yet, so there is nothing to read into.' }];
  const worstDay = d.unfilled.worstDays[0];
  const worstHour = d.unfilled.worstHours[0];
  if (worstDay && worstHour && d.unfilled.lostCents > 0) out.push({ tone: 'warn', text: `Your emptiest times are ${DAY_NAME[worstDay.dow] ?? worstDay.dow}s and around ${fmtHour(worstHour.hour)}: unsold spots there were worth ${usd(worstDay.lostCents)} and ${usd(worstHour.lostCents)}.` });
  const busiest = [...d.utilization.byDow].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (b.fillPct ?? 0) - (a.fillPct ?? 0))[0];
  if (busiest && (busiest.fillPct ?? 0) > 0) out.push({ tone: 'ok', text: `${DAY_NAME[busiest.dow] ?? busiest.dow} is your busiest day — ${pctS(busiest.fillPct)} of spots booked.` });
  if (d.noShows.count > 0) {
    const repeat = d.noShows.repeat.slice(0, 3).map(r => r.name).join(', ');
    out.push({ tone: 'bad', text: `${plural(d.noShows.count, 'group')} didn’t show up, worth ${usd(d.noShows.impactCents)}.${repeat ? ` Missed more than once: ${repeat}.` : ''}` });
  }
  if (d.cancellations.count > 0) out.push({ tone: 'neutral', text: `${plural(d.cancellations.count, 'booking')} cancelled${d.cancellations.rebookedPct != null ? `; ${pctS(d.cancellations.rebookedPct)} of those times were booked again by someone else` : ''}.` });
  if (d.customers.returningPct != null && d.customers.identified >= 5) out.push({ tone: 'neutral', text: `${pctS(d.customers.returningPct)} of your ${d.customers.identified.toLocaleString()} golfers booked more than once.` });
  if (d.behavior.avgLeadDays != null) out.push({ tone: 'neutral', text: `Golfers book ${d.behavior.avgLeadDays} day${d.behavior.avgLeadDays === 1 ? '' : 's'} ahead on average.` });
  return out.slice(0, 6);
}

// BI-1 (PLATFORM_ROADMAP_SPEC §1): the monthly AI review. Its own fetch — it
// does not follow the date picker. The words are the model's; the numbers in
// them were checked against lib/analytics.ts before the review was stored.
type Review = { month: string; label: string; isBaseline: boolean; thin: boolean; writtenAt: string; review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] } };

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
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
    <Card id="reviews" className="p-5">
      <h2 className="text-[17px] font-semibold text-ink">Your monthly review</h2>
      <p className="text-[13px] text-ink-soft mt-1 mb-4 max-w-[60em]">On the 1st of each month we write up how the month before went: what worked, what fell short and what to try. Your first full month is the starting line every later month is measured against.</p>
      {error && <LoadError message={error} onRetry={load} />}
      {!reviews && !error && <div className="py-4 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
      {reviews && reviews.length === 0 && <p className="text-[13.5px] text-ink">Your first review arrives after your first full month on GreenReserve.</p>}
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
    </Card>
  );
}

function MoneyTab({ d }: { d: Data }) {
  const max = Math.max(...d.revenue.series.map(x => x.expectedCents), 1);
  const per = d.revenue.bucket === 'week' ? 'week' : 'day';
  const rangeBalls = Math.max(0, d.revenue.collectedCents - d.revenue.greenCents - d.revenue.cartCents);
  return (
    <div className="space-y-8">
      <Panel title={`Money collected each ${per}`} action={<Download onClick={() => downloadCsv(`money-${d.range.from}-${d.range.to}`, [per === 'week' ? 'Week of' : 'Date', 'Played (value)', 'Collected', 'Not collected'], d.revenue.series.map(r => [r.key, r.expectedCents / 100, r.collectedCents / 100, r.gapCents / 100]))} />}>
        {d.revenue.series.length === 0 ? <p className="text-[13px] text-ink-soft">No rounds played in these dates yet.</p> : (<>
          <div className="flex items-end gap-[3px] h-36 border-b border-line">
            {d.revenue.series.map(r => (
              <div key={r.key} className="flex-1 h-full flex flex-col justify-end relative group">
                <div className="w-full bg-line-strong/70" style={{ height: `${(Math.max(0, r.expectedCents - r.collectedCents) / max) * 100}%` }} />
                <div className="w-full bg-pine" style={{ height: `${(r.collectedCents / max) * 100}%` }} />
                <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-white text-[11.5px] px-1.5 py-0.5 rounded hidden group-hover:block z-10">{per === 'week' ? 'Week of ' : ''}{fmtDay(r.key)}: {usd(r.collectedCents)} collected{r.gapCents > 0 ? `, ${usd(r.gapCents)} not` : ''}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-muted mt-1.5">
            <span>{fmtDay(d.revenue.series[0].key)}</span>
            <span className="flex gap-4"><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-pine inline-block" />Collected</span><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-line-strong inline-block" />Booked, not collected</span></span>
            <span>{fmtDay(d.revenue.series.at(-1)!.key)}</span>
          </div>
        </>)}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-8">
        <Panel title="Where it came from">
          <div className="divide-y divide-line-soft">
            <Line label="Green fees" value={usd(d.revenue.greenCents)} />
            <Line label="Carts" value={usd(d.revenue.cartCents)} />
            {rangeBalls > 0 && <Line label="Range balls" value={usd(rangeBalls)} />}
            <Line label="Total collected" value={usd(d.revenue.collectedCents)} strong />
            {d.revenue.lateFeesKeptCents > 0 && <Line label="Plus late-cancel fees kept" value={usd(d.revenue.lateFeesKeptCents)} />}
          </div>
          <p className="text-[12.5px] text-ink-muted mt-2">Your share only. GreenReserve’s booking fee is paid by the golfer and isn’t counted here.</p>
        </Panel>
        <Panel title="How it was paid">
          <div className="divide-y divide-line-soft">
            <Line label="Card, at check-in" value={usd(d.revenue.cardCents)} />
            <Line label="At the counter" value={usd(d.revenue.counterCents)} />
            <Line label="Tee time passed, never paid" sub={`${plural(d.revenue.outstandingBookings, 'group')}, no-shows included`} value={usd(d.revenue.outstandingCents)} />
            <Line label="Average per round" sub={plural(d.revenue.roundsPlayed, 'round')} value={usd2(d.revenue.perRoundCents)} />
          </div>
        </Panel>
      </div>

      <Panel title="Booked and still to come">
        <div className="divide-y divide-line-soft max-w-xl">
          <Line label="Upcoming bookings" sub={plural(d.revenue.pipeline.upcomingBookings, 'booking')} value={usd(d.revenue.upcomingCents)} />
          <Line label="With a card saved" sub={plural(d.revenue.pipeline.cardOnFile.bookings, 'booking')} value={`about ${usd(d.revenue.pipeline.cardOnFile.cents)}`} />
          {d.revenue.holdsHeldCents > 0 && <Line label="Cancellation holds taken" sub="refunded when they check in" value={usd(d.revenue.holdsHeldCents)} />}
        </div>
      </Panel>
    </div>
  );
}

function BusyTab({ d }: { d: Data }) {
  const emptiest = [...d.unfilled.rows].sort((a, b) => b.lostCents - a.lostCents).slice(0, 12);
  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-2 gap-8">
        <Panel title="How full each day of the week is">
          <div className="space-y-2">{d.utilization.byDow.map(r => <BarRow key={r.dow} label={DAY_NAME[r.dow] ?? r.dow} value={r.fillPct ?? 0} max={100} right={pctS(r.fillPct)} />)}</div>
        </Panel>
        <Panel title="How full each hour is">
          {d.utilization.byHour.length === 0 ? <p className="text-[13px] text-ink-soft">No tee times in these dates.</p>
            : <div className="space-y-2">{d.utilization.byHour.map(r => <BarRow key={r.hour} label={fmtHour(r.hour)} labelW="w-14" value={r.fillPct ?? 0} max={100} right={pctS(r.fillPct)} />)}</div>}
        </Panel>
      </div>

      <Panel title="Every hour of every day" action={<Download onClick={() => downloadCsv(`how-full-${d.range.from}-${d.range.to}`, ['Day', ...d.utilization.heatmap.hours.map(h => `${h}:00`)], d.utilization.heatmap.rows.map(r => [r.dow, ...r.cells]))} />}>
        <p className="text-[12.5px] text-ink-soft -mt-1 mb-3">Darker is fuller. Each number is the share of spots booked.</p>
        {d.utilization.heatmap.hours.length === 0 ? <p className="text-[13px] text-ink-soft">No tee times in these dates.</p> : (
          <div className="overflow-x-auto">
            <table className="text-[12px] tabular-nums">
              <thead><tr><th />{d.utilization.heatmap.hours.map(h => <th key={h} className="px-0.5 pb-1 font-semibold text-ink-muted">{fmtHour(h)}</th>)}</tr></thead>
              <tbody>{d.utilization.heatmap.rows.map(r => (
                <tr key={r.dow}><td className="pr-3 text-ink">{r.dow}</td>{r.cells.map((c, i) => (
                  <td key={i} className="p-0.5"><div title={c == null ? 'No tee times' : `${Math.round(c)}% booked`}
                    className={'w-12 h-8 rounded flex items-center justify-center ' + (c == null ? 'bg-paper text-ink-faint' : c >= 60 ? 'text-white' : 'text-ink')}
                    style={c == null ? undefined : { background: `color-mix(in srgb, var(--color-pine) ${Math.round(8 + c * 0.92)}%, white)` }}>{c == null ? '' : `${Math.round(c)}`}</div></td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Tee times that went out with empty spots" action={<Download onClick={() => downloadCsv(`empty-spots-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Spots open', 'Worth'], d.unfilled.rows.map(r => [r.date, r.time, r.open, r.lostCents / 100]))} />}>
        <p className="text-[12.5px] text-ink-soft -mt-1 mb-3">{plural(d.unfilled.slots, 'tee time')} with {plural(d.unfilled.openSpots, 'open spot')}, worth {usd(d.unfilled.lostCents)} at their green fee. The biggest are first.</p>
        <Table head={['Day', 'Time', 'Spots open', 'Worth']} empty="Every tee time in these dates went out full."
          rows={emptiest.map(r => [fmtDay(r.date), fmtTime(r.time), r.open, usd(r.lostCents)])} />
      </Panel>
    </div>
  );
}

function MissesTab({ d }: { d: Data }) {
  const c = d.cancellations;
  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <Panel title="No-shows" action={<Download onClick={() => downloadCsv(`no-shows-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Worth', 'Marked by staff'], d.noShows.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.marked ? 'yes' : 'no']))} />}>
        <p className="text-[13.5px] text-ink mb-2">{d.noShows.count === 0 ? 'Nobody missed their tee time.' : <>{plural(d.noShows.count, 'group')} ({pctS(d.noShows.ratePct)} of bookings) never checked in, worth {usd(d.noShows.impactCents)}.</>}</p>
        <p className="text-[12.5px] text-ink-muted mb-5">Counted when a group hasn’t checked in {d.graceMinutes} minutes after its tee time, whether or not staff marked it.</p>
        <h4 className="text-[13px] font-semibold text-ink mb-1">Missed more than once</h4>
        <Table head={['Golfer', 'Times']} empty="Nobody missed more than once." rows={d.noShows.repeat.map(r => [r.name, r.count])} />
      </Panel>
      <Panel title="Cancellations" action={<Download onClick={() => downloadCsv(`cancellations-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Worth', 'Cancelled at', 'Cancelled by'], c.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.cancelledAt, r.by ?? 'not tracked']))} />}>
        <p className="text-[13.5px] text-ink mb-5">{c.count === 0 ? 'No cancellations.' : <>{plural(c.count, 'booking')} cancelled ({pctS(c.ratePct)}). {usd(c.lateFeesKeptCents)} in late fees kept{c.rebookedPct != null ? `; ${pctS(c.rebookedPct)} of those times were booked again` : ''}.</>}</p>
        {c.count > 0 && (<>
          <h4 className="text-[13px] font-semibold text-ink mb-2">How long before the tee time</h4>
          <div className="space-y-2 mb-5">
            {([['Under a day', c.lead.under24h], ['1 to 3 days', c.lead.d1to3], ['More than 3 days', c.lead.over3d]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} labelW="w-32" value={v} max={Math.max(c.count, 1)} right={String(v)} />)}
          </div>
          <h4 className="text-[13px] font-semibold text-ink mb-1">Who cancelled</h4>
          {c.byCustomer + c.byStaff === 0 ? <p className="text-[12.5px] text-ink-muted">Tracked from {fmtDay(d.eventLogStart)} on.</p> : (
            <div className="divide-y divide-line-soft">
              <Line label="The golfer" value={String(c.byCustomer)} />
              <Line label="Your staff" value={String(c.byStaff)} />
              {c.actorUnknown > 0 && <Line label="Before we tracked it" value={String(c.actorUnknown)} />}
            </div>
          )}
        </>)}
      </Panel>
    </div>
  );
}

function GolfersTab({ d }: { d: Data }) {
  const g = d.customers;
  const b = d.behavior;
  const fig = (label: string, value: string, sub: string) => (
    <div><div className="text-[13px] font-semibold text-ink">{label}</div><div className="text-[24px] font-semibold tabular-nums mt-1 text-ink">{value}</div><div className="text-[12.5px] text-ink-soft mt-1">{sub}</div></div>
  );
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {fig('Golfers', g.identified.toLocaleString(), `${g.newCustomers} new, ${g.returning} came back`)}
        {fig('Came back', pctS(g.returningPct), 'booked more than once')}
        {fig('Kept from before', pctS(g.retentionPct), `${g.retained} of ${g.previousCustomers} played again`)}
        {fig('Members', String(g.members.active), `active, of ${g.members.onFile} on file`)}
      </div>

      <Panel title="Your regulars" action={<Download onClick={() => downloadCsv(`regulars-${d.range.from}-${d.range.to}`, ['Golfer', 'Bookings', 'Players', 'Spent'], g.topByRounds.map(r => [r.name, r.rounds, r.players, r.spendCents / 100]))} />}>
        <Table head={['Golfer', 'Bookings', 'Players', 'Spent']} empty="No golfers to show yet." rows={g.topByRounds.map(r => [r.name, r.rounds, r.players, usd(r.spendCents)])} />
        {g.unidentifiedBookings > 0 && <p className="text-[12.5px] text-ink-muted mt-2">{plural(g.unidentifiedBookings, 'walk-in')} had no email or phone, so they can’t be counted here. Take a phone number at the counter.</p>}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-8">
        <Panel title="How they book">
          <div className="space-y-2">
            {([['Online', b.channel.online ?? 0], ['Walked in', b.channel.walk_in ?? 0], ['By phone', b.channel.phone ?? 0]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} value={v} max={Math.max(b.bookings, 1)} right={String(v)} />)}
          </div>
          {b.avgGroupSize != null && <p className="text-[12.5px] text-ink-soft mt-3">Groups average {b.avgGroupSize} players.</p>}
        </Panel>
        <Panel title="How far ahead they book">
          <div className="space-y-2">
            {([['Same day', b.lead.sameDay], ['1–2 days', b.lead.d1to2], ['3–7 days', b.lead.d3to7], ['8–14 days', b.lead.d8to14], ['15+ days', b.lead.d15plus]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} value={v} max={Math.max(b.bookings, 1)} right={String(v)} />)}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const TABS: [Tab, string][] = [['money', 'Money'], ['busy', 'Busy times'], ['misses', 'No-shows & cancellations'], ['golfers', 'Golfers']];

function AnalyticsInner() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [today, setToday] = useState('');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [tab, setTab] = useState<Tab>('money');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Review (admin-UX): a refusal is not a failure — a staff login gets a plain
  // explanation and a way back, never a Retry that can only fail again.
  const [denied, setDenied] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const seq = useRef(0); // only the newest request may write state

  const load = useCallback(async (p: Preset, c: { from: string; to: string }, t: string) => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    const r = p === 'custom' ? c : t ? rangeFor(p, t) : null;
    const qs = new URLSearchParams({ ...(r ? r : {}), compare: '1' });
    const res = await dfetch<Data>(`/api/operator/analytics?${qs}`);
    if (mine !== seq.current) return; // a newer click superseded this one
    if (res.ok) { setData(res.data); if (!t) setToday(res.data.today); if (!c.from) setCustom({ from: res.data.range.from, to: res.data.range.to }); }
    else if (res.status === 403) setDenied(true);
    else if (res.status === 401) setSignedOut(true);
    else setError(res.error);
    setLoading(false);
  }, []);
  const customInvalid = !!custom.from && !!custom.to && custom.from > custom.to;

  useEffect(() => { load('30d', { from: '', to: '' }, ''); }, [load]);

  const pick = (p: Preset) => { setPreset(p); if (p !== 'custom') load(p, custom, today); };
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

  const before = d?.compare ? `${fmtDay(d.compare.range.from)} – ${fmtDay(d.compare.range.to)}` : '';
  const notes = d ? insights(d) : [];

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h1 className="text-[30px] font-serif font-semibold leading-none text-ink">How your course is doing</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">
                {d ? <>{fmtDay(d.range.from)} – {fmtDay(d.range.to)}{before ? <>, compared with {before}</> : null}</> : 'Loading…'}
              </p>
            </div>
            <div className="inline-flex flex-wrap rounded-md border border-line overflow-hidden text-[13px] font-medium bg-white" role="group" aria-label="Dates">
              {([['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['season', 'This season'], ['custom', 'Pick dates']] as [Preset, string][]).map(([k, l]) => (
                <button key={k} onClick={() => pick(k)} aria-pressed={preset === k}
                  className={'px-3 py-1.5 transition-colors ' + (preset === k ? 'bg-pine text-white' : 'text-ink-soft hover:text-ink')}>{l}</button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center justify-end gap-2 -mt-3 mb-6 text-[13px]">
              <input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="bg-white border border-line rounded-md px-2.5 py-1.5" aria-label="From" />
              <span className="text-ink-muted">to</span>
              <input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="bg-white border border-line rounded-md px-2.5 py-1.5" aria-label="To" />
              {customInvalid && <span className="text-bad">The start date is after the end date — swap them.</span>}
              <button onClick={() => load('custom', custom, today)} disabled={!custom.from || !custom.to || customInvalid}
                className="px-3 py-1.5 rounded-md bg-pine text-white font-semibold disabled:opacity-50">Show</button>
            </div>
          )}

          {error && <div className="mb-5"><LoadError message={d ? `${error} Still showing ${fmtDay(d.range.from)} – ${fmtDay(d.range.to)}.` : error} onRetry={() => load(preset, custom, today)} /></div>}
          {loading && !d && <div className="py-24 text-center text-ink-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}

          {d && (
            <div className={'space-y-5 ' + (loading ? 'opacity-60 pointer-events-none' : '')}>
              {/* 1. The four numbers */}
              <Card className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 lg:divide-x divide-line">
                <Big label="Money collected" value={usd(d.revenue.collectedCents)}
                  change={<Change now={d.headline.collectedCents} prev={prev?.collectedCents} unit="pct" />}
                  explain="green fees, carts and range balls paid to you" />
                <Big label="Tee sheet filled" value={pctS(d.utilization.fillPct)}
                  change={<Change now={d.headline.fillPct} prev={prev?.fillPct} unit="pts" />}
                  explain={`${d.utilization.spotsBooked.toLocaleString()} of ${d.utilization.spotsForSale.toLocaleString()} spots booked`} />
                <Big label="Bookings" value={d.behavior.bookings.toLocaleString()}
                  change={<Change now={d.headline.bookings} prev={prev?.bookings} unit="pct" />}
                  explain={plural(d.behavior.players, 'player')} />
                <Big label="Empty spots" value={usd(d.unfilled.lostCents)}
                  change={<Change now={d.headline.lostCents} prev={prev?.lostCents} unit="pct" goodWhenUp={false} />}
                  explain="what tee times that went out unsold would have earned" />
              </Card>

              {/* 2. What to look at */}
              <Card className="p-5">
                <h2 className="text-[17px] font-semibold text-ink mb-3">What to look at</h2>
                <ul className="space-y-2.5">
                  {notes.map((n, i) => (
                    <li key={i} className="flex items-baseline gap-2.5 text-[14px] text-ink leading-snug">
                      <span className="-translate-y-[2px]"><StatusDot status={n.tone} /></span>
                      <span>{n.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* 3. The monthly AI review */}
              <MonthlyReviews />

              {/* 4. The detail, one subject at a time */}
              <Card className="p-5">
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line mb-6" role="tablist">
                  {TABS.map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={'pb-2.5 -mb-px text-[14px] font-semibold border-b-2 transition-colors ' + (tab === k ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{l}</button>
                  ))}
                </div>
                {tab === 'money' && <MoneyTab d={d} />}
                {tab === 'busy' && <BusyTab d={d} />}
                {tab === 'misses' && <MissesTab d={d} />}
                {tab === 'golfers' && <GolfersTab d={d} />}
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

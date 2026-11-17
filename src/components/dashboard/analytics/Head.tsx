'use client';
// ANALYTICS-5 (Cam 2026-11-17, approved mockup): the four headline numbers on the page (Cam 2026-11-16 "take out of
// card"), each against the 30 days before. The one picked is drawn below: a line over its area, the period before
// dashed, weekends shaded, the average dotted, best and slowest day named, a crosshair with both days on hover.
// Revenue is the ledger's (Build's `ledger` block, the Revenue page's basis; money.payments only) — never computeAnalytics' money.
import Link from 'next/link';
import { useRef, useState } from 'react';
import { type Data, type Ledger, change, dayShort, dayWeek, isWeekend, num, pct, usd } from './data';

export type Metric = 'rev' | 'book' | 'rounds' | 'fill';
type Point = { key: string; v: number | null };
type Tile = { key: Metric; label: string; value: string; delta: ReturnType<typeof change>; now: Point[]; before: Point[] | null; fmt: (v: number) => string };

/** The tiles this login and this data can show, in the mockup's order. */
export function tilesOf(d: Data, ledger: Ledger | null): Tile[] {
  const day = d.revenue.bucket === 'day';
  const prev = d.compare?.headline;
  // Weekly buckets are calendar weeks and the period before starts on another weekday: compare day by day only.
  const before = day && d.compare?.series && d.compare.series.length === d.revenue.series.length ? d.compare.series : null;
  const s = d.revenue.series;
  const tiles: Tile[] = [];
  if (ledger) {
    // The dashed line only day by day, and only when the period before lines up point for point.
    const b = ledger.beforeSeries && ledger.beforeSeries.length === ledger.series.length && ledger.series.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.key)) && ledger.series.length <= 62 ? ledger.beforeSeries : null;
    tiles.push({ key: 'rev', label: 'Revenue', value: usd(ledger.grossCents), delta: change(ledger.grossCents, ledger.beforeGrossCents, 'pct'),
      now: ledger.series.map(x => ({ key: x.key, v: x.cents })), before: b ? b.map(x => ({ key: x.key, v: x.cents })) : null, fmt: usd });
  }
  const hasBookings = s.length > 0 && s.every(x => typeof x.bookings === 'number');
  tiles.push({ key: 'book', label: 'Bookings', value: num(d.headline.bookings), delta: change(d.headline.bookings, prev?.bookings, 'pct'),
    now: hasBookings ? s.map(x => ({ key: x.key, v: x.bookings ?? 0 })) : [], before: hasBookings && before?.every(x => typeof x.bookings === 'number') ? before.map(x => ({ key: x.key, v: x.bookings ?? 0 })) : null, fmt: num });
  tiles.push({ key: 'rounds', label: 'Rounds played', value: num(d.revenue.roundsPlayed), delta: change(d.revenue.roundsPlayed, prev?.roundsPlayed, 'pct'),
    now: s.map(x => ({ key: x.key, v: x.rounds })), before: before ? before.map(x => ({ key: x.key, v: x.rounds })) : null, fmt: num });
  tiles.push({ key: 'fill', label: 'Tee sheet filled', value: pct(d.utilization.fillPct), delta: change(d.utilization.fillPct, prev?.fillPct, 'pts'),
    now: s.map(x => ({ key: x.key, v: x.fillPct })), before: before ? before.map(x => ({ key: x.key, v: x.fillPct })) : null, fmt: v => `${Math.round(v)}%` });
  return tiles;
}

export function Head({ d, ledger, metric, setMetric }: { d: Data; ledger: Ledger | null; metric: Metric; setMetric: (m: Metric) => void }) {
  const tiles = tilesOf(d, ledger);
  const drawable = tiles.filter(t => t.now.length > 1);
  const cur = drawable.find(t => t.key === metric) ?? drawable[0];
  const cols = tiles.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return (
    <section aria-label="Last month at a glance">
      <div className={'grid grid-cols-2 border-b border-line ' + cols} role="tablist" aria-label="Chart">
        {tiles.map((t, i) => {
          const on = cur?.key === t.key, can = t.now.length > 1;
          const body = (<>
            <span className={'col-span-full text-[13px] ' + (on ? 'text-ink-soft' : 'text-ink-muted')}>{t.label}</span>
            <b className="text-[21px] sm:text-[24px] font-semibold tabular-nums text-ink">{t.value}</b>
            {t.delta && <small className={'text-[12.5px] font-medium ' + (t.delta.text === 'Same' ? 'text-ink-muted' : t.delta.up ? 'text-ok' : 'text-bad')}>{t.delta.text}</small>}
          </>);
          // Two by two on a phone, one row of four on a wide screen; a rule between neighbours, the picked one underlined.
          const cls = 'grid grid-cols-1 sm:grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-0.5 text-left min-h-[44px] pt-2.5 pb-3 sm:pt-1 sm:pb-3.5 lg:pr-[18px] ' +
            (i % 2 ? 'pl-3 border-l border-line ' : 'pr-3 ') + (i > 0 ? 'lg:pl-[18px] lg:border-l lg:border-line ' : '') +
            (i < 2 && tiles.length > 2 ? 'max-lg:border-b max-lg:border-line ' : '') + (on ? 'shadow-[inset_0_-2px_0_var(--color-ink)]' : '');
          return can
            ? <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setMetric(t.key)} className={cls + ' hover:bg-ink/[.03]'}>{body}</button>
            : <div key={t.key} className={cls}>{body}</div>;
        })}
      </div>
      {cur ? <Chart t={cur} showLink={cur.key === 'rev'} /> : <p className="py-10 text-center text-[13px] text-ink-muted">The chart fills in after a few days of rounds.</p>}
    </section>
  );
}

const W = 900, H = 150;
function Chart({ t, showLink }: { t: Tile; showLink: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const v = t.now.map(p => p.v ?? 0), p = t.before?.map(x => x.v ?? 0) ?? null;
  const n = v.length;
  const mx = Math.max(1, ...v, ...(p ?? [])) * 1.12;
  const sx = (i: number) => (n > 1 ? i * (W / (n - 1)) : 0), sy = (x: number) => H - (x / mx) * H;
  const avg = v.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const best = v.indexOf(Math.max(...v)), worst = v.indexOf(Math.min(...v));
  // Best and Slowest only when one day actually beat another.
  const spread = n > 1 && v[best] > v[worst];
  const daily = t.now.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.key)) && n <= 62;
  const ticks = [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1].filter((x, i, a) => a.indexOf(x) === i);
  const move = (clientX: number) => { const r = box.current?.getBoundingClientRect(); if (!r) return; setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1))))); };
  const label = (k: string) => (daily ? dayWeek(k) : `Week of ${dayShort(k)}`);
  return (
    <div className="pt-3.5">
      <div ref={box} className="relative cursor-crosshair" onMouseMove={e => move(e.clientX)} onMouseLeave={() => setHover(null)}
        role="img" aria-label={`${t.label} each ${daily ? 'day' : 'week'}: ${t.now.map((x, i) => `${dayShort(x.key)} ${t.fmt(v[i])}`).join(', ')}`}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[150px] text-ink" aria-hidden="true">
          {daily && t.now.map((x, i) => isWeekend(x.key) && <rect key={x.key} x={sx(i) - W / Math.max(1, n - 1) / 2} y={0} width={W / Math.max(1, n - 1)} height={H} fill="currentColor" opacity={0.045} />)}
          <path d={`M0,${H} ${v.map((x, i) => `L${sx(i)},${sy(x)}`).join(' ')} L${W},${H}Z`} fill="currentColor" opacity={0.12} />
          {p && <polyline fill="none" points={p.map((x, i) => `${sx(i)},${sy(x)}`).join(' ')} className="text-ink-muted" stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
          <polyline fill="none" points={v.map((x, i) => `${sx(i)},${sy(x)}`).join(' ')} stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={W} y1={sy(avg)} y2={sy(avg)} className="text-ink-muted" stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={W} y1={H} y2={H} className="text-line" stroke="currentColor" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover != null && (<>
          <div className="absolute top-0 bottom-0 w-px bg-ink-soft pointer-events-none" style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }} />
          <div className="absolute top-1.5 -translate-x-1/2 z-10 flex flex-col gap-0.5 rounded-[10px] border border-line shadow-card px-2.5 py-2 text-[12.5px] text-ink-soft whitespace-nowrap pointer-events-none"
            style={{ left: `min(max(${(hover / Math.max(1, n - 1)) * 100}%, 80px), calc(100% - 80px))`, backgroundColor: 'var(--op-panel-solid)' }}>
            <b className="text-ink">{label(t.now[hover].key)}</b>
            <span>{t.label} <b className="text-ink tabular-nums">{t.now[hover].v == null ? '—' : t.fmt(v[hover])}</b></span>
            {p && <span>Same day before <b className="text-ink tabular-nums">{t.before![hover].v == null ? '—' : t.fmt(p[hover])}</b></span>}
          </div>
        </>)}
      </div>
      <div className="flex justify-between mt-1.5 text-[11.5px] text-ink-muted tabular-nums">{ticks.map(i => <span key={i}>{dayShort(t.now[i].key)}</span>)}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-[12.5px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 h-0.5 bg-ink" />This period</span>
        {p && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 border-t-2 border-dashed border-ink-muted" />Period before</span>}
        {daily && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-ink opacity-[.12]" />Weekends</span>}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 border-t-[1.5px] border-dotted border-ink-muted" />Average {t.fmt(avg)}</span>
        <span className="flex-1 max-md:hidden" />
        {spread && <span>Best <b className="text-ink font-semibold">{label(t.now[best].key)}</b> {t.fmt(v[best])}</span>}
        {spread && <span>Slowest <b className="text-ink font-semibold">{label(t.now[worst].key)}</b> {t.fmt(v[worst])}</span>}
        {showLink && <Link href="/dashboard/money" className="text-ink-soft underline underline-offset-[3px] decoration-line hover:text-ink">Revenue</Link>}
      </div>
    </div>
  );
}

'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (approved mockup, Cam 2026-11-15): the top of Revenue — today against the 30-day average, the next payout
// in its own card, one date range for the whole page, the revenue chart (by day · day of week · time of day), and what
// was sold beside how it was paid. Numbers are /api/operator/money/sales (computeAnalytics' definitions) and Stripe's
// payouts; the GreenReserve booking fee is never in them.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Kv, Seg, IconButton, Icon, BTN, LINK, useOutside, usd, usd2, usdk, dayLong, dayShort, clock12, dowOf, addDays, spanDays } from './ui';
import type { Sales, PayoutsData, Range, RangeKey } from './data';

const Y_AXIS = 'absolute -left-11 w-[38px] text-right text-[11px] text-ink-muted tabular-nums -translate-y-1/2';
function niceStep(max: number, n: number) {
  const raw = Math.max(1, max) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  // Whole dollars at least, so two gridlines never read the same ("$0 $0 $0").
  return Math.max(100, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p);
}
const pctChange = (now: number, before: number) => before > 0 ? Math.round(((now - before) / before) * 100) : null;
function Change({ pct, tail }: { pct: number | null; tail: ReactNode }) {
  if (pct === null) return null;
  return <div className="text-[13px] font-semibold tabular-nums"><b className={pct >= 0 ? 'text-ok' : 'text-bad'}>{pct >= 0 ? 'Up ' : 'Down '}{Math.abs(pct)}%</b> <span className="font-normal text-ink-muted">{tail}</span></div>;
}

/** Today so far, running through the day; the dashed 30-day average once the route sends it. */
export function TodayCard({ s }: { s: Sales }) {
  const H0 = 360, H1 = 1200;
  // Build's todayVsAverage: both lines by payment time from the ledger. Without it, today alone from todayByHour.
  const tva = s.todayVsAverage ?? null;
  const nowMin = tva ? tva.nowMinute : Number(s.clock.slice(0, 2)) * 60 + Number(s.clock.slice(3, 5));
  let today: [number, number][] = [];
  if (tva) today = tva.points.filter(p => p.todayCents !== null && p.minute >= H0 && p.minute <= H1).map(p => [p.minute, p.todayCents!] as [number, number]);
  else {
    const at = new Map(s.todayByHour.map(r => [r.hour, r.collectedCents]));
    let sum = 0;
    for (const r of s.todayByHour) if (r.hour * 60 < H0) sum += r.collectedCents;
    today = [[H0, sum]];
    for (let m = H0; m < Math.min(nowMin, H1); m += 60) { sum += at.get(m / 60) ?? 0; today.push([Math.min(m + 60, nowMin), sum]); }
  }
  const todayNow = tva ? tva.todayNowCents : s.todayCollectedCents;
  if (tva && nowMin > H0 && nowMin < H1 && (today.length === 0 || today[today.length - 1][0] < nowMin)) today.push([nowMin, todayNow]);
  const avg = tva ? { toNowCents: tva.avgNowCents, days: tva.days } : null;
  const avgLabel = `Average of the last ${avg && avg.days < 30 ? `${avg.days} days` : '30 days'}`;
  const avgPts: [number, number][] = tva ? tva.points.filter(p => p.minute >= H0 && p.minute <= H1).map(p => [p.minute, p.avgCents]) : [];
  const max = Math.max(1, todayNow, ...today.map(p => p[1]), ...avgPts.map(p => p[1]));
  const st = niceStep(max, 3), top = Math.ceil(max / st) * st;
  const W = 1000, H = 160;
  const X = (m: number) => ((m - H0) / (H1 - H0)) * W, Y = (v: number) => H - (v / top) * H;
  const P = (a: [number, number][]) => a.map(([m, v]) => `${X(m).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const nowX = X(Math.min(Math.max(nowMin, H0), H1));
  // Nothing taken yet (every course at launch): one $0 baseline, no scale.
  const empty = max <= 1 && avgPts.every(p => p[1] === 0);
  const ticks: number[] = []; if (empty) ticks.push(0); else for (let v = 0; v <= top + 1e-6; v += st) ticks.push(v);
  const [hover, setHover] = useState<number | null>(null);
  const valueAt = (pts: [number, number][], m: number) => { let v = 0; for (const [pm, pv] of pts) if (pm <= m) v = pv; return v; };
  const pct = avg ? pctChange(todayNow, avg.toNowCents) : null;
  return (
    <section className={`${CARD} !rounded-[16px] px-5 py-[18px] min-w-0`} aria-label="Today">
      <div className="flex flex-wrap items-end gap-x-9 gap-y-3 mb-3.5">
        <div><div className="text-[13px] text-ink-muted">Today so far</div><div className="text-[28px] font-semibold tabular-nums leading-tight text-ink">{usd(todayNow)}</div></div>
        {avg && <div><div className="text-[13px] text-ink-muted">{avgLabel} by {clock12(nowMin)}</div><div className="text-[28px] font-semibold tabular-nums leading-tight text-ink-muted">{usd(avg.toNowCents)}</div></div>}
        {avg && <div className="pb-[5px]"><Change pct={pct} tail="so far" /></div>}
      </div>
      <div className="relative h-40 ml-11 max-md:ml-[38px]"
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const m = H0 + Math.round(((e.clientX - r.left) / r.width) * (H1 - H0) / 30) * 30; setHover(Math.max(H0, Math.min(H1, m))); }}
        onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" role="img"
          aria-label={`Revenue so far today ${usd(todayNow)}${avg ? ` against an average of ${usd(avg.toNowCents)} by this time` : ''}`}>
          {ticks.map(v => <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} stroke="currentColor" className={v ? 'text-ink/10' : 'text-line'} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {today.length > 1 && <polygon points={`${X(today[0][0])},${H} ${P(today)} ${X(today[today.length - 1][0])},${H}`} fill="currentColor" className="text-ink" fillOpacity="0.08" />}
          {avgPts.length > 1 && <polyline points={P(avgPts)} fill="none" stroke="currentColor" className="text-ink-muted" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          {today.length > 1 && <polyline points={P(today)} fill="none" stroke="currentColor" className="text-ink" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {nowMin > H0 && nowMin < H1 && <line x1={nowX} x2={nowX} y1="0" y2={H} stroke="currentColor" className="text-ink-muted" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
          {hover !== null && <line x1={X(hover)} x2={X(hover)} y1="0" y2={H} stroke="currentColor" className="text-ink-soft" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {nowMin > H0 && nowMin < H1 && <span aria-hidden="true" className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-ink border-2" style={{ left: `${(nowX / W) * 100}%`, top: `${(Y(todayNow) / H) * 100}%`, borderColor: 'var(--op-panel-solid)' }} />}
        {ticks.map(v => <span key={v} className={Y_AXIS} style={{ top: `${(Y(v) / H) * 100}%` }}>{usdk(v)}</span>)}
        {empty && <p className="absolute inset-0 grid place-items-center text-[13px] text-ink-muted">No payments yet today</p>}
        {hover !== null && (
          <div className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full bg-ink text-page text-[12px] px-2.5 py-1.5 rounded-[8px] whitespace-nowrap tabular-nums shadow-card" style={{ left: `clamp(60px, ${(X(hover) / W) * 100}%, calc(100% - 60px))`, top: -6 }}>
            <b className="block text-[13px]">{clock12(hover)}</b>
            {hover <= nowMin ? `Today ${usd(valueAt(today, hover))}` : ''}{hover <= nowMin && avg ? ' · ' : ''}{avg ? `Average ${usd(valueAt(avgPts, hover))}` : ''}
          </div>
        )}
      </div>
      <div className="relative h-4 mt-1.5 ml-11 max-md:ml-[38px] text-[11.5px] text-ink-muted tabular-nums">
        {[6, 8, 10, 12, 14, 16, 18, 20].map(h => <span key={h} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(X(h * 60) / W) * 100}%` }}>{h % 12 || 12}{h < 12 ? 'a' : 'p'}</span>)}
      </div>
      <div className="flex gap-4 mt-2 text-[12px] text-ink-soft">
        <span><i className="inline-block w-4 border-t-2 border-ink mr-1.5 align-middle" />Today</span>
        {avg && <span><i className="inline-block w-4 border-t-2 border-dashed border-ink-muted mr-1.5 align-middle" />{avgLabel}</span>}
      </div>
    </section>
  );
}

/** The next payout, what is ready to pay out, the last one in the bank. */
export function NextPayoutCard({ data, connected, error, onAll }: { data: PayoutsData | null; connected: boolean | null; error: string; onAll?: () => void }) {
  const next = data?.next ?? null;
  const last = data?.payouts.filter(p => p.status === 'paid').sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate))[0] ?? null;
  return (
    <section className={`${CARD} !rounded-[16px] px-5 py-[18px] min-w-0 flex flex-col gap-1`} aria-label="Next payout">
      <div className="text-[13px] text-ink-muted">Next payout</div>
      {error ? <p className="text-[13.5px] text-bad mt-1">Couldn&apos;t read your payouts from Stripe.</p>
        : connected === false ? <><div className="text-[15px] font-semibold text-ink mt-1">Connect Stripe</div><p className="text-[12.5px] text-ink-muted">Card payments reach your bank once Stripe is connected.</p></>
        : !data ? <p className="text-[13.5px] text-ink-muted mt-1">Checking Stripe…</p>
        : <>
          <div className="text-[28px] font-semibold tabular-nums leading-tight text-ink">{next ? usd2(next.amountCents) : '—'}</div>
          <div className="text-[12.5px] text-ink-muted tabular-nums">{next ? `On its way · arrives ${dayLong(next.arrivalDate)}` : 'None on its way'}</div>
          <div className="border-t border-line mt-3 mb-2" />
          {data.balance && <Kv first label="Ready to pay out" value={usd2(data.balance.availableCents + data.balance.pendingCents)} />}
          {last && <Kv first label={`Last payout · arrived ${dayLong(last.arrivalDate)}`} value={usd2(last.amountCents)} />}
        </>}
      {onAll && <div className="mt-auto pt-2"><button type="button" onClick={onAll} className={LINK}>All payouts</button></div>}
    </section>
  );
}

export function rangeOf(key: RangeKey, today: string, custom?: Range): Range {
  if (key === '7') return { from: addDays(today, -6), to: today };
  if (key === 'month') return { from: today.slice(0, 8) + '01', to: today };
  if (key === 'custom' && custom) return custom;
  return { from: addDays(today, -29), to: today };
}
export const rangeText = (r: Range) => `${dayShort(r.from)} – ${dayShort(r.to)}, ${r.to.slice(0, 4)}`;

/** One date range for the whole page: three presets and a calendar for any dates. */
export function RangeBar({ value, rangeKey, today, onChange }: { value: Range; rangeKey: RangeKey; today: string; onChange: (k: RangeKey, r?: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from), [to, setTo] = useState(value.to);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutside<HTMLDivElement>(open, close);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 relative" ref={ref}>
      <Seg label="Dates" value={rangeKey === 'custom' ? null : rangeKey} onChange={k => onChange(k)} options={[['7', '7 days'], ['30', '30 days'], ['month', 'This month']] as const} />
      <IconButton label="Pick dates" expanded={open} onClick={() => { setFrom(value.from); setTo(value.to); setOpen(o => !o); }} className={rangeKey === 'custom' ? 'bg-ink/10' : ''}>{Icon.calendar}</IconButton>
      <span className="text-[13.5px] font-semibold text-ink tabular-nums">{rangeText(value)}</span>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 p-3.5 rounded-[14px] border border-line shadow-card flex flex-wrap items-end gap-2.5" style={{ backgroundColor: 'var(--op-panel-solid)' }}>
          <label className="flex flex-col gap-1 text-[12px] text-ink-muted">From<input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)} className="text-[13.5px] text-ink bg-ink/5 border border-line rounded-[9px] px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-muted">To<input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} className="text-[13.5px] text-ink bg-ink/5 border border-line rounded-[9px] px-2 py-1.5" /></label>
          <button type="button" className={BTN} onClick={() => { if (!from || !to) return; const [a, b] = from <= to ? [from, to] : [to, from]; setOpen(false); onChange('custom', { from: a, to: b }); }}>Show</button>
        </div>
      )}
    </div>
  );
}

type Bar = { label: string; tip: string; v: number };
/** Revenue for the dates: by day, by day of week (an average), by time of day. */
export function RevenueChart({ s, range, total }: { s: Sales; range: Range; total: number }) {
  const [mode, setMode] = useState<'day' | 'dow' | 'hour'>('day');
  const [sel, setSel] = useState<number | null>(null);
  const [tip, setTip] = useState<{ i: number; x: number } | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const d: Bar[] = mode === 'day'
    ? s.series.map(x => ({ label: dayShort(x.key), tip: s.bucket === 'week' ? `Week of ${dayLong(x.key)}` : dayLong(x.key) + (x.key === s.today ? ' · so far' : ''), v: x.collectedCents }))
    : mode === 'dow'
      ? [1, 2, 3, 4, 5, 6, 0].map(w => {
        // An average: the weekday's total over how many of that weekday the dates hold (today, half done, left out).
        let n = 0; for (let x = range.from; x <= range.to; x = addDays(x, 1)) if (dowOf(x) === w && x !== s.today) n++;
        const tot = s.byDow[w]?.collectedCents ?? 0;
        return { label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][w], tip: `Average ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w]}`, v: n ? tot / n : 0 };
      })
      : (() => { const hs = s.byHour.map(h => h.hour); const lo = Math.min(6, ...hs), hi = Math.max(19, ...hs); const m = new Map(s.byHour.map(h => [h.hour, h.collectedCents]));
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(h => ({ label: `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`, tip: `${clock12(h * 60)} – ${clock12(h * 60 + 59)}`, v: m.get(h) ?? 0 })); })();
  const n = d.length, mx = Math.max(1, ...d.map(x => x.v)), st = niceStep(mx, 4), top = Math.ceil(mx / st) * st;
  const hi = sel !== null && sel < n ? sel : mode === 'day' ? n - 1 : d.reduce((m, x, i) => x.v > d[m].v ? i : m, 0);
  const empty = d.every(x => x.v === 0);
  const grid: number[] = []; if (empty) grid.push(0); else for (let v = 0; v <= top + 1e-6; v += st) grid.push(v);
  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor((plot.current?.clientWidth ?? 600) / 52))));
  const pct = pctChange(s.collectedCents, s.beforeCollectedCents);
  const len = spanDays(range.from, range.to);
  return (
    <section className={`${CARD} !rounded-[16px] px-5 py-[18px]`} aria-label="Revenue chart">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 mb-4">
        <div>
          <div className="text-[13px] text-ink-muted">Revenue</div>
          <div className="text-[28px] font-semibold tabular-nums leading-tight text-ink">{usd(total)}</div>
          <div className="mt-0.5"><Change pct={pct} tail={`rounds vs the period before (${dayShort(addDays(range.from, -len))} – ${dayShort(addDays(range.from, -1))})`} /></div>
        </div>
        <span className="flex-1" />
        <span className="text-[12px] text-ink-muted self-center">Bars: rounds</span>
        <Seg small label="Chart" value={mode} onChange={k => { setMode(k); setSel(null); }} options={[['day', 'By day'], ['dow', 'Day of week'], ['hour', 'Time of day']] as const} />
      </div>
      <div ref={plot} className="relative h-[190px] ml-11 max-md:ml-[38px]">
        {grid.map(v => <div key={v} className={'absolute inset-x-0 border-t ' + (v ? 'border-ink/10' : 'border-line')} style={{ bottom: `${(v / top) * 100}%` }}><span className={Y_AXIS}>{usdk(v)}</span></div>)}
        {empty && <p className="absolute inset-0 grid place-items-center text-[13px] text-ink-muted">No payments in these dates</p>}
        <div className="absolute inset-0 flex items-end gap-1" role="img" aria-label={`Rounds ${mode === 'day' ? 'by day' : mode === 'dow' ? 'by day of week' : 'by time of day'}`}
          onMouseLeave={() => setTip(null)}>
          {d.map((x, i) => (
            <div key={i} className="group flex-1 h-full flex items-end justify-center cursor-pointer min-w-0 relative" onClick={() => setSel(i)}
              onMouseEnter={e => { const r = plot.current!.getBoundingClientRect(), b = e.currentTarget.getBoundingClientRect(); setTip({ i, x: b.left - r.left + b.width / 2 }); }}>
              <i className={'block w-full rounded-t-[4px] rounded-b-[1px] transition-colors ' + (n <= 16 ? 'max-w-[22px] ' : 'max-w-[12px] ') + (i === hi ? 'bg-ink' : 'bg-ink/25 group-hover:bg-ink-soft')} style={{ height: `${Math.max(0.5, (x.v / top) * 100)}%` }} />
              {i === hi && !empty && <b className={'absolute text-[11px] font-semibold text-ink whitespace-nowrap -translate-y-1 tabular-nums pointer-events-none ' + (i >= n - 2 && n > 3 ? 'right-0' : i <= 1 && n > 3 ? 'left-0' : '')} style={{ bottom: `${(x.v / top) * 100}%` }}>{usd(x.v)}</b>}
            </div>
          ))}
        </div>
        {tip && (
          <div className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full bg-ink text-page text-[12px] px-2.5 py-1.5 rounded-[8px] whitespace-nowrap tabular-nums shadow-card"
            style={{ left: Math.max(70, Math.min((plot.current?.clientWidth ?? 0) - 70, tip.x)), top: `max(0px, calc(${(1 - d[tip.i].v / top) * 100}% - 10px))` }}>
            <b className="block text-[13px]">{usd(d[tip.i].v)}</b>{d[tip.i].tip}
          </div>
        )}
      </div>
      <div className="flex gap-1 mt-1.5 ml-11 max-md:ml-[38px]">
        {d.map((x, i) => <span key={i} className="flex-1 min-w-0 text-center text-[11px] text-ink-muted whitespace-nowrap tabular-nums">{(n - 1 - i) % every === 0 ? x.label : ''}</span>)}
      </div>
    </section>
  );
}

/** What was sold and how it was paid, side by side. */
export function soldRows(s: Sales): { key: string; label: string; note?: string; cents: number }[] {
  const g = s.segments;
  if (g) return [
    { key: 'tee', label: 'Tee times', note: 'green fees', cents: g.teeCents },
    { key: 'cart', label: 'Carts', cents: g.cartCents },
    { key: 'shop', label: 'Pro shop', cents: g.shopCents },
    { key: 'event', label: 'Events', cents: g.eventCents },
    { key: 'fnb', label: 'Food & beverage', cents: g.fnbCents },
  ];
  const sm = s.summary;
  return [
    { key: 'tee', label: 'Tee times', note: 'green fees', cents: sm.greenCents + sm.lateFeesKeptCents },
    { key: 'cart', label: 'Carts', cents: sm.cartCents },
    { key: 'shop', label: 'Pro shop', cents: sm.rangeCents + sm.shopOnRoundsCents + sm.walkUpCents },
    { key: 'event', label: 'Events', cents: sm.eventCents ?? 0 },
  ];
}
/** The Total line: Build's segments.totalCents when sent. */
export const soldTotal = (s: Sales) => s.segments ? s.segments.totalCents : soldRows(s).reduce((n, r) => n + r.cents, 0);
export function SoldPaid({ s, onDrawer }: { s: Sales; onDrawer?: boolean }) {
  const rows = soldRows(s), total = soldTotal(s);
  const p = s.paid;
  // Build's howPaid is by payment day with its own total (never the same total as What was sold).
  const hp = s.howPaid;
  const how: { label: string; note?: string; cents: number }[] = hp
    ? [{ label: 'Card online', cents: hp.onlineCents }, { label: 'Card at the counter', note: 'card reader', cents: hp.readerCents }, { label: 'Cash', cents: hp.cashCents }, ...(hp.otherCents ? [{ label: 'Check or other', cents: hp.otherCents }] : [])]
    : [{ label: 'Card', cents: p.cardCents }, { label: 'At the counter', cents: p.counterCents }, ...(p.accountCents ? [{ label: 'On accounts', cents: p.accountCents }] : [])];
  const paidTotal = hp ? hp.totalCents : how.reduce((n, r) => n + r.cents, 0);
  const pct = (v: number, t: number) => t ? `${Math.round((v / t) * 100)}%` : '—';
  const d = s.drawer;
  return (
    <section className={`${CARD} !rounded-[16px] grid lg:grid-cols-2`} aria-label="What was sold and how it was paid">
      <div className="px-5 py-4 min-w-0">
        <h3 className="text-[15px] font-semibold text-ink mb-1.5">What was sold</h3>
        {rows.map((r, i) => <Kv key={r.key} first={i === 0} label={r.label} note={r.note} pct={pct(r.cents, total)} value={usd2(r.cents)} />)}
        <Kv total label="Total" value={usd2(total)} />
      </div>
      <div className="px-5 py-4 min-w-0 border-t lg:border-t-0 lg:border-l border-line">
        <h3 className="text-[15px] font-semibold text-ink mb-1.5">How it was paid</h3>
        {paidTotal > 0 && (
          <div role="img" aria-label={how.map(h => `${h.label} ${usd(h.cents)}`).join(', ')} className="flex h-2 rounded-[4px] overflow-hidden gap-0.5 mt-1.5 mb-2.5">
            {how.map((h, i) => <span key={h.label} className={i === 0 ? 'bg-ink' : 'bg-ink/25'} style={{ width: `${(h.cents / paidTotal) * 100}%`, opacity: i === 1 ? 0.75 : undefined }} />)}
          </div>
        )}
        {how.map((h, i) => <Kv key={h.label} first={i === 0} label={h.label} note={h.note} pct={pct(h.cents, paidTotal)} value={usd2(h.cents)} />)}
        <Kv total label="Total" value={usd2(paidTotal)} />
        {d && onDrawer && (
          <p className="mt-3 text-[13px] text-ink-soft">
            Last close-out {dayLong(d.day)} · <span className={d.differenceCents === 0 ? 'text-ok' : 'text-bad'}>{d.differenceCents === 0 ? 'even' : d.differenceCents > 0 ? `over ${usd2(d.differenceCents)}` : `short ${usd2(-d.differenceCents)}`}</span>
            {' · '}<Link href="/dashboard/shop" className={LINK}>Pro shop</Link>
          </p>
        )}
      </div>
    </section>
  );
}

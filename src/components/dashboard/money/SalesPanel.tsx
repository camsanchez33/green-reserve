'use client';
// DENSE-2 (Cam 2026-10-27, after Toast's Sales Summary and Stripe's Today): the top
// of Money. Today's money building through the day against the same weekday last
// week; then, for the dates picked, sales by day, weekday and hour, what they were
// for, how golfers paid, and the latest cash-drawer count. Every number comes from
// /api/operator/money/sales (computeAnalytics' definitions). Plain HTML/SVG, no
// chart library.
// MONEY-1 (Cam 2026-11-09, Money notes): the top chart reads cleaner (today filled in, last week dashed, hour ticks,
// a legend); the dates' total is labelled; the three charts are tabs like the homepage's; the bottom is one card —
// what was sold and how it was paid — and the cash drawer is one line pointing at Pro shop → Close out. GreenReserve's
// own fees are not listed on the course's Money page (Cam: "we don't want to disclose how much we make").
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/dashboard/LoadError';
import DateRangeButton, { type DateRange } from '@/components/dashboard/DateRangeButton';
import { dfetch } from '@/lib/dashboard-fetch';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import Link from 'next/link';
import type { CloseView } from '@/lib/register-close';

type Sales = {
  range: DateRange; today: string; lastWeek: string; clock: string; bucket: 'day' | 'week';
  series: { key: string; collectedCents: number; gapCents: number }[];
  byDow: { dow: string; collectedCents: number }[];
  byHour: { hour: number; collectedCents: number }[];
  collectedCents: number; beforeCollectedCents: number;
  summary: { greenCents: number; cartCents: number; rangeCents: number; refundedCents?: number; lateFeesKeptCents: number; shopOnRoundsCents: number; walkUpCents: number; walkUpSales: number; eventCents?: number; eventPayments?: number; greenReserveFeesCents: number };
  paid: { cardCents: number; counterCents: number; accountCents?: number; outstandingCents: number; outstandingGroups: number };
  todayByHour: { hour: number; collectedCents: number }[]; lastWeekByHour: { hour: number; collectedCents: number }[];
  todayCollectedCents: number; lastWeekCollectedCents: number;
  drawer: CloseView | null;
};

const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtArrival = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-3 py-2 text-[13.5px] tabular-nums ' + (strong ? 'font-semibold border-t border-ink/70 ' : '') + (muted ? 'text-ink-muted' : 'text-ink')}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function Bars({ values, labels, aria, highlightLast }: { values: number[]; labels: string[]; aria: string; highlightLast?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div role="img" aria-label={aria} className="flex items-end gap-[3px] h-28 border-b border-line">
        {values.map((v, i) => (
          <div key={i} title={`${labels[i]}: ${usd(v)}`} className={'flex-1 rounded-t-[3px] ' + (highlightLast && i === values.length - 1 ? 'bg-pine' : 'bg-[#4E7A62]')}
            style={{ height: `${v > 0 ? Math.max(2, (v / max) * 100) : 0}%` }} />
        ))}
      </div>
      {/* Many bars: a label a week (and the last), so they never crowd. */}
      <div className="flex gap-[3px] mt-1">{labels.map((l, i) => <span key={i} className="flex-1 min-w-0 text-center text-[11px] text-ink-muted tabular-nums whitespace-nowrap">{labels.length <= 14 || i % 7 === 0 || i === labels.length - 1 ? l : ''}</span>)}</div>
    </div>
  );
}

/** Running total through the day: today (to now) against the same weekday last week. */
function TodayLine({ s }: { s: Sales }) {
  const hours = [...s.todayByHour, ...s.lastWeekByHour].map(x => x.hour);
  const first = Math.min(6, ...hours), last = Math.max(19, ...hours) + 1;
  const nowH = Number(s.clock.slice(0, 2)) + Number(s.clock.slice(3, 5)) / 60;
  const run = (rows: { hour: number; collectedCents: number }[], until: number) => {
    const at = new Map(rows.map(r => [r.hour, r.collectedCents]));
    const pts: [number, number][] = [[first, 0]]; let sum = 0;
    for (let h = first; h < last && h < until; h++) { sum += at.get(h) ?? 0; pts.push([Math.min(h + 1, until), sum]); }
    return pts;
  };
  const today = run(s.todayByHour, nowH), before = run(s.lastWeekByHour, last);
  const max = Math.max(1, ...today.map(p => p[1]), ...before.map(p => p[1])) * 1.08;
  const xy = (pts: [number, number][]) => pts.map(([h, v]) => `${((h - first) / (last - first)) * 100},${100 - (v / max) * 100}`).join(' ');
  const nowX = ((Math.min(Math.max(nowH, first), last) - first) / (last - first)) * 100;
  if (hours.length === 0) return <div className="h-36 flex items-center justify-center text-[13px] text-ink-muted border-b border-line">Fills in as rounds are paid</div>;
  const area = today.length > 1 ? `${xy([[today[0][0], 0], ...today, [today[today.length - 1][0], 0]])}` : '';
  // Every third hour, and always the first and last, so a short day still has labels.
  const ticks: number[] = [first]; for (let h = Math.ceil((first + 1) / 3) * 3; h < last; h += 3) ticks.push(h); if (last > first) ticks.push(last);
  return (
    <div>
      <div className="relative h-36 border-b border-line">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
          aria-label={`Paid so far today ${usd(s.todayCollectedCents)}, against ${usd(s.lastWeekCollectedCents)} all day last week`}>
          {[25, 50, 75].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {area && <polygon points={area} fill="var(--color-pine)" fillOpacity="0.10" />}
          <polyline points={xy(before)} fill="none" stroke="var(--color-ink-faint)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <polyline points={xy(today)} fill="none" stroke="var(--color-pine)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={nowX} y1="0" x2={nowX} y2="100" stroke="var(--color-pine)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="relative h-4 mt-1 text-[11.5px] text-ink-muted tabular-nums">
        {ticks.map(h => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h - first) / (last - first)) * 100}%` }}>{hourLabel(h)}</span>)}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[12px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 h-[3px] rounded bg-pine" />Today</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t-2 border-dashed border-ink-faint" />Same day last week</span>
      </div>
    </div>
  );
}

export function SalesPanel({ nextPayout, showPayout, stripeConnected, notPaid, onSeeUnpaid }: {
  /** Next payout: undefined = unknown / not connected, null = nothing on its way. */
  nextPayout: { amountCents: number; arrivalDate: string } | null | undefined;
  /** The login sees payouts and the payouts load didn't fail. */
  showPayout: boolean;
  stripeConnected: boolean;
  /** Not paid yet, the last 7 days (the overview's figure). */
  notPaid: { cents: number; groups: number } | null;
  onSeeUnpaid?: () => void;
}) {
  const [range, setRange] = useState<DateRange | null>(null);
  const [data, setData] = useState<Sales | null>(null);
  const [error, setError] = useState('');
  const [chart, setChart] = useState<'series' | 'dow' | 'hour'>('series');
  const seq = useRef(0);

  const load = useCallback(async (r: DateRange | null) => {
    const mine = ++seq.current;
    setError('');
    const res = await dfetch<Sales>(`/api/operator/money/sales${r ? `?from=${r.from}&to=${r.to}` : ''}`);
    if (mine !== seq.current) return;
    if (res.ok) { setData(res.data); setRange(res.data.range); } else setError(res.error);
  }, []);
  useEffect(() => { load(null); }, [load]);

  // Next payout and Not paid yet come from the page, so they show even while sales load or fail.
  const side = (
    <>
      {showPayout && (
        <div className="px-5 py-4">
          <div className="text-[13px] text-ink-soft">Next payout</div>
          {nextPayout ? <><div className="text-[22px] font-semibold text-ink tabular-nums">{usd(nextPayout.amountCents)}</div><div className="text-[12.5px] text-ink-muted">{fmtArrival(nextPayout.arrivalDate)}</div></>
            : !stripeConnected ? <div className="text-[13.5px] text-ink mt-1">Connect Stripe</div>
            : <div className="text-[13.5px] text-ink-muted mt-1">{nextPayout === null ? 'None on its way' : 'Checking Stripe…'}</div>}
        </div>
      )}
      {notPaid && (
        <div className="px-5 py-4">
          <div className="text-[13px] text-ink-soft">Not paid yet · 7 days</div>
          <div className={'text-[22px] font-semibold tabular-nums ' + (notPaid.cents > 0 ? 'text-warn' : 'text-ink')}>{usd(notPaid.cents)}</div>
          {notPaid.groups > 0 && onSeeUnpaid && <button onClick={onSeeUnpaid} className="text-[12.5px] font-medium text-pine hover:underline underline-offset-4">{notPaid.groups} {notPaid.groups === 1 ? 'group' : 'groups'}</button>}
        </div>
      )}
    </>
  );

  if (!data) return (
    <div className="space-y-5 mb-6">
      {error && <LoadError message={`Couldn't load your sales — ${error}`} onRetry={() => load(range)} />}
      {(showPayout || notPaid) && <Card className="md:max-w-[17rem] divide-y divide-line-soft">{side}</Card>}
    </div>
  );
  const s = data;
  const change = s.beforeCollectedCents > 0 ? Math.round(((s.collectedCents - s.beforeCollectedCents) / s.beforeCollectedCents) * 100) : null;
  const totalPaid = s.paid.cardCents + s.paid.counterCents;
  const cardPct = totalPaid ? (s.paid.cardCents / totalPaid) * 100 : 0;
  const hours = s.byHour.length ? Array.from({ length: s.byHour.at(-1)!.hour - s.byHour[0].hour + 1 }, (_, i) => s.byHour[0].hour + i) : [];
  const atHour = new Map(s.byHour.map(h => [h.hour, h.collectedCents]));
  const d = s.drawer;

  return (
    <div className="space-y-5 mb-6">
      {error && <LoadError message={`Couldn't load your sales — ${error}`} onRetry={() => load(range)} />}

      <Card className="grid md:grid-cols-[minmax(0,1fr)_17rem] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-x-10 gap-y-2 mb-3">
            <div><div className="text-[13px] text-ink-soft">Today</div><div className="text-[26px] font-semibold text-ink tabular-nums">{usd(s.todayCollectedCents)}</div></div>
            <div><div className="text-[13px] text-ink-soft">Same day last week</div><div className="text-[26px] font-semibold text-ink-muted tabular-nums">{usd(s.lastWeekCollectedCents)}</div></div>
            {s.lastWeekCollectedCents > 0 && (() => { const pct = Math.round(((s.todayCollectedCents - s.lastWeekCollectedCents) / s.lastWeekCollectedCents) * 100); return pct === 0 ? null : (
              <div className="self-end pb-1 text-[13px] font-semibold tabular-nums"><span className={pct > 0 ? 'text-ok' : 'text-ink-muted'}>{pct > 0 ? '↑' : '↓'} {Math.abs(pct)}%</span> <span className="font-normal text-ink-muted">so far</span></div>
            ); })()}
          </div>
          <TodayLine s={s} />
        </div>
        <div className="border-t md:border-t-0 md:border-l border-line-soft divide-y divide-line-soft">{side}</div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {range && <DateRangeButton value={range} today={s.today} onChange={r => { setRange(r); load(r); }} />}
        <span className="text-[13px] text-ink-soft">Collected</span>
        <span className="text-[15px] font-semibold text-ink tabular-nums">{usd(s.collectedCents)}</span>
        {change !== null && change !== 0 && <span className={'text-[13px] font-semibold tabular-nums ' + (change > 0 ? 'text-ok' : 'text-bad')}>{change > 0 ? '↑' : '↓'} {Math.abs(change)}%</span>}
        <span className="text-[12.5px] text-ink-muted">vs the period before</span>
      </div>

      <Card className="px-5 py-4">
        {s.collectedCents === 0 ? <div className="h-28 flex items-center justify-center text-[13px] text-ink-muted">Fills in as rounds are paid</div> : (<>
          {/* Cam 2026-11-09: "make it look better, like the homepage tabs" — one chart at a time. */}
          <SlidingTabs value={chart} onChange={k => setChart(k as typeof chart)} className="mb-4" tabs={[['series', `By ${s.bucket === 'week' ? 'week' : 'day'}`], ['dow', 'Day of week'], ['hour', 'Time of day']] as const} />
          {chart === 'series' && <Bars values={s.series.map(x => x.collectedCents)} labels={s.series.map(x => fmtDay(x.key))} aria={`Sales by ${s.bucket}`} highlightLast />}
          {chart === 'dow' && <Bars values={[1, 2, 3, 4, 5, 6, 0].map(i => s.byDow[i].collectedCents)} labels={[1, 2, 3, 4, 5, 6, 0].map(i => s.byDow[i].dow)} aria="Sales by day of week" />}
          {chart === 'hour' && <Bars values={hours.map(h => atHour.get(h) ?? 0)} labels={hours.map(hourLabel)} aria="Sales by tee time hour" />}
        </>)}
      </Card>

      {/* Cam 2026-11-09: "rethink what is really needed" — what was sold and how it was paid, side by side; the drawer
          lives on Pro shop → Close out, so here it is one line. */}
      <Card className="grid md:grid-cols-2 md:divide-x divide-line-soft">
        <div className="px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink mb-1">What was sold</h3>
          <div className="divide-y divide-line-soft">
            <Row label="Green fees" value={usd2(s.summary.greenCents)} />
            <Row label="Carts" value={usd2(s.summary.cartCents)} />
            {s.summary.rangeCents > 0 && <Row label="Range balls" value={usd2(s.summary.rangeCents)} />}
            {(s.summary.refundedCents ?? 0) > 0 && <Row label="Refunded" value={`−${usd2(s.summary.refundedCents ?? 0)}`} />}
            <Row label="Rounds" value={usd2(s.collectedCents)} strong />
            {s.summary.lateFeesKeptCents > 0 && <Row label="Late-cancel fees kept" value={usd2(s.summary.lateFeesKeptCents)} />}
            {s.summary.shopOnRoundsCents > 0 && <Row label="Shop on rounds" value={usd2(s.summary.shopOnRoundsCents)} />}
            {s.summary.walkUpSales > 0 && <Row label={`Register sales · ${s.summary.walkUpSales}`} value={usd2(s.summary.walkUpCents)} />}
            {(s.summary.eventPayments ?? 0) > 0 && <Row label={`Event payments · ${s.summary.eventPayments}`} value={usd2(s.summary.eventCents ?? 0)} />}
          </div>
        </div>
        <div className="px-5 py-4 border-t md:border-t-0 border-line-soft">
          <h3 className="text-[15px] font-semibold text-ink mb-3">How it was paid</h3>
          {totalPaid > 0 && (
            <div role="img" aria-label={`By card ${usd(s.paid.cardCents)}, at the counter ${usd(s.paid.counterCents)}`} className="flex h-3 rounded-[3px] overflow-hidden gap-[2px] mb-2">
              <span className="bg-pine" style={{ width: `${cardPct}%` }} /><span className="bg-ink-faint/50" style={{ width: `${100 - cardPct}%` }} />
            </div>
          )}
          <div className="divide-y divide-line-soft">
            <Row label="By card" value={usd2(s.paid.cardCents)} />
            <Row label="At the counter" value={usd2(s.paid.counterCents)} />
            {!!s.paid.accountCents && <Row label="On accounts" value={usd2(s.paid.accountCents)} />}
            <Row label={`Not paid yet · ${s.paid.outstandingGroups}`} value={usd2(s.paid.outstandingCents)} />
          </div>
          {d && (
            <p className="mt-3 text-[13px] text-ink-soft">
              Last close-out {fmtDay(d.day)} · <span className={d.differenceCents === 0 ? 'text-ok' : 'text-bad'}>{d.differenceCents === 0 ? 'even' : d.differenceCents > 0 ? `over ${usd2(d.differenceCents)}` : `short ${usd2(-d.differenceCents)}`}</span>
              {' · '}<Link href="/dashboard/shop" className="font-medium text-pine hover:underline underline-offset-4">Pro shop</Link>
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

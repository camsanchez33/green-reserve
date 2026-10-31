'use client';
// DENSE-2 (Cam 2026-10-27, after Toast's Sales Summary and Stripe's Today): the top
// of Money. Today's money building through the day against the same weekday last
// week; then, for the dates picked, sales by day, weekday and hour, what they were
// for, how golfers paid, and the latest cash-drawer count. Every number comes from
// /api/operator/money/sales (computeAnalytics' definitions). Plain HTML/SVG, no
// chart library.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/dashboard/LoadError';
import DateRangeButton, { type DateRange } from '@/components/dashboard/DateRangeButton';
import { dfetch } from '@/lib/dashboard-fetch';
import type { CloseView } from '@/lib/register-close';

type Sales = {
  range: DateRange; today: string; lastWeek: string; clock: string; bucket: 'day' | 'week';
  series: { key: string; collectedCents: number; gapCents: number }[];
  byDow: { dow: string; collectedCents: number }[];
  byHour: { hour: number; collectedCents: number }[];
  collectedCents: number; beforeCollectedCents: number;
  summary: { greenCents: number; cartCents: number; rangeCents: number; lateFeesKeptCents: number; shopOnRoundsCents: number; walkUpCents: number; walkUpSales: number; greenReserveFeesCents: number };
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
  if (hours.length === 0) return <div className="h-32 flex items-center justify-center text-[13px] text-ink-muted border-b border-line">Fills in as rounds are paid</div>;
  return (
    <div>
      <div className="relative h-32 border-b border-line">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
          aria-label={`Paid so far today ${usd(s.todayCollectedCents)}, against ${usd(s.lastWeekCollectedCents)} all day last week`}>
          <polyline points={xy(before)} fill="none" stroke="#9AA89E" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <polyline points={xy(today)} fill="none" stroke="var(--color-pine)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={nowX} y1="0" x2={nowX} y2="100" stroke="var(--color-pine)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex justify-between text-[11.5px] text-ink-muted mt-1 tabular-nums">
        <span>{hourLabel(first)}</span><span className="font-semibold text-pine">Now</span><span>{hourLabel(last)}</span>
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
          </div>
          <TodayLine s={s} />
        </div>
        <div className="border-t md:border-t-0 md:border-l border-line-soft divide-y divide-line-soft">{side}</div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {range && <DateRangeButton value={range} today={s.today} onChange={r => { setRange(r); load(r); }} />}
        <span className="text-[15px] font-semibold text-ink tabular-nums">{usd(s.collectedCents)}</span>
        {change !== null && change !== 0 && <span className={'text-[13px] font-semibold tabular-nums ' + (change > 0 ? 'text-ok' : 'text-bad')}>{change > 0 ? '↑' : '↓'} {Math.abs(change)}%</span>}
        <span className="text-[12.5px] text-ink-muted">vs the period before</span>
      </div>

      <Card className="px-5 py-4 space-y-6">
        {s.collectedCents === 0 ? <div className="h-28 flex items-center justify-center text-[13px] text-ink-muted">Fills in as rounds are paid</div> : (<>
          <div>
            <h3 className="text-[15px] font-semibold text-ink mb-2">Sales by {s.bucket === 'week' ? 'week' : 'day'}</h3>
            <Bars values={s.series.map(x => x.collectedCents)} labels={s.series.map(x => fmtDay(x.key))} aria={`Sales by ${s.bucket}`} highlightLast />
          </div>
          <div className="grid lg:grid-cols-[2fr_3fr] gap-8">
            <div>
              <h3 className="text-[15px] font-semibold text-ink mb-2">Day of week</h3>
              <Bars values={[1, 2, 3, 4, 5, 6, 0].map(i => s.byDow[i].collectedCents)} labels={[1, 2, 3, 4, 5, 6, 0].map(i => s.byDow[i].dow)} aria="Sales by day of week" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-ink mb-2">Time of day</h3>
              <Bars values={hours.map(h => atHour.get(h) ?? 0)} labels={hours.map(hourLabel)} aria="Sales by tee time hour" />
            </div>
          </div>
        </>)}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink mb-1">Sales summary</h3>
          <div className="divide-y divide-line-soft">
            <Row label="Green fees" value={usd2(s.summary.greenCents)} />
            <Row label="Carts" value={usd2(s.summary.cartCents)} />
            {s.summary.rangeCents > 0 && <Row label="Range balls" value={usd2(s.summary.rangeCents)} />}
            <Row label="Rounds" value={usd2(s.collectedCents)} strong />
            {s.summary.lateFeesKeptCents > 0 && <Row label="Late-cancel fees kept" value={usd2(s.summary.lateFeesKeptCents)} />}
            {s.summary.shopOnRoundsCents > 0 && <Row label="Shop on rounds" value={usd2(s.summary.shopOnRoundsCents)} />}
            {s.summary.walkUpSales > 0 && <Row label={`Register sales · ${s.summary.walkUpSales}`} value={usd2(s.summary.walkUpCents)} />}
            {s.summary.greenReserveFeesCents > 0 && <Row label="GreenReserve booking fees" value={usd2(s.summary.greenReserveFeesCents)} muted />}
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink mb-3">How golfers paid</h3>
          {totalPaid > 0 && (
            <div role="img" aria-label={`By card ${usd(s.paid.cardCents)}, at the counter ${usd(s.paid.counterCents)}`} className="flex h-3 rounded-[3px] overflow-hidden gap-[2px] mb-2">
              <span className="bg-pine" style={{ width: `${cardPct}%` }} /><span className="bg-[#8FA898]" style={{ width: `${100 - cardPct}%` }} />
            </div>
          )}
          <div className="divide-y divide-line-soft">
            <Row label="By card" value={usd2(s.paid.cardCents)} />
            <Row label="At the counter" value={usd2(s.paid.counterCents)} />
            {!!s.paid.accountCents && <Row label="On accounts" value={usd2(s.paid.accountCents)} />}
            <Row label={`Not paid yet · ${s.paid.outstandingGroups}`} value={usd2(s.paid.outstandingCents)} />
          </div>
        </Card>

        {d && (
          <Card className="px-5 py-4">
            <h3 className="text-[15px] font-semibold text-ink mb-1">Cash drawer · {fmtDay(d.day)}</h3>
            <div className="divide-y divide-line-soft">
              <Row label="Starting cash" value={usd2(d.openingFloatCents)} />
              <Row label="Cash sales" value={usd2(d.cashSalesCents)} />
              {d.counterRoundsCents !== 0 && <Row label="Paid at counter" value={usd2(d.counterRoundsCents)} />}
              {d.otherCashCents !== 0 && <Row label="Dues and events" value={usd2(d.otherCashCents)} />}
              {d.cashRefundsCents > 0 && <Row label="Cash refunds" value={usd2(-d.cashRefundsCents)} />}
              <Row label="Expected" value={usd2(d.expectedCashCents)} strong />
              <Row label="Counted" value={usd2(d.countedCashCents)} />
              <div className={'flex justify-between py-2 text-[13.5px] font-semibold tabular-nums ' + (d.differenceCents === 0 ? 'text-ok' : 'text-bad')}>
                <span>{d.differenceCents === 0 ? 'Even' : d.differenceCents > 0 ? 'Over' : 'Short'}</span><span>{usd2(d.differenceCents)}</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

'use client';
// Money rework (Cam 2026-10-19: "it shows every payment ever with random
// information all over"). The rounds that have been played, newest day first,
// each with what the course is owed and one plain status. Bookings still to
// come live on the tee sheet, not here. A ?date= deep link from the tee sheet
// still narrows it to that day.
// MONEY-1 (Cam 2026-11-09, Money notes: "Payments tab — rework; same date picker as above"): the dates are picked
// with the same picker as the top of Money (7 days · 30 days · This month · Dates); Show is a row of sliding tabs
// with counts; the days sit in ONE card, each day a header — not a stack of cards. No money totals here: this list is capped,
// so a sum of it could be wrong (ACC-1); totals live at the top of Money and in Analytics.
import { Card } from '@/components/ui/Card';
import { useMemo, useState } from 'react';
import DateRangeButton, { presets, type DateRange } from '@/components/dashboard/DateRangeButton';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { X } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import type { MoneyBooking } from './types';
import { RefundForm } from './RefundForm';
import { formatTeeTime as fmtTime, formatTeeDate as fmtDate } from '@/lib/format';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One plain status per booking, in the words staff use at the counter. */
export function paymentStatus(b: MoneyBooking, today: string, clock = '99:99'): { label: string; tone: Tone; group: 'paid' | 'unpaid' | 'noshow' | 'cancelled' | 'refunded' | 'upcoming' } {
  if (b.status === 'cancelled') return b.paymentStatus === 'cancellation_fee_charged'
    ? { label: `Cancelled · ${usd(b.cancellationFeeTotal)} fee kept`, tone: 'warn', group: 'cancelled' }
    : { label: 'Cancelled, no fee', tone: 'neutral', group: 'cancelled' };
  // paymentStatus is what was charged: collectPayment() can charge a round that is still 'confirmed'.
  if (b.paymentStatus === 'paid') return { label: 'Paid by card', tone: 'ok', group: 'paid' };
  if (b.paymentStatus === 'paid_offline') return { label: 'Paid at the counter', tone: 'ok', group: 'paid' };
  if (b.paymentStatus === 'on_account') return { label: 'On account', tone: 'ok', group: 'paid' };
  if (b.paymentStatus === 'refunded') return { label: 'Refunded', tone: 'neutral', group: 'refunded' };
  // Future days belong to the tee sheet. ACC-1: a group later TODAY that hasn't paid is in Not paid yet — the
  // number on the tee sheet, Home and Money counts it, so the list "See them" opens has to show it.
  if (b.teeTime.date > today) return { label: 'Not played yet', tone: 'neutral', group: 'upcoming' };
  if (b.teeTime.date === today && b.teeTime.time.slice(0, 5) > clock) return { label: 'Not played yet', tone: 'neutral', group: 'unpaid' };
  // A marked no-show is its own list, never mixed in with what's owed (lib/analytics outstanding).
  if (b.noShowAt) return { label: b.paymentStatus === 'cancellation_fee_charged' ? `No-show · ${usd(b.cancellationFeeTotal)} hold kept` : 'No-show', tone: 'bad', group: 'noshow' };
  if (b.paymentStatus === 'cancellation_fee_charged') return { label: `Not paid yet · ${usd(b.cancellationFeeTotal)} hold taken`, tone: 'warn', group: 'unpaid' };
  return { label: 'Not paid yet', tone: 'warn', group: 'unpaid' };
}

const FILTERS = [['all', 'All'], ['paid', 'Paid'], ['unpaid', 'Not paid yet'], ['noshow', 'No-shows'], ['cancelled', 'Cancelled']] as const;
type Filter = typeof FILTERS[number][0];

export function PaymentsPanel({ bookings, dateFilter, onClearDate, initialFilter = 'all', courseNow, capped = false, canRefund = false, onRefunded }: {
  /** money.refund_rounds: a Refund on rounds paid by card (dead end 14). */
  canRefund?: boolean;
  onRefunded?: (message: string) => void;
  /** The played-rounds feed came back full: older rounds aren't in this list. */
  capped?: boolean;
  bookings: MoneyBooking[];
  /** The course's today and HH:MM (Money's overview); the browser's day until it loads. */
  courseNow?: { today: string; clock: string };
  /** Money's "See them" opens this tab on Not paid yet (?show=unpaid). */
  initialFilter?: Filter;
  dateFilter: string;
  onClearDate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const today = courseNow?.today ?? new Date().toLocaleDateString('en-CA');
  const [range, setRange] = useState<DateRange | null>(null);
  const shownRange = useMemo(() => range ?? presets(today).find(p => p.key === '30d')!.range, [range, today]);
  const clock = courseNow?.clock ?? '99:99';
  const q = search.trim().toLowerCase();

  const rows = bookings
    .map(b => ({ b, s: paymentStatus(b, today, clock) }))
    .filter(({ b, s }) => {
      if (!dateFilter && s.group === 'upcoming') return false; // future rounds belong to the tee sheet
      if (!dateFilter && (b.teeTime.date < shownRange.from || b.teeTime.date > shownRange.to)) return false;
      if (q && !b.golferName.toLowerCase().includes(q) && !b.golferEmail.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((x, y) => (y.b.teeTime.date + y.b.teeTime.time).localeCompare(x.b.teeTime.date + x.b.teeTime.time));

  const count = (k: Filter) => k === 'all' ? rows.length : rows.filter(r => r.s.group === k).length;
  const shown = filter === 'all' ? rows : rows.filter(r => r.s.group === filter);
  const days = [...new Set(shown.map(r => r.b.teeTime.date))];
  const share = (b: MoneyBooking) => b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal;

  return (
    <>
      {dateFilter && (
        <div className="flex items-center justify-between bg-white border border-line border-l-[3px] border-l-pine rounded-md px-4 py-2.5 mb-4 text-[13.5px]">
          <span className="text-ink">Showing {fmtDate(dateFilter)} only</span>
          <button onClick={onClearDate} className="flex items-center gap-1 text-pine hover:underline text-[12.5px] font-medium" aria-label="Show every day">
            <X className="w-3.5 h-3.5" />Show every day
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {!dateFilter && <DateRangeButton value={shownRange} today={today} onChange={setRange} />}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a golfer" aria-label="Find a golfer"
          className="sm:ml-auto w-56 bg-white border border-line rounded-[7px] px-3 py-2 text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none" />
      </div>
      <SlidingTabs value={filter} onChange={k => setFilter(k as Filter)} className="mb-4" tabs={FILTERS.map(([k, l]) => [k, `${l} ${count(k)}`] as const)} />

      {shown.length === 0 ? (
        <Card className="py-12 text-center text-ink-soft text-[13.5px]">
          {q || filter !== 'all' ? 'Nothing matches that.' : dateFilter ? `No bookings on ${fmtDate(dateFilter)}.` : 'No rounds played in these dates.'}
        </Card>
      ) : (
        <Card>
          {days.map(day => {
            const dayRows = shown.filter(r => r.b.teeTime.date === day);
            return (
              <section key={day} aria-label={day === today ? 'Today' : fmtDate(day)}>
                <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-page/60 border-b border-line-soft">
                  <h3 className="text-[13.5px] font-semibold text-ink">{day === today ? 'Today' : fmtDate(day)}</h3>
                  <span className="text-[12.5px] text-ink-muted tabular-nums">{dayRows.length} group{dayRows.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="divide-y divide-line-soft border-b border-line-soft last:border-b-0">
                  {dayRows.map(({ b, s }) => (
                    <li key={b.id} className={'grid grid-cols-[64px_1fr_auto] sm:grid-cols-[72px_1fr_110px_220px] items-baseline gap-x-3 px-4 py-2.5 text-[13.5px] ' + (b.status === 'cancelled' ? 'text-ink-soft' : 'text-ink')}>
                      <span className="tabular-nums text-ink-soft">{fmtTime(b.teeTime.time)}</span>
                      <span className="min-w-0 truncate"><span className="font-medium">{b.golferName}</span><span className="text-ink-muted"> · {b.players} player{b.players !== 1 ? 's' : ''}</span></span>
                      <span className="tabular-nums text-right font-medium">{usd(share(b))}</span>
                      <span className="col-span-3 sm:col-span-1 inline-flex items-center gap-1.5"><StatusDot status={s.tone} />{s.label}</span>
                      {canRefund && b.paymentStatus === 'paid' && <div className="col-span-3 sm:col-span-4"><RefundForm bookingId={b.id} kind="round" onDone={m => onRefunded?.(m)} /></div>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </Card>
      )}
      {shown.length > 0 && <p className="mt-3 text-[12.5px] text-ink-muted">{capped ? 'Last 1,000 played rounds · ' : ''}Your share, less the booking fee</p>}
    </>
  );
}

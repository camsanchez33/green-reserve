'use client';
// Money rework (Cam 2026-10-19: "it shows every payment ever with random
// information all over"). The rounds that have been played, newest day first,
// each with what the course is owed and one plain status. Bookings still to
// come live on the tee sheet, not here. A ?date= deep link from the tee sheet
// still narrows it to that day.
import { Card } from '@/components/ui/Card';
import { useState } from 'react';
import { X } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import type { MoneyBooking } from './types';
import { formatTeeTime as fmtTime, formatTeeDate as fmtDate } from '@/lib/format';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One plain status per booking, in the words staff use at the counter. */
export function paymentStatus(b: MoneyBooking, today: string): { label: string; tone: Tone; group: 'paid' | 'unpaid' | 'cancelled' | 'refunded' | 'upcoming' } {
  if (b.status === 'cancelled') return b.paymentStatus === 'cancellation_fee_charged'
    ? { label: `Cancelled · ${usd(b.cancellationFeeTotal)} fee kept`, tone: 'warn', group: 'cancelled' }
    : { label: 'Cancelled, no fee', tone: 'neutral', group: 'cancelled' };
  // paymentStatus is what was charged: collectPayment() can charge a round that is still 'confirmed'.
  if (b.paymentStatus === 'paid') return { label: 'Paid by card', tone: 'ok', group: 'paid' };
  if (b.paymentStatus === 'paid_offline') return { label: 'Paid at the counter', tone: 'ok', group: 'paid' };
  if (b.paymentStatus === 'refunded') return { label: 'Refunded', tone: 'neutral', group: 'refunded' };
  if (b.teeTime.date > today) return { label: 'Not played yet', tone: 'neutral', group: 'upcoming' };
  if (b.noShowAt) return { label: b.paymentStatus === 'cancellation_fee_charged' ? `No-show · ${usd(b.cancellationFeeTotal)} hold kept` : 'No-show', tone: 'bad', group: 'unpaid' };
  if (b.paymentStatus === 'cancellation_fee_charged') return { label: `Not paid yet · ${usd(b.cancellationFeeTotal)} hold taken`, tone: 'warn', group: 'unpaid' };
  return { label: 'Not paid yet', tone: 'warn', group: 'unpaid' };
}

const FILTERS = [['all', 'All'], ['paid', 'Paid'], ['unpaid', 'Not paid yet'], ['cancelled', 'Cancelled']] as const;
type Filter = typeof FILTERS[number][0];
const DAYS_SHOWN = 14;

export function PaymentsPanel({ bookings, dateFilter, onClearDate, initialFilter = 'all' }: {
  bookings: MoneyBooking[];
  /** Money's "See them" opens this tab on Not paid yet (?show=unpaid). */
  initialFilter?: Filter;
  dateFilter: string;
  onClearDate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [showAll, setShowAll] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');
  const q = search.trim().toLowerCase();

  const rows = bookings
    .map(b => ({ b, s: paymentStatus(b, today) }))
    .filter(({ b, s }) => {
      if (!dateFilter && s.group === 'upcoming') return false; // future rounds belong to the tee sheet
      if (q && !b.golferName.toLowerCase().includes(q) && !b.golferEmail.toLowerCase().includes(q)) return false;
      return filter === 'all' || s.group === filter;
    })
    .sort((x, y) => (y.b.teeTime.date + y.b.teeTime.time).localeCompare(x.b.teeTime.date + x.b.teeTime.time));

  const days = [...new Set(rows.map(r => r.b.teeTime.date))];
  const visibleDays = showAll || dateFilter || q ? days : days.slice(0, DAYS_SHOWN);

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
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a golfer" aria-label="Find a golfer"
          className="w-60 bg-white border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none" />
        <div className="flex flex-wrap gap-x-5 gap-y-1 ml-1" role="tablist" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={'py-1.5 text-[13.5px] font-medium border-b-2 transition-colors ' + (filter === key ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{label}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="py-12 text-center text-ink-soft text-[13.5px]">
          {q || filter !== 'all' ? 'Nothing matches that.' : dateFilter ? `No bookings on ${fmtDate(dateFilter)}.` : 'No rounds played yet. Payments show here once golfers have played.'}
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleDays.map(day => {
            const dayRows = rows.filter(r => r.b.teeTime.date === day);
            return (
              <Card key={day}>
                <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2 border-b border-line-soft">
                  <h3 className="text-[14px] font-semibold text-ink">{day === today ? 'Today' : fmtDate(day)}</h3>
                </div>
                <ul className="divide-y divide-line-soft">
                  {dayRows.map(({ b, s }) => (
                    <li key={b.id} className={'grid grid-cols-[64px_1fr_auto] sm:grid-cols-[72px_1fr_110px_220px] items-baseline gap-x-3 px-4 py-2.5 text-[13.5px] ' + (b.status === 'cancelled' ? 'text-ink-soft' : 'text-ink')}>
                      <span className="tabular-nums text-ink-soft">{fmtTime(b.teeTime.time)}</span>
                      <span className="min-w-0 truncate"><span className="font-medium">{b.golferName}</span><span className="text-ink-muted"> · {b.players} player{b.players !== 1 ? 's' : ''}</span></span>
                      <span className="tabular-nums text-right font-medium">{usd(b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal)}</span>
                      <span className="col-span-3 sm:col-span-1 inline-flex items-center gap-1.5"><StatusDot status={s.tone} />{s.label}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {visibleDays.length < days.length && (
            <button onClick={() => setShowAll(true)} className="w-full py-2.5 text-[13px] font-medium text-pine hover:underline">Show older days ({days.length - visibleDays.length} more)</button>
          )}
          <p className="text-[12.5px] text-ink-muted">Latest 200 bookings · your course’s share, GreenReserve’s booking fee not included</p>
        </div>
      )}
    </>
  );
}

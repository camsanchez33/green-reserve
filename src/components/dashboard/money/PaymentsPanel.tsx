'use client';
// SD-8 — the Payments half of the Money page. Lifted out of
// /dashboard/payments unchanged in behaviour; the bookings now arrive as a
// prop because Money loads them once for all three tabs.
import { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { getBookingStatus, statusDot } from '@/lib/booking-status';
import { StatusDot } from '@/components/ui/StatusDot';
import type { MoneyBooking } from './types';
import { formatTeeTime as fmtTime, formatTeeDate as fmtDate } from '@/lib/format';

export function PaymentsPanel({ bookings, dateFilter, onClearDate }: {
  bookings: MoneyBooking[];
  dateFilter: string;
  onClearDate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const q = search.trim().toLowerCase();
  const allRows = bookings.filter(b => {
    if (q && !b.golferName.toLowerCase().includes(q) && !b.golferEmail.toLowerCase().includes(q)) return false;
    if (statusFilter === 'paid')      return b.paymentStatus === 'paid' && b.status !== 'cancelled';
    if (statusFilter === 'upcoming')  return b.status === 'confirmed';
    if (statusFilter === 'fee')       return b.paymentStatus === 'cancellation_fee_charged';
    if (statusFilter === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  return (
    <>
      {dateFilter && (
        <div className="flex items-center justify-between bg-pine/5 border border-pine/20 rounded-md px-4 py-2.5 mb-4 text-sm">
          <span className="text-pine font-medium">Showing bookings for {fmtDate(dateFilter)}</span>
          <button onClick={onClearDate} className="flex items-center gap-1 text-pine hover:underline text-xs font-medium">
            <X className="w-3.5 h-3.5"/>Clear filter
          </button>
        </div>
      )}

      {/* AN-1 (Cam 2026-10-01): the Collected / Pending stat tiles moved to
          Analytics (Revenue: collected, card vs counter, outstanding, still to
          come, late fees kept, holds held, GreenReserve fees). This tab is the
          working ledger: search, filter, the rows. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search golfer name or email..."
          className="w-64 bg-white border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none"/>
        {/* U-O: filters are square chips, one per filter, not a segmented pill. */}
        <div className="flex flex-wrap gap-1.5">
          {([['all','All'],['paid','Paid'],['upcoming','Upcoming'],['fee','Fee Charged'],['cancelled','Cancelled']] as [string,string][]).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className={'px-3 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors ' + (statusFilter === key ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:border-line-strong hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
        {(q || statusFilter !== 'all') && <span className="text-[12.5px] text-ink-muted">{allRows.length} of {bookings.length} bookings</span>}
      </div>

      {allRows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-line text-ink-muted text-sm">
          {q || statusFilter !== 'all' ? 'No bookings match your search or filter.' : dateFilter ? `No bookings for ${fmtDate(dateFilter)}.` : 'No bookings yet.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-line overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium">Golfer</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium">Booked</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium">Tee Time</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium text-right">Green + Cart</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium text-right">Fee Held</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium text-right">Total</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-muted font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map(b => {
                const bStatus = getBookingStatus(b.status, b.paymentStatus);
                return (
                  // U-O (§1b): cancelled rows fade back; a row carrying a late
                  // fee keeps a 3px amber left edge so the money is findable.
                  <tr key={b.id} className={'border-b border-line-soft last:border-0 ' + (b.paymentStatus === 'cancellation_fee_charged' ? 'border-l-[3px] border-l-warn ' : '') + (b.status==='cancelled'?'opacity-50':'')}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{b.golferName}</div>
                      <div className="text-[12.5px] text-ink-muted">{b.golferEmail} · {b.players} player{b.players!==1?'s':''}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted text-[12.5px] tabular-nums">
                      {new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <div>{new Date(b.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft text-[13.5px] tabular-nums">
                      <div>{fmtDate(b.teeTime.date)}</div>
                      <div>{fmtTime(b.teeTime.time)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                      ${((b.greenFeeTotal + b.cartFeeTotal) / 100).toFixed(2)}
                      {b.paymentStatus !== 'paid' && b.status !== 'cancelled' && <span className="text-ink-faint text-xs"> est.</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-[13.5px] tabular-nums">
                      {b.cancellationFeeTotal > 0
                        ? <span className={'font-medium ' + (b.paymentStatus === 'cancellation_fee_charged' ? 'text-warn' : 'text-ink-muted')}>${(b.cancellationFeeTotal / 100).toFixed(2)}</span>
                        : <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-soft tabular-nums">
                      ${(b.totalAmount / 100).toFixed(2)}
                      {b.paymentStatus !== 'paid' && b.status !== 'cancelled' && <span className="text-ink-faint text-xs"> est.</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink"><StatusDot {...statusDot(bStatus.tone)} />{bStatus.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

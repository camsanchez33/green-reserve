'use client';
// Money rework (Cam 2026-10-19: the policy "is here and not settings — that
// makes zero sense", "an upcoming bookings tab — what?", "cancellation history
// needs a complete rework"). History only: who cancelled, when, how far ahead,
// and whether a fee was kept. The policy is edited in Settings; cancelling a
// booking is done on the tee sheet (its panel uses lib/cancel-confirm.ts).
// MONEY-1 (Cam 2026-11-09, Money notes: "reorganize and rework … keep the little note about what their cancellation
// policy is — clicking settings should go straight to the cancellation policy"): the policy sits on top as its own
// line with Change → Settings at the policy (?focus=cancellation-policy); no totals (the list is capped — ACC-1); one
// list with All / Fee kept as tabs; each row reads golfer · tee time · cancelled when · the fee.
import { useState } from 'react';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { RefundForm } from './RefundForm';
import type { MoneyBooking, MoneyCourse } from './types';
import { NO_FEE_LABEL } from '@/lib/no-fee-labels';
import { formatStamp as fmtStamp, formatTeeTime as fmtTime, formatTeeDay as fmtDate } from '@/lib/format';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoursAhead = (b: MoneyBooking) => {
  if (!b.cancelledAt) return null;
  const tee = Date.parse(`${b.teeTime.date}T${b.teeTime.time.slice(0, 5)}:00`); // browser-local; a label, not a rule
  const h = (tee - Date.parse(b.cancelledAt)) / 3600000;
  if (!Number.isFinite(h)) return null;
  if (h < 0) return 'after the tee time';
  if (h < 24) return `${Math.max(1, Math.round(h))} hour${Math.round(h) === 1 ? '' : 's'} before`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} before`;
};

export function CancellationsPanel({ bookings, course, initialQuery = '', canWaive = false, onRefunded }: { bookings: MoneyBooking[]; course: MoneyCourse; initialQuery?: string; canWaive?: boolean; onRefunded?: (message: string) => void }) {
  const [feesOnly, setFeesOnly] = useState(false);
  // Search opens this tab with the golfer's name (dead end 18).
  const [search, setSearch] = useState(initialQuery);
  const q = search.trim().toLowerCase();
  const cancelled = bookings.filter(b => b.status === 'cancelled' && (!q || b.golferName.toLowerCase().includes(q) || b.golferEmail.toLowerCase().includes(q)))
    .sort((a, b) => (b.cancelledAt ?? b.createdAt).localeCompare(a.cancelledAt ?? a.createdAt));
  const withFee = cancelled.filter(b => b.paymentStatus === 'cancellation_fee_charged' || !!b.noShowFeeKeptCents);
  const rows = feesOnly ? withFee : cancelled;

  return (
    <div className="space-y-4">
      <Card className="px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-ink-soft">Your cancellation policy</div>
          <div className="text-[14px] text-ink mt-0.5">
            Free until {course.cancellationHours} hours before{course.lateCancellationFee > 0 ? <>, then a ${course.lateCancellationFee.toFixed(2)} fee</> : ', no late fee'}.{' '}
            <Link href="/dashboard/settings?section=Prices+%26+fees&focus=cancellation-policy" className="text-pine font-medium hover:underline underline-offset-4">Change</Link>
          </div>
        </div>
      </Card>
      {course.lateCancellationFee > 0 && !course.stripeAccountActive && (
        <div className="bg-white rounded-[10px] shadow-card border-l-[3px] border-warn px-4 py-2.5 text-[13px] text-ink">
          Late-cancel fee needs Stripe connected (Payouts tab).
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3 pb-2 border-b border-line-soft">
          <SlidingTabs value={feesOnly ? 'fee' : 'all'} onChange={k => setFeesOnly(k === 'fee')} tabs={[['all', `All ${cancelled.length}`], ['fee', `Fee kept ${withFee.length}`]] as const} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a golfer" aria-label="Find a golfer"
            className="ml-auto w-48 bg-white border border-line rounded-[7px] px-3 py-1.5 text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none" />
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-[13.5px] text-ink-soft">{q ? `Nobody matches “${search.trim()}”.` : feesOnly ? 'No fees kept.' : 'No cancellations yet.'}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map(b => {
              const fee = b.paymentStatus === 'cancellation_fee_charged' || !!b.noShowFeeKeptCents;
              const ahead = hoursAhead(b);
              return (
                <li key={b.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-4 py-3 text-[13.5px] items-center">
                  <div className="min-w-0"><span className="font-medium text-ink">{b.golferName}</span><span className="text-ink-muted"> · {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                  <div className="text-ink-soft">{fmtDate(b.teeTime.date)} {fmtTime(b.teeTime.time)}{b.cancelledAt ? <span className="block text-[12.5px] text-ink-muted">cancelled {fmtStamp(b.cancelledAt)}{ahead ? ` · ${ahead}` : ''}</span> : null}</div>
                  <span className="inline-flex items-center gap-1.5 text-ink sm:justify-end">
                    <StatusDot status={fee ? 'warn' : b.noFeeReason === 'charge_failed' ? 'bad' : 'neutral'} />{fee ? (b.noShowFeeKeptCents ? `${usd(b.noShowFeeKeptCents)} no-show fee kept` : `${usd(b.cancellationFeeTotal)} fee kept`) : b.paymentStatus === 'refunded' ? 'Fee refunded' : b.noFeeReason ? NO_FEE_LABEL[b.noFeeReason] : 'No fee'}
                  </span>
                  {canWaive && b.paymentStatus === 'cancellation_fee_charged' && <div className="sm:col-span-3"><RefundForm bookingId={b.id} kind="late_fee" onDone={m => onRefunded?.(m)} /></div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

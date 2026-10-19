'use client';
// Money rework (Cam 2026-10-19: the policy "is here and not settings — that
// makes zero sense", "an upcoming bookings tab — what?", "cancellation history
// needs a complete rework"). History only: who cancelled, when, how far ahead,
// and whether a fee was kept. The policy is edited in Settings; cancelling a
// booking is done on the tee sheet (its panel uses lib/cancel-confirm.ts).
import { useState } from 'react';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/StatusDot';
import type { MoneyBooking, MoneyCourse } from './types';
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

export function CancellationsPanel({ bookings, course }: { bookings: MoneyBooking[]; course: MoneyCourse }) {
  const [feesOnly, setFeesOnly] = useState(false);
  const cancelled = bookings.filter(b => b.status === 'cancelled')
    .sort((a, b) => (b.cancelledAt ?? b.createdAt).localeCompare(a.cancelledAt ?? a.createdAt));
  const withFee = cancelled.filter(b => b.paymentStatus === 'cancellation_fee_charged');
  const rows = feesOnly ? withFee : cancelled;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[13.5px] text-ink">
          {cancelled.length === 0 ? 'No cancellations yet.' : 'Your latest cancellations, newest first.'}
        </p>
        <p className="text-[12.5px] text-ink-muted">
          Free cancellation until {course.cancellationHours} hours before
          {course.lateCancellationFee > 0 ? <>, then a ${course.lateCancellationFee.toFixed(2)} fee</> : ', no late fee'}.{' '}
          <Link href="/dashboard/settings?section=Prices+%26+fees" className="text-pine font-medium hover:underline">Change in Settings</Link>
        </p>
      </div>
      {course.lateCancellationFee > 0 && !course.stripeAccountActive && (
        <div className="bg-white border border-line border-l-[3px] border-l-warn rounded-md px-4 py-2.5 text-[13px] text-ink">
          Your late-cancel fee can&apos;t be charged until Stripe is connected (Payouts tab). Golfers can still book and cancel.
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="bg-white rounded-lg shadow-card">
          <div className="flex gap-5 px-4 pt-3 border-b border-line-soft" role="tablist" aria-label="Show">
            {([[false, 'All'], [true, 'Fee kept']] as [boolean, string][]).map(([v, l]) => (
              <button key={l} role="tab" aria-selected={feesOnly === v} onClick={() => setFeesOnly(v)}
                className={'pb-2 -mb-px text-[13.5px] font-medium border-b-2 ' + (feesOnly === v ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{l}</button>
            ))}
          </div>
          <ul className="divide-y divide-line-soft">
            {rows.map(b => {
              const fee = b.paymentStatus === 'cancellation_fee_charged';
              const ahead = hoursAhead(b);
              return (
                <li key={b.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 px-4 py-3 text-[13.5px]">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{b.golferName}</span><span className="text-ink-muted"> · {b.players} player{b.players !== 1 ? 's' : ''}</span>
                    <div className="text-ink-soft">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)}{b.cancelledAt ? <> · cancelled {fmtStamp(b.cancelledAt)}{ahead ? ` (${ahead})` : ''}</> : null}</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-ink sm:justify-end">
                    <StatusDot status={fee ? 'warn' : 'neutral'} />{fee ? `${usd(b.cancellationFeeTotal)} fee kept` : 'No fee'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

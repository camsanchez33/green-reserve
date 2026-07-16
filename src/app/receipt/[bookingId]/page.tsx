'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, Printer } from 'lucide-react';
import { serviceFeeLabel } from '@/lib/booking-fees';
import { GolferExitLinks } from '@/components/GolferExitLinks';

type ReceiptData = {
  bookingId: string; golferName: string; courseName: string; courseSlug: string; courseLocation: string;
  date: string; time: string; holes: number; players: number; cartSelected: boolean;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  accessFeeTotal: number; totalAmount: number; status: string;
  cancellationFeeTotal: number; cancellationFeeCharged: boolean; createdAt: string;
};

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function dollars(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

function ReceiptPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = String(params.bookingId || '');
  const token = search.get('token') || '';

  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId || !token) { setError('Missing required link parameters.'); setLoading(false); return; }
    fetch(`/api/receipt/${bookingId}?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError('This receipt link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle size={32} className="text-bad mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">Receipt not found</h1>
          <p className="text-ink-soft text-sm">{error || 'This link is invalid.'}</p>
        </div>
      </div>
    );
  }

  const isCompleted = data.status === 'completed';
  const isCancelled = data.status === 'cancelled';

  const statusLabel = isCompleted ? 'Paid at check-in'
    : isCancelled ? 'Cancelled'
    : 'Due at course';

  const totalLabel = isCompleted ? 'Total charged'
    : isCancelled ? 'Would have been'
    : 'Estimated total due at course';

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .receipt-card { border: none !important; box-shadow: none !important; max-width: 100% !important; }
        }
      `}</style>
      <div className="min-h-screen bg-paper px-4 py-10 print:bg-white print:py-0">
        <div className="max-w-lg mx-auto">
          {/* Print button */}
          <div className="no-print flex justify-end mb-4">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink border border-line rounded-md px-4 py-2 bg-white transition-colors"
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
          </div>

          <div className="receipt-card bg-white rounded-lg border border-line overflow-hidden">
            {/* Header */}
            <div className="bg-[#0a0a0a] px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-base">
                  Green<span className="text-[#34d399]">Reserve</span>
                </span>
                <span className="text-zinc-400 text-sm font-medium">{isCompleted ? 'Receipt' : isCancelled ? 'Cancellation' : 'Booking Confirmation'}</span>
              </div>
            </div>

            <div className="px-6 py-6">
              {/* Status badge + title */}
              <div className="mb-5">
                <span className={`text-[11px] uppercase tracking-[0.06em] font-medium px-2 py-0.5 rounded ${isCompleted ? 'bg-ok/10 text-ok' : isCancelled ? 'bg-bad/10 text-bad' : 'bg-pine/10 text-pine'}`}>
                  {statusLabel}
                </span>
                <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mt-3 mb-1">{data.courseName}</h1>
                {data.courseLocation && <p className="text-ink-muted text-sm">{data.courseLocation}</p>}
              </div>

              {/* Booking details */}
              <div className="bg-paper rounded-md border border-line p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{fmtDate(data.date)}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Tee Time</span><span className="font-medium text-ink">{fmtTime(data.time)}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{data.players}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Holes</span><span className="font-medium text-ink">{data.holes}</span></div>
                {data.cartSelected && <div className="flex justify-between"><span className="text-ink-muted">Cart</span><span className="font-medium text-ink">Yes</span></div>}
              </div>

              {/* Line items */}
              <div className="border border-line rounded-md divide-y divide-line text-sm mb-5">
                <div className="flex justify-between px-4 py-3">
                  <span className="text-ink-soft">Green Fee</span>
                  <span className="font-medium text-ink">{dollars(data.greenFeeTotal)}</span>
                </div>
                {data.cartFeeTotal > 0 && (
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-ink-soft">Cart Fee</span>
                    <span className="font-medium text-ink">{dollars(data.cartFeeTotal)}</span>
                  </div>
                )}
                {data.rangeBallsTotal > 0 && (
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-ink-soft">Range Balls</span>
                    <span className="font-medium text-ink">{dollars(data.rangeBallsTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-3">
                  <span className="text-ink-soft">{serviceFeeLabel(data.players)}</span>
                  <span className="font-medium text-ink">{dollars(data.accessFeeTotal)}</span>
                </div>
                {isCancelled && data.cancellationFeeCharged && data.cancellationFeeTotal > 0 && (
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-ink-soft">Late-cancellation fee</span>
                    <span className="font-medium text-ink">{dollars(data.cancellationFeeTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-3 bg-paper">
                  <span className="font-semibold text-ink">{totalLabel}</span>
                  <span className="font-semibold text-ink text-base">{dollars(data.totalAmount)}</span>
                </div>
              </div>

              {/* Payment line */}
              {isCompleted && (
                <div className="text-sm text-ink-soft mb-5">
                  <span className="font-medium text-ok">✓ Paid</span> at check-in · Booking #{data.bookingId.slice(0, 8).toUpperCase()}
                </div>
              )}
              {!isCompleted && !isCancelled && (
                <div className="text-sm text-ink-muted mb-5">
                  Nothing has been charged yet. Payment collected at check-in. · Booking #{data.bookingId.slice(0, 8).toUpperCase()}
                </div>
              )}
              {isCancelled && (
                <div className="text-sm text-ink-muted mb-5">
                  Booking #{data.bookingId.slice(0, 8).toUpperCase()} · Cancelled
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-line px-6 py-4 text-center text-xs text-ink-muted">
              hello@greenreserve.app · greenreserve.app
            </div>
          </div>

          {data.courseSlug && (
            <div className="no-print max-w-lg mx-auto mt-6">
              <GolferExitLinks courseSlug={data.courseSlug} courseName={data.courseName} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ReceiptPageInner />
    </Suspense>
  );
}

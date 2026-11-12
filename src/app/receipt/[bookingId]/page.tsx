'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { serviceFeeLabel, SHOP_FEE_LABEL } from '@/lib/booking-fees';
import { GolferExitLinks } from '@/components/GolferExitLinks';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { CARD } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { BILLING_EMAIL } from '@/lib/contact';

type ReceiptData = {
  /** RECEIPT-2: how it was paid (null = not paid yet / cancelled / refunded). */
  payment?: { method: 'cash' | 'card' | 'account'; paidAt: string | null; amountCents: number; card?: string; tenderedCents?: number; changeCents?: number } | null;
  hasAccount?: boolean; timezone?: string;
  bookingId: string; bookingRef?: string; golferName: string; courseName: string; courseSlug: string; courseLocation: string; brandColor?: string;
  date: string; time: string; holes: number; productLabel?: string | null; players: number; cartSelected: boolean;
  /** CART-4: shown when the course puts the cart ticket on the receipt. */
  cartTicket?: { riders: number } | null;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  accessFeeTotal: number; totalAmount: number; status: string;
  /** POS-1a: pro-shop items charged with the round; totalAmount includes them. */
  shopLines?: { name: string; unitPriceCents: number; quantity: number }[]; shopFeeCents?: number;
  /** W2-7 B2: sales tax on the shop items. */
  shopTaxCents?: number;
  cancellationFeeTotal: number; cancellationFeeCharged: boolean; createdAt: string;
  /** R-GOLF-010: what actually reached the card — from lib/receipt-charges. */
  paidOffline?: boolean;
  onAccount?: boolean;
  roundRefunded?: boolean;
  charges?: { label: string; amountCents: number; refunded: boolean }[];
  chargedNowCents?: number;
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

/** RECEIPT-2: "Nov 8, 2:14 PM" in the course's time zone. */
function paidWhen(iso: string, tz?: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz || undefined }); } catch { return ''; }
}

function ReceiptPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = String(params.bookingId || '');
  const token = search.get('token') || '';

  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId) { setError('Missing required link parameters.'); setLoading(false); return; }
    // MP-2b: a missing token is NOT an error any more. /api/receipt accepts an
    // admin session as an alternative (MP-2), and the admin console links here
    // without one — bailing early made every Receipt link in the console dead.
    // Golfers still arrive with ?token=; let the API decide either way.
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    fetch(`/api/receipt/${bookingId}${qs}`)
      .then(async r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError('This receipt link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);
  // RECEIPT-1: the tee sheet's "Print" opens this with ?print=1 — print once it has loaded.
  const autoPrint = search.get('print') === '1';
  useEffect(() => {
    if (!autoPrint || !data) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, data]);

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
        <div className={`${CARD} max-w-md w-full p-8 text-center`}>
          <h1 className="font-serif text-[24px] leading-tight text-ink mb-2">Receipt not found</h1>
          <p className="text-ink-soft text-sm">{error || 'This link is invalid.'}</p>
        </div>
      </div>
    );
  }

  const isCompleted = data.status === 'completed';
  const isCancelled = data.status === 'cancelled';

  const paidAtCourse = isCompleted && !!data.paidOffline;
  const onAccount = isCompleted && !!data.onAccount;
  const charges = data.charges ?? [];
  const payment = data.payment ?? null;
  const chargedNow = data.chargedNowCents ?? 0;

  // paymentStatus 'refunded' is also set when a cancelled booking's fee is waived — only a played round reads "Refunded".
  const refunded = !!data.roundRefunded && !isCancelled;
  const statusLabel = refunded ? 'Refunded'
    : onAccount ? 'On your member account'
    : paidAtCourse ? 'Paid at the course'
    : isCompleted ? 'Paid at check-in'
    : isCancelled ? 'Cancelled'
    : 'Due at course';
  // CART-5: the same page is the booking confirmation, so "Paid" only once the round is — never before (review 2026-11-09).
  const cartState = refunded ? 'Refunded' : onAccount ? 'On account' : isCompleted ? 'Paid' : isCancelled ? 'Cancelled' : 'Due at course';

  // The card block below says what the card took; these totals are the booking's price.
  const totalLabel = refunded || paidAtCourse || onAccount ? 'Booking total'
    : isCompleted ? 'Total charged'
    : isCancelled ? 'Booking total (not charged)'
    : 'Estimated total due at course';

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 4mm; }
          .no-print, footer, nextjs-portal { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          .receipt-card .p-4 { padding: 1.5mm 0 !important; border: none !important; }
          .receipt-wrap { max-width: 72mm !important; margin: 0 auto !important; }
          .receipt-card { border: none !important; box-shadow: none !important; max-width: 100% !important; font-size: 11px !important; }
          .receipt-card * { color: #000 !important; background: transparent !important; border-color: #000 !important; }
          .receipt-card .px-6, .receipt-card .px-4 { padding-left: 0 !important; padding-right: 0 !important; }
          .receipt-card .py-6 { padding-top: 2mm !important; padding-bottom: 2mm !important; }
          .receipt-card .py-3, .receipt-card .py-3\.5 { padding-top: 1mm !important; padding-bottom: 1mm !important; }
          .receipt-card .text-xl { font-size: 14px !important; }
          .receipt-card img { display: none !important; }
        }
      `}</style>
      <div className="min-h-screen bg-paper px-4 py-10 print:bg-white print:py-0">
        <div className="receipt-wrap max-w-lg mx-auto">
          {/* Print button */}
          <div className="no-print flex justify-end mb-4">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink border border-line rounded-md px-4 py-2 bg-white transition-colors"
            >
               Print / Save as PDF
            </button>
          </div>

          <div className={`${CARD} receipt-card overflow-hidden`}>
            {/* The course's bar, not GreenReserve's — this document belongs to
                the round the golfer played, not to the platform. */}
            <CourseHeaderBar
              courseName={data.courseName}
              accent={data.brandColor}
              right={isCompleted ? 'Receipt' : isCancelled ? 'Cancellation' : 'Booking confirmation'}
            />

            <div className="px-6 py-6">
              {/* Status + title */}
              <div className="mb-5">
                <StatusDot status={refunded ? 'neutral' : isCompleted ? 'ok' : isCancelled ? 'bad' : 'neutral'} label={statusLabel} />
                {/* RECEIPT-2: the course is named once, on the bar; the place sits under the status. */}
                {data.courseLocation && <p className="text-ink-soft text-sm mt-1.5">{data.courseLocation}</p>}
              </div>

              {/* Booking details */}
              <div className="bg-paper/70 rounded-md p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{fmtDate(data.date)}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Tee time</span><span className="font-medium text-ink">{fmtTime(data.time)}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{data.players}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">{data.productLabel ? 'Round' : 'Holes'}</span><span className="font-medium text-ink">{data.productLabel ? `${data.productLabel} · ${data.holes} holes` : data.holes}</span></div>
                {/* CART-5 (Cam 2026-11-09): the receipt only says the cart is paid for; the golfer takes a cart and the
                    starter writes its number on the starter's sheet. */}
                {data.cartTicket && <div className="flex justify-between"><span className="text-ink-muted">Cart</span><span className="font-medium text-ink">{cartState} · {data.cartTicket.riders} of {data.players} riding</span></div>}
              </div>

              {/* Line items */}
              <div className="border border-line rounded-md divide-y divide-line text-sm mb-5">
                <div className="flex justify-between gap-3 px-4 py-3">
                  <span className="text-ink-soft">Green fee</span>
                  <span className="shrink-0 font-medium text-ink">{dollars(data.greenFeeTotal)}</span>
                </div>
                {data.cartFeeTotal > 0 && (
                  <div className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-ink-soft">Cart fee</span>
                    <span className="shrink-0 font-medium text-ink">{dollars(data.cartFeeTotal)}</span>
                  </div>
                )}
                {data.rangeBallsTotal > 0 && (
                  <div className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-ink-soft">Range balls</span>
                    <span className="shrink-0 font-medium text-ink">{dollars(data.rangeBallsTotal)}</span>
                  </div>
                )}
                {data.accessFeeTotal > 0 && payment?.method !== 'cash' && (
                  <div className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-ink-soft">{serviceFeeLabel(data.players)}</span>
                    <span className="shrink-0 font-medium text-ink">{dollars(data.accessFeeTotal)}</span>
                  </div>
                )}
                {(data.shopLines ?? []).map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-ink-soft">{l.name}{l.quantity > 1 ? ` × ${l.quantity}` : ''}</span>
                    <span className="shrink-0 font-medium text-ink">{dollars(l.unitPriceCents * l.quantity)}</span>
                  </div>
                ))}
                {(data.shopFeeCents ?? 0) > 0 && (
                  <div className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-ink-soft">{SHOP_FEE_LABEL}</span>
                    <span className="shrink-0 font-medium text-ink">{dollars(data.shopFeeCents ?? 0)}</span>
                  </div>
                )}
                {(data.shopTaxCents ?? 0) > 0 && (
                  <div className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-ink-soft">Sales tax on shop items</span>
                    <span className="shrink-0 font-medium text-ink">{dollars(data.shopTaxCents ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline px-4 py-3.5 bg-paper">
                  <span className="font-medium text-ink">{payment ? (payment.method === 'account' ? 'On account' : 'Paid') : totalLabel}</span>
                  <span className="font-serif font-semibold text-ink text-xl leading-none">{dollars(payment ? payment.amountCents : data.totalAmount)}</span>
                </div>
              </div>

              {/* R-GOLF-010: every charge that reached the card, and any refund —
                  read from the money records, so it matches the card statement. */}
              {charges.length > 0 && (
                <div className="border border-line rounded-md divide-y divide-line text-sm mb-5">
                  <div className="px-4 py-3 font-medium text-ink">Charged to your card</div>
                  {charges.map((c, i) => (
                    <div key={i} className="flex justify-between gap-3 px-4 py-3">
                      <span className="text-ink-soft">{c.label}{c.refunded ? ' · refunded' : ''}</span>
                      <span className={`shrink-0 ${c.refunded ? 'text-ink-muted line-through' : 'font-medium text-ink'}`}>{c.amountCents < 0 ? `−${dollars(-c.amountCents)}` : dollars(c.amountCents)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-baseline px-4 py-3.5 bg-paper">
                    <span className="font-medium text-ink">On your card</span>
                    <span className="shrink-0 font-semibold text-ink">{dollars(chargedNow)}</span>
                  </div>
                </div>
              )}

              {/* Payment line */}
              {isCompleted && payment && (
                <div className="text-sm text-ink mb-5 space-y-1">
                  <div className="flex justify-between gap-3">
                    <span>{payment.method === 'cash' ? 'Cash' : payment.method === 'account' ? 'Member account' : payment.card ?? 'Card'}</span>
                    {payment.paidAt && <span className="text-ink-soft tabular-nums">{paidWhen(payment.paidAt, data.timezone)}</span>}
                  </div>
                  {payment.tenderedCents != null && payment.changeCents != null && (
                    <div className="flex justify-between gap-3 text-ink-soft tabular-nums"><span>Cash given {dollars(payment.tenderedCents)}</span><span>Change {dollars(payment.changeCents)}</span></div>
                  )}
                  <div className="text-ink-muted">Booking {data.bookingRef ?? data.bookingId.slice(0, 8).toUpperCase()}</div>
                </div>
              )}
              {isCompleted && !payment && (
                <div className="text-sm text-ink mb-5">
                  {refunded ? 'Refunded' : onAccount ? 'On your member account' : paidAtCourse ? 'Paid at the course' : 'Paid at check-in'} · Booking {data.bookingRef ?? data.bookingId.slice(0, 8).toUpperCase()}
                </div>
              )}
              {!isCompleted && !isCancelled && (
                <div className="text-sm text-ink mb-5">
                  {chargedNow > 0 ? 'The round itself is paid when you check in.' : 'Nothing has been charged yet. The round is paid when you check in.'} · Booking {data.bookingRef ?? data.bookingId.slice(0, 8).toUpperCase()}
                </div>
              )}
              {isCancelled && (
                <div className="text-sm text-ink-muted mb-5">
                  Booking {data.bookingRef ?? data.bookingId.slice(0, 8).toUpperCase()} · Cancelled
                </div>
              )}
            </div>

            {/* Footer */}
            {/* LOGO-2 (Cam 2026-10-20): the short mark — the golfer, cream on pine — signs the receipt. */}
            <div className="border-t border-line px-6 py-4 flex items-center justify-center gap-2.5 text-xs text-ink-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- prints with the receipt; next/image adds nothing for a 28px static mark */}
              <img src="/brand/mark.svg" alt="" width={28} height={28} loading="lazy" className="w-7 h-7 rounded-md shrink-0" />
              <span>Booked through GreenReserve · greenreserve.app · {BILLING_EMAIL}</span>
            </div>
          </div>

          {data.courseSlug && (
            <div className="no-print max-w-lg mx-auto mt-6">
              <GolferExitLinks courseSlug={data.courseSlug} courseName={data.courseName} showBookings={!!data.hasAccount} />
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

'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, AlertCircle, Loader2, MapPin, Calendar, Clock, Users } from 'lucide-react';

type BookingInfo = {
  bookingId: string;
  golferName: string;
  courseName: string;
  courseSlug: string;
  courseAddress: string;
  brandColor: string;
  date: string;
  time: string;
  holes: number;
  players: number;
  greenFeeTotal: number;
  cartFeeTotal: number;
  rangeBallsTotal: number;
  accessFeeTotal: number;
  totalAmount: number;
  cancellationHours: number;
  cancellationFeeTotal: number;
  cancellationFeeCharged: boolean;
  status: string;
  paymentStatus: string;
  windowOpen: boolean;
};

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}
function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function ManagePageInner() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = String(params.bookingId || '');
  const token = search.get('token') || '';

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expired, setExpired] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ feeCharged: boolean } | null>(null);

  useEffect(() => {
    if (!bookingId || !token) {
      setErrorMsg('This link is missing required details.');
      setLoading(false);
      return;
    }
    fetch(`/api/manage/${bookingId}?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 410) { setExpired(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => { if (data) setInfo(data); })
      .catch(() => setErrorMsg('This link is invalid or has expired. Contact the course for assistance.'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  async function handleCancel() {
    setCancelling(true);
    setCancelError('');
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, token }),
      });
      const data = await res.json();
      if (!res.ok) { setCancelError(data.error || 'Could not cancel. Please contact the course.'); setCancelling(false); return; }
      setCancelResult(data);
      setCancelled(true);
    } catch {
      setCancelError('Something went wrong. Please contact the course directly.');
    }
    setCancelling(false);
    setConfirming(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>;
  }

  const headerStyle = { backgroundColor: info?.brandColor || '#24513B' };

  if (expired) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <Clock className="w-10 h-10 text-ink-muted mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">This link has expired</h1>
          <p className="text-ink-soft text-sm">Booking management links expire 24 hours after your tee time. Contact the course directly if you need assistance.</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle className="w-10 h-10 text-bad mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">Link not recognized</h1>
          <p className="text-ink-soft text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  if (cancelled) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <div className="h-14 flex items-center px-6" style={headerStyle}>
            <span className="text-white font-medium">{info.courseName}</span>
          </div>
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-lg bg-ok/8 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-ok" />
            </div>
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Booking cancelled</h1>
            <p className="text-ink-soft text-sm mb-6">Your spot at {info.courseName} on {fmtDate(info.date)} has been cancelled.</p>
            {cancelResult?.feeCharged && (
              <div className="bg-warn/5 border border-warn/20 rounded-md p-4 mb-4 text-left">
                <p className="text-warn text-sm font-medium">Late-cancellation fee applied</p>
                <p className="text-ink-soft text-xs mt-1">A {dollars(info.cancellationFeeTotal)} fee was already charged to your card when the cancellation window closed. This fee is non-refundable.</p>
              </div>
            )}
            {!cancelResult?.feeCharged && (
              <div className="bg-ok/5 border border-ok/20 rounded-md p-4 mb-4 text-left">
                <p className="text-ok text-sm font-medium">No charge — your card has been released</p>
              </div>
            )}
            <p className="text-xs text-ink-muted">A confirmation email has been sent to you.</p>
          </div>
        </div>
      </div>
    );
  }

  const alreadyCancelled = info.status === 'cancelled';
  const alreadyCompleted = info.status === 'completed';
  const canCancel = !alreadyCancelled && !alreadyCompleted;

  const policyText = info.cancellationFeeTotal > 0
    ? info.windowOpen
      ? `Free to cancel until ${info.cancellationHours} hours before your tee time. A ${dollars(info.cancellationFeeTotal)} fee applies after that.`
      : `The free-cancellation window has closed. A ${dollars(info.cancellationFeeTotal)} fee has been or will be charged.`
    : 'Free cancellation any time — this course has no late-cancellation fee.';

  const confirmMsg = info.windowOpen
    ? `Are you sure you want to cancel? This is free — your card won't be charged.`
    : info.cancellationFeeCharged
      ? `A ${dollars(info.cancellationFeeTotal)} late-cancellation fee was already charged to your card. Cancelling now won't trigger an additional charge, but the fee is non-refundable.`
      : `The free-cancellation window has closed. Cancelling now will result in a ${dollars(info.cancellationFeeTotal)} late-cancellation fee charged to your card.`;

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
        <div className="h-14 flex items-center px-6" style={headerStyle}>
          <span className="text-white font-medium">{info.courseName}</span>
        </div>
        <div className="p-8">
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-1">
            {alreadyCancelled ? 'Booking cancelled' : alreadyCompleted ? 'Round complete' : `Hi, ${info.golferName.split(' ')[0]}`}
          </h1>
          <p className="text-ink-soft text-sm mb-6">
            {alreadyCancelled ? 'This booking was cancelled.' : alreadyCompleted ? 'Thanks for playing — this round is complete.' : 'Your booking details are below.'}
          </p>

          {/* Details card */}
          <div className="bg-paper rounded-md border border-line p-5 mb-5 space-y-3">
            <div className="flex items-center gap-2.5 text-sm">
              <Calendar size={15} className="text-ink-muted shrink-0" />
              <span className="text-ink font-medium">{fmtDate(info.date)}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Clock size={15} className="text-ink-muted shrink-0" />
              <span className="text-ink font-medium">{fmtTime(info.time)} &middot; {info.holes} holes</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Users size={15} className="text-ink-muted shrink-0" />
              <span className="text-ink font-medium">{info.players} player{info.players !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-start gap-2.5 text-sm">
              <MapPin size={15} className="text-ink-muted shrink-0 mt-0.5" />
              <span className="text-ink-soft">{info.courseAddress}</span>
            </div>

            {/* Price breakdown */}
            <div className="border-t border-line pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-soft">
                <span>Green Fee</span><span>{dollars(info.greenFeeTotal)}</span>
              </div>
              {info.cartFeeTotal > 0 && (
                <div className="flex justify-between text-ink-soft">
                  <span>Cart Fee</span><span>{dollars(info.cartFeeTotal)}</span>
                </div>
              )}
              {info.rangeBallsTotal > 0 && (
                <div className="flex justify-between text-ink-soft">
                  <span>Range Balls</span><span>{dollars(info.rangeBallsTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-soft">
                <span>Fees</span><span>{dollars(info.accessFeeTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-ink text-base border-t border-line pt-2">
                <span>Total due at check-in</span><span>{dollars(info.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Cancellation policy */}
          {canCancel && (
            <div className={`rounded-md border p-4 mb-5 text-sm ${info.windowOpen ? 'bg-ok/5 border-ok/20 text-ok' : 'bg-warn/5 border-warn/20 text-warn'}`}>
              {policyText}
            </div>
          )}

          {alreadyCancelled && (
            <div className="rounded-md bg-bad/5 border border-bad/20 p-4 mb-5 text-sm text-bad">
              This booking is cancelled.
            </div>
          )}
          {alreadyCompleted && (
            <div className="rounded-md bg-ok/5 border border-ok/20 p-4 mb-5 text-sm text-ok">
              This round was completed and payment was collected at check-in.
            </div>
          )}

          {cancelError && (
            <p className="text-bad text-sm mb-4">{cancelError}</p>
          )}

          {/* Cancel action */}
          {canCancel && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="w-full py-3 rounded-md border border-bad/30 text-bad font-medium text-sm hover:bg-bad/5 transition-colors"
            >
              Cancel Booking
            </button>
          )}

          {canCancel && confirming && (
            <div className="border border-line rounded-md p-5 space-y-4">
              <div className="flex items-start gap-2">
                <XCircle size={16} className="text-bad shrink-0 mt-0.5" />
                <p className="text-sm text-ink">{confirmMsg}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 py-2.5 rounded-md border border-line text-ink-soft font-medium text-sm hover:bg-paper transition-colors"
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-md bg-bad text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {cancelling ? <><Loader2 size={14} className="animate-spin" /> Cancelling…</> : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-ink-muted text-center mt-5">Booking ID: {info.bookingId}</p>
        </div>
      </div>
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ManagePageInner />
    </Suspense>
  );
}

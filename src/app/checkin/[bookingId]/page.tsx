'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertCircle, MapPin, Lock } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { GolferExitLinks } from '@/components/GolferExitLinks';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const cardStyle = {
  style: {
    base: { fontSize: '15px', color: '#1C1C18', '::placeholder': { color: '#98968B' } },
    invalid: { color: '#A3452F' },
  },
};

type CheckInInfo = {
  golferName: string; courseName: string; courseSlug: string; courseAddress: string; brandColor: string;
  date: string; time: string; players: number; holes: number; status: string;
  totalAmount: number; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number;
  hasCard: boolean;
};

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function WalkUpCheckInForm({ bookingId, token, totalAmount, golferName, onResult, onError }: {
  bookingId: string; token: string; totalAmount: number; golferName: string;
  onResult: (r: { totalCharged: number; feeRefunded: boolean; feeRefundAmount: number }) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setLoading(true);
    onError('');
    try {
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card,
        billing_details: { name: golferName },
      });
      if (error) { onError(error.message || 'Card error.'); setLoading(false); return; }

      const res = await fetch(`/api/checkin/${bookingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, paymentMethodId: paymentMethod.id }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error || 'Check-in failed.'); setLoading(false); return; }
      onResult(data);
    } catch {
      onError('Something went wrong. Please try again or check in at the pro shop.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Card Details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10 transition-all">
          <CardElement options={cardStyle} />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={loading || !stripe}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 bg-pine hover:bg-pine-hover transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Charging…</> : `Check In & Pay $${(totalAmount / 100).toFixed(2)}`}
      </button>
      <div className="flex items-center justify-center gap-2 text-ink-muted text-xs">
        <Lock size={12} /><span>Secure checkout powered by Stripe</span>
      </div>
    </div>
  );
}

function CheckInPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = String(params.bookingId || '');
  const token = search.get('token') || '';

  const [info, setInfo] = useState<CheckInInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [result, setResult] = useState<{ totalCharged: number; feeRefunded: boolean; feeRefundAmount: number } | null>(null);

  useEffect(() => {
    if (!bookingId || !token) { setError('This check-in link is missing required details.'); setLoading(false); return; }
    fetch(`/api/checkin/${bookingId}?token=${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setInfo)
      .catch(() => setError('This check-in link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  async function handleSavedCardCheckIn() {
    setCheckingIn(true);
    setError('');
    try {
      const res = await fetch(`/api/checkin/${bookingId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Check-in failed.'); setCheckingIn(false); return; }
      setResult(data);
    } catch {
      setError('Something went wrong. Please try again or check in at the pro shop.');
    }
    setCheckingIn(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>;
  }

  if (error && !info) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle className="w-10 h-10 text-bad mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">Can&apos;t check in</h1>
          <p className="text-ink-soft text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  if (info.status === 'completed' || result) {
    const charged = result?.totalCharged ?? info.totalAmount;
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <CourseHeaderBar courseName={info.courseName} accent={info.brandColor} />
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-lg bg-ok/8 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-ok" />
            </div>
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">You&apos;re checked in!</h1>
            <p className="text-ink-soft mb-6 text-sm">${(charged / 100).toFixed(2)} was charged to your card. Enjoy your round.</p>
            {result?.feeRefunded && (
              <div className="bg-ok/5 border border-ok/20 rounded-md p-4 mb-6 text-left">
                <p className="text-ok text-xs">Your earlier ${(result.feeRefundAmount / 100).toFixed(2)} late-cancellation fee has been refunded.</p>
              </div>
            )}
            <p className="text-xs text-ink-muted mb-4">A receipt has been emailed to you.</p>
            {token && (
              <a href={`/receipt/${bookingId}?token=${encodeURIComponent(token)}`}
                className="text-sm text-pine font-medium hover:underline mb-6 block">
                View receipt →
              </a>
            )}
            <div className="mt-6">
              <GolferExitLinks courseSlug={info.courseSlug} courseName={info.courseName} accent={info.brandColor} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summary = (
    <div className="bg-paper rounded-md p-5 mb-6 space-y-2 text-sm border border-line">
      <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{fmtDate(info.date)}</span></div>
      <div className="flex justify-between"><span className="text-ink-muted">Tee Time</span><span className="font-medium text-ink">{fmtTime(info.time)}</span></div>
      <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{info.players} &middot; {info.holes} holes</span></div>
      <div className="border-t border-line mt-2 pt-2 space-y-1.5">
        <div className="flex justify-between text-ink-soft"><span>Green Fee</span><span>${(info.greenFeeTotal / 100).toFixed(2)}</span></div>
        {info.cartFeeTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart Fee</span><span>${(info.cartFeeTotal / 100).toFixed(2)}</span></div>}
        {info.rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range Balls</span><span>${(info.rangeBallsTotal / 100).toFixed(2)}</span></div>}
        <div className="flex justify-between text-ink-soft"><span>GreenReserve service fee ($1.50 × {info.players})</span><span>${(info.accessFeeTotal / 100).toFixed(2)}</span></div>
        <div className="flex justify-between font-semibold text-ink text-base border-t border-line pt-2">
          <span>Total</span><span>${(info.totalAmount / 100).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
        <CourseHeaderBar courseName={info.courseName} accent={info.brandColor} />
        <div className="p-8">
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-1">Check in, {info.golferName.split(' ')[0]}?</h1>
          <p className="text-ink-soft text-sm mb-6">
            {info.hasCard
              ? 'Confirm your round and pay now — no need to stop at the pro shop.'
              : 'Enter your card to pay now, or head to the pro shop to pay in person.'}
          </p>

          {summary}

          <div className="flex items-start gap-2 text-xs text-ink-muted mb-6">
            <MapPin size={14} className="shrink-0 mt-0.5" />
            <span>{info.courseAddress}</span>
          </div>

          {error && <p className="text-bad text-sm mb-4">{error}</p>}

          {info.hasCard ? (
            <>
              <button
                onClick={handleSavedCardCheckIn}
                disabled={checkingIn}
                className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 bg-pine hover:bg-pine-hover transition-colors disabled:opacity-70"
              >
                {checkingIn ? <><Loader2 size={16} className="animate-spin" /> Charging your card…</> : `Check In & Pay $${(info.totalAmount / 100).toFixed(2)}`}
              </button>
              <p className="text-center text-xs text-ink-muted mt-3">Charges the card you saved when you booked.</p>
            </>
          ) : (
            <Elements stripe={stripePromise}>
              <WalkUpCheckInForm
                bookingId={bookingId}
                token={token}
                totalAmount={info.totalAmount}
                golferName={info.golferName}
                onResult={setResult}
                onError={setError}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <CheckInPageInner />
    </Suspense>
  );
}

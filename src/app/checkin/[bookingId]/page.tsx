'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, PaymentRequestButtonElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { GolferExitLinks } from '@/components/GolferExitLinks';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const cardStyle = {
  style: {
    base: { fontSize: '15px', color: '#141814', '::placeholder': { color: '#979B94' } },
    invalid: { color: '#A3452F' },
  },
};

type CheckInInfo = {
  golferName: string; courseName: string; courseSlug: string; courseAddress: string; brandColor: string; heroImageUrl?: string; logoUrl?: string;
  date: string; time: string; players: number; holes: number; productLabel?: string | null; status: string;
  totalAmount: number; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number;
  hasCard: boolean;
  /** Paid in cash at the counter — never "charged to your card". */
  paidOffline?: boolean;
  cartAddOnCents?: number;
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

function WalkUpCheckInForm({ bookingId, token, totalAmount, golferName, courseName, accent, addCart, onResult, onError }: {
  bookingId: string; token: string; totalAmount: number; golferName: string; courseName: string; accent: string; addCart: boolean;
  onResult: (r: { totalCharged: number; feeRefunded: boolean; feeRefundFailed?: boolean; feeRefundAmount: number }) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  // PAY-1 (Cam 2026-10-06): Apple Pay / Google Pay. Stripe shows the button
  // only where the phone or browser has a wallet set up; everyone else sees the
  // card form alone, as before.
  const [walletRequest, setWalletRequest] = useState<PaymentRequest | null>(null);
  // The wallet sheet's handler is registered once; the cart toggle can change
  // after that, so it reads the latest choice from here.
  const addCartRef = useRef(addCart);
  addCartRef.current = addCart;

  /** One charge path for the card form and the wallet. True when it went through. */
  async function charge(paymentMethodId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/checkin/${bookingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, paymentMethodId, addCart: addCartRef.current }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error || 'Check-in failed.'); return false; }
      onResult(data);
      return true;
    } catch {
      onError('Something went wrong. Please try again or check in at the pro shop.');
      return false;
    }
  }

  useEffect(() => {
    if (!stripe) return;
    const req = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: { label: courseName || 'Tee time', amount: totalAmount },
      requestPayerName: true,
    });
    let live = true;
    req.canMakePayment().then(r => { if (live && r) setWalletRequest(req); }).catch(() => {});
    req.on('paymentmethod', async (ev) => {
      onError('');
      const ok = await charge(ev.paymentMethod.id);
      ev.complete(ok ? 'success' : 'fail');
    });
    return () => { live = false; };
    // Registered once per Stripe instance; the amount is kept current below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  useEffect(() => {
    walletRequest?.update({ total: { label: courseName || 'Tee time', amount: totalAmount } });
  }, [walletRequest, totalAmount, courseName]);

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
      if (!(await charge(paymentMethod.id))) setLoading(false);
    } catch {
      onError('Something went wrong. Please try again or check in at the pro shop.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {walletRequest && (
        <>
          <PaymentRequestButtonElement options={{ paymentRequest: walletRequest, style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '48px' } } }} />
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="h-px flex-1 bg-line" />or pay with a card<span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1.5">Card details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10 transition-all">
          <CardElement options={cardStyle} />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={loading || !stripe}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ backgroundColor: accent || '#173B2A' }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Charging…</> : `Check in · pay $${(totalAmount / 100).toFixed(2)}`}
      </button>
      <p className="text-center text-xs text-ink leading-relaxed">
        Prefer to pay in person? Skip this and check in at the pro shop.
      </p>
      <div className="flex items-center justify-center gap-2 text-ink-muted text-xs">
        <span>Secure checkout powered by Stripe</span>
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
  // B-5: "Add a cart today?" — off by default; the total below follows it.
  const [addCart, setAddCart] = useState(false);
  const [result, setResult] = useState<{ totalCharged: number; feeRefunded: boolean; feeRefundFailed?: boolean; feeRefundAmount: number } | null>(null);

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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, addCart }),
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
          
          <h1 className="font-semibold text-ink mb-2">Can&apos;t check in</h1>
          <p className="text-ink-soft text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  // R-GOLF-011: a cancelled booking has nothing to pay — never show it the pay form.
  if (info.status === 'cancelled' && !result) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <CourseHeaderBar courseName={info.courseName} accent={info.brandColor} photoUrl={info.heroImageUrl} logoUrl={info.logoUrl} />
          <div className="p-8 text-center">
            <h1 className="text-[30px] font-serif leading-none text-ink mb-3">This booking was cancelled</h1>
            <p className="text-ink-soft mb-6 text-sm">There&apos;s nothing to check in or pay. To play, book a new tee time.</p>
            <GolferExitLinks courseSlug={info.courseSlug} courseName={info.courseName} accent={info.brandColor} />
          </div>
        </div>
      </div>
    );
  }

  if (info.status === 'completed' || result) {
    const charged = result?.totalCharged ?? info.totalAmount;
    const paidAtCounter = !result && !!info.paidOffline;
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <CourseHeaderBar courseName={info.courseName} accent={info.brandColor} photoUrl={info.heroImageUrl} logoUrl={info.logoUrl} />
          <div className="p-8 text-center">
            <h1 className="text-[30px] font-serif leading-none text-ink mb-3">You&apos;re checked in!</h1>
            <p className="text-ink-soft mb-6 text-sm">{paidAtCounter ? 'Paid at the course. Enjoy your round.' : <>${(charged / 100).toFixed(2)} was charged to your card. Enjoy your round.</>}</p>
            {result?.feeRefunded && (
              <div className="bg-ok/5 border border-ok/20 rounded-md p-4 mb-6 text-left">
                <p className="text-ok text-xs">Your earlier ${(result.feeRefundAmount / 100).toFixed(2)} late-cancellation fee has been refunded.</p>
              </div>
            )}
            {/* SD-4: this page used to say "refunded" whenever a refund was
                attempted. Now it only says so when it went through. */}
            {result?.feeRefundFailed && (
              <div className="bg-warn/5 border border-warn/20 rounded-md p-4 mb-6 text-left">
                <p className="text-warn text-xs">Your earlier ${(result.feeRefundAmount / 100).toFixed(2)} late-cancellation fee is owed back to you, but the refund did not go through automatically. The course has been notified — if it hasn&apos;t appeared within a few days, contact them or thegreenreserve@outlook.com.</p>
              </div>
            )}
            <p className="text-xs text-ink mb-4">A receipt has been emailed to you.</p>
            {token && (
              <a href={`/receipt/${bookingId}?token=${encodeURIComponent(token)}`}
                className="text-sm font-medium hover:underline mb-6 block"
                style={{ color: info.brandColor || '#173B2A' }}>
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

  const cartAddOn = info.cartAddOnCents ?? 0;
  const cartCents = info.cartFeeTotal + (addCart ? cartAddOn : 0);
  const payTotal = info.totalAmount + (addCart ? cartAddOn : 0);
  const summary = (
    <div className="bg-paper rounded-md p-5 mb-6 space-y-2 text-sm border border-line">
      <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{fmtDate(info.date)}</span></div>
      <div className="flex justify-between"><span className="text-ink-muted">Tee time</span><span className="font-medium text-ink">{fmtTime(info.time)}</span></div>
      <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{info.players} &middot; {info.productLabel ? `${info.productLabel} · ` : ''}{info.holes} holes</span></div>
      <div className="border-t border-line mt-2 pt-2 space-y-1.5">
        <div className="flex justify-between text-ink-soft"><span>Green fee</span><span>${(info.greenFeeTotal / 100).toFixed(2)}</span></div>
        {cartCents > 0 && <div className="flex justify-between text-ink-soft"><span>Cart fee</span><span>${(cartCents / 100).toFixed(2)}</span></div>}
        {info.rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range balls</span><span>${(info.rangeBallsTotal / 100).toFixed(2)}</span></div>}
        <div className="flex justify-between text-ink-soft"><span>GreenReserve service fee ($1.50 × {info.players})</span><span>${(info.accessFeeTotal / 100).toFixed(2)}</span></div>
        {/* The number they're about to pay is the biggest thing on the card. */}
        <div className="flex justify-between items-baseline border-t border-line pt-3">
          <span className="font-medium text-ink">Total</span>
          <span className="font-serif font-semibold text-ink text-2xl leading-none">${(payTotal / 100).toFixed(2)}</span>
        </div>
      </div>
      {/* B-5: a cart for a booking that has none, priced at the tee time's cart fee. */}
      {cartAddOn > 0 && (
        <label className="mt-3 flex items-center justify-between gap-3 bg-white border border-line rounded-md px-3.5 py-3 cursor-pointer">
          <span className="text-sm text-ink">
            <span className="font-medium">Add a cart today?</span>
            <span className="text-ink-muted"> +${(cartAddOn / 100).toFixed(2)} for {info.players} player{info.players === 1 ? '' : 's'}</span>
          </span>
          <input type="checkbox" checked={addCart} onChange={e => setAddCart(e.target.checked)} className="w-5 h-5" style={{ accentColor: info.brandColor || '#173B2A' }} disabled={checkingIn} />
        </label>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
        <CourseHeaderBar courseName={info.courseName} accent={info.brandColor} photoUrl={info.heroImageUrl} logoUrl={info.logoUrl} />
        <div className="p-8">
          <h1 className="text-[30px] font-serif leading-none text-ink mb-2">Check in, {info.golferName.split(' ')[0]}?</h1>
          <p className="text-ink-soft text-sm mb-6">
            {info.hasCard
              ? 'Confirm your round and pay now — no need to stop at the pro shop.'
              : 'Enter your card to pay now, or head to the pro shop to pay in person.'}
          </p>

          {summary}

          <div className="flex items-start gap-2 text-xs text-ink-muted mb-6">
            
            <span>{info.courseAddress}</span>
          </div>

          {error && <p className="text-bad text-sm mb-4">{error}</p>}

          {info.hasCard ? (
            <>
              <button
                onClick={handleSavedCardCheckIn}
                disabled={checkingIn}
                className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-70"
                style={{ backgroundColor: info.brandColor || '#173B2A' }}
              >
                {checkingIn ? <><Loader2 size={16} className="animate-spin" /> Charging your card…</> : `Check in · pay $${(payTotal / 100).toFixed(2)}`}
              </button>
              {/* The other way to do this, as a sentence — not a second button
                  competing with the one above. */}
              <p className="text-center text-xs text-ink mt-3 leading-relaxed">
                This charges the card you saved when you booked. Prefer to pay in person? Skip this and check in at the pro shop.
              </p>
            </>
          ) : (
            <Elements stripe={stripePromise}>
              <WalkUpCheckInForm
                bookingId={bookingId}
                token={token}
                totalAmount={payTotal}
                golferName={info.golferName}
                courseName={info.courseName}
                accent={info.brandColor}
                addCart={addCart}
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

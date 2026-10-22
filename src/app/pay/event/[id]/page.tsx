'use client';
// W2-9b: the organizer pays toward an event (a deposit, the balance, or any
// payment the course sent) on their own phone — Apple Pay / Google Pay where
// the phone has a wallet, a card otherwise. Same pattern as the walk-up sale
// link (/pay/shop/[id]); the charge is a direct charge on the course's account.
import { useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, PaymentRequestButtonElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { Card } from '@/components/ui/Card';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
const cardStyle = { style: { base: { fontSize: '15px', color: '#141814', '::placeholder': { color: '#979B94' } }, invalid: { color: '#A3452F' } } };
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Pay = { status: 'open' | 'paid' | 'void'; eventCancelled: boolean; label: string; amountCents: number; feeCents: number; eventName: string; dateLabel: string; courseName: string; brandColor: string; logoUrl: string; photoUrl: string };

function PayForm({ paymentId, token, pay, onPaid, onError }: { paymentId: string; token: string; pay: Pay; onPaid: () => void; onError: (m: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<PaymentRequest | null>(null);
  const total = pay.amountCents + pay.feeCents;
  const totalRef = useRef(total);

  async function charge(paymentMethodId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/event-payment/${paymentId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, paymentMethodId, expectedTotalCents: totalRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onError(data.error || 'The payment didn’t go through. Try again, or call the course.'); return false; }
      if (data.status === 'processing') { onError('Your bank is still processing this payment. Please don’t pay again — reopen this link in a few minutes.'); return true; }
      onPaid();
      return true;
    } catch {
      onError('Network error — nothing was charged. Check your connection and try again.');
      return false;
    }
  }

  useEffect(() => {
    if (!stripe) return;
    const req = stripe.paymentRequest({ country: 'US', currency: 'usd', total: { label: `${pay.courseName} — ${pay.label}`.slice(0, 60), amount: total }, requestPayerName: true });
    let live = true;
    req.canMakePayment().then(r => { if (live && r) setWallet(req); }).catch(() => {});
    req.on('paymentmethod', async ev => { onError(''); const ok = await charge(ev.paymentMethod.id); ev.complete(ok ? 'success' : 'fail'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  async function payByCard() {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setLoading(true); onError('');
    try {
      const { error, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card });
      if (error) { onError(error.message || 'Card error.'); setLoading(false); return; }
      if (!(await charge(paymentMethod.id))) setLoading(false);
    } catch {
      onError('Something went wrong. Please try again, or call the course.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {wallet && (
        <>
          <PaymentRequestButtonElement options={{ paymentRequest: wallet, style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '48px' } } }} />
          <div className="flex items-center gap-3 text-xs text-ink-muted"><span className="h-px flex-1 bg-line" />or pay with a card<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1.5">Card details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10 transition-all">
          <CardElement options={cardStyle} />
        </div>
      </div>
      <button onClick={payByCard} disabled={loading || !stripe}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-70"
        style={{ backgroundColor: pay.brandColor || '#173B2A' }}>
        {loading ? <><Loader2 size={16} className="animate-spin" /> Paying…</> : `Pay ${usd(total)}`}
      </button>
      <p className="text-center text-xs text-ink-muted">Secure checkout powered by Stripe. The charge comes from {pay.courseName}.</p>
    </div>
  );
}

function PayEventInner() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get('token') ?? '';
  const [pay, setPay] = useState<Pay | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch(`/api/event-payment/${id}?token=${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This pay link is not valid any more.'); return d; })
      .then(setPay)
      .catch((e: Error) => setLoadError(e.message));
  }, [id, token]);

  if (loadError) return <main className="min-h-screen bg-paper flex items-center justify-center px-4"><p className="text-sm text-ink-soft text-center max-w-sm">{loadError}</p></main>;
  if (!pay) return <main className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-faint" aria-label="Loading" /></main>;

  const done = paid || pay.status === 'paid';
  const closed = !done && (pay.status === 'void' || pay.eventCancelled);
  return (
    <main className="min-h-screen bg-paper">
      <CourseHeaderBar courseName={pay.courseName} accent={pay.brandColor} logoUrl={pay.logoUrl} photoUrl={pay.photoUrl} />
      <div className="max-w-md mx-auto px-4 py-8">
        <Card className="p-5">
          <h1 className="font-serif text-[26px] font-semibold text-ink leading-tight">{done ? 'Paid. Thank you!' : closed ? 'This pay link is closed' : pay.eventName}</h1>
          <p className="text-sm text-ink-soft mt-1">{done || closed ? `${pay.eventName} · ${pay.dateLabel}` : pay.dateLabel}</p>
          {closed && <p className="text-sm text-ink-soft mt-2">Nothing was charged. Ask {pay.courseName} if that’s a mistake.</p>}
          <ul className="divide-y divide-line-soft mt-4 text-sm">
            <li className="flex justify-between gap-3 py-2"><span className="text-ink">{pay.label}</span><span className="tabular-nums text-ink">{usd(pay.amountCents)}</span></li>
            {pay.feeCents > 0 && <li className="flex justify-between gap-3 py-2 text-ink-soft"><span>GreenReserve service fee</span><span className="tabular-nums">{usd(pay.feeCents)}</span></li>}
            <li className="flex justify-between gap-3 py-2.5 font-semibold"><span className="text-ink">Total</span><span className="tabular-nums text-ink">{usd(pay.amountCents + pay.feeCents)}</span></li>
          </ul>
          {done && <p className="text-sm text-ink-soft mt-3">The payment went through. You can close this page.</p>}
          {!done && !closed && pay.status === 'open' && (
            <div className="mt-5">
              {error && <p className="mb-3 text-sm text-bad bg-bad/5 border border-bad/20 rounded-md px-3 py-2" role="alert">{error}</p>}
              <Elements stripe={stripePromise}><PayForm paymentId={id} token={token} pay={pay} onPaid={() => setPaid(true)} onError={setError} /></Elements>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

export default function PayEventPage() {
  return <Suspense><PayEventInner /></Suspense>;
}

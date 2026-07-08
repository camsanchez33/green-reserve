'use client';
import { useEffect, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CheckCircle2, Flag, Loader2 } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

type DuesInfo = {
  name: string;
  courseName: string;
  courseLogo: string;
  tierName: string;
  termMonths: number;
  annual: number;
  initiation: number;
  total: number;
  alreadyPaid: boolean;
  expiresAt: string | null;
  stripeReady: boolean;
};

function PayForm({ id, token, info, onPaid }: { id: string; token: string; info: DuesInfo; onPaid: (expiresAt: string | null, amount: number) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    const card = elements.getElement(CardElement);
    if (!card) { setSubmitting(false); return; }

    const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card });
    if (pmError || !paymentMethod) {
      setError(pmError?.message || 'Card details look incomplete.');
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/membership/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, paymentMethodId: paymentMethod.id }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || 'Payment failed.'); return; }
    onPaid(data.expiresAt ?? null, data.amountPaid);
  }

  return (
    <div>
      <div className="border border-line rounded-md px-3 py-3 bg-paper mb-3 focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10 transition-all">
        <CardElement options={{ style: { base: { fontSize: '15px', color: '#1C1C18', '::placeholder': { color: '#98968B' } } } }} />
      </div>
      {error && <p className="text-sm text-bad mb-3">{error}</p>}
      <button
        onClick={pay}
        disabled={submitting || !stripe}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm bg-pine hover:bg-pine-hover disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Processing…' : `Pay $${info.total.toFixed(2)}`}
      </button>
      <p className="text-center text-xs text-ink-muted mt-3">
        Secure payment — goes directly to {info.courseName}.
      </p>
    </div>
  );
}

function MembershipPayInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [info, setInfo] = useState<DuesInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [paid, setPaid] = useState<{ expiresAt: string | null; amount: number } | null>(null);

  useEffect(() => {
    if (!token) { setInvalid(true); return; }
    fetch(`/api/membership/${id}?token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setInfo)
      .catch(() => setInvalid(true));
  }, [id, token]);

  if (invalid) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="text-center">
          <Flag size={40} className="mx-auto mb-4 text-pine" />
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Link Not Valid</h1>
          <p className="text-ink-muted text-sm">This payment link is invalid or expired. Contact your course for a new one.</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  const expiryLabel = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  if (paid || info.alreadyPaid) {
    const exp = paid ? paid.expiresAt : info.expiresAt;
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="bg-white rounded-lg border border-line p-8 max-w-md w-full text-center">
          <CheckCircle2 size={44} className="mx-auto mb-4 text-ok" />
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">
            {paid ? 'Payment received' : 'Already paid'}
          </h1>
          <p className="text-ink-soft text-sm">
            Your <span className="font-medium text-ink">{info.tierName}</span> membership at{' '}
            <span className="font-medium text-ink">{info.courseName}</span> is active
            {expiryLabel(exp) ? <> through <span className="font-medium text-ink">{expiryLabel(exp)}</span></> : null}.
          </p>
          {paid && <p className="text-ink-muted text-xs mt-3">A receipt was emailed to you.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border border-line overflow-hidden">
          <div className="p-6 border-b border-line flex items-center gap-4">
            {info.courseLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.courseLogo} alt="" className="h-12 w-12 rounded-md bg-white object-contain border border-line p-1" />
            )}
            <div>
              <h1 className="font-semibold text-ink text-lg leading-tight">{info.courseName}</h1>
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mt-0.5">Membership dues</p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-sm text-ink-soft mb-5">
              Hi {info.name} — complete your <span className="font-medium text-ink">{info.tierName}</span> membership below.
              Your membership runs {info.termMonths} months from payment.
            </p>

            <div className="bg-paper rounded-md p-4 space-y-1.5 text-sm mb-5 border border-line">
              {info.initiation > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-soft">One-time initiation fee</span>
                  <span className="font-medium text-ink">${info.initiation.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink-soft">{info.tierName} dues</span>
                <span className="font-medium text-ink">${info.annual.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink text-base">
                <span>Total</span>
                <span>${info.total.toFixed(2)}</span>
              </div>
            </div>

            {info.stripeReady ? (
              <Elements stripe={stripePromise}>
                <PayForm id={id} token={token} info={info} onPaid={(expiresAt, amount) => setPaid({ expiresAt, amount })} />
              </Elements>
            ) : (
              <p className="text-sm text-ink-muted text-center py-4">
                Online payment isn&apos;t available yet — please pay at the pro shop.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MembershipPayPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <MembershipPayInner params={params} />
    </Suspense>
  );
}

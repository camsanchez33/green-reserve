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
      <div className="border border-gray-200 rounded-md px-3 py-3 bg-white mb-3">
        <CardElement options={{ style: { base: { fontSize: '15px', color: '#111827', '::placeholder': { color: '#9ca3af' } } } }} />
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <button
        onClick={pay}
        disabled={submitting || !stripe}
        className="w-full py-3.5 rounded-md font-bold text-white text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Processing…' : `Pay $${info.total.toFixed(2)}`}
      </button>
      <p className="text-center text-xs text-gray-400 mt-3">
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
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="text-center">
          <Flag size={40} className="mx-auto mb-4 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Link Not Valid</h1>
          <p className="text-gray-400 text-sm">This payment link is invalid or expired. Contact your course for a new one.</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const expiryLabel = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  if (paid || info.alreadyPaid) {
    const exp = paid ? paid.expiresAt : info.expiresAt;
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8 max-w-md w-full text-center">
          <CheckCircle2 size={44} className="mx-auto mb-4 text-emerald-600" />
          <h1 className="text-2xl font-black text-gray-900 mb-2">
            {paid ? 'Payment received' : 'Already paid'}
          </h1>
          <p className="text-gray-500 text-sm">
            Your <span className="font-semibold">{info.tierName}</span> membership at{' '}
            <span className="font-semibold">{info.courseName}</span> is active
            {expiryLabel(exp) ? <> through <span className="font-semibold">{expiryLabel(exp)}</span></> : null}.
          </p>
          {paid && <p className="text-gray-400 text-xs mt-3">A receipt was emailed to you.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-4">
            {info.courseLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.courseLogo} alt="" className="h-12 w-12 rounded-md bg-white object-contain border border-gray-100 p-1" />
            )}
            <div>
              <h1 className="font-black text-gray-900 text-lg leading-tight">{info.courseName}</h1>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-0.5">Membership dues</p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-sm text-gray-600 mb-5">
              Hi {info.name} — complete your <span className="font-semibold">{info.tierName}</span> membership below.
              Your membership runs {info.termMonths} months from payment.
            </p>

            <div className="bg-[#f8faf9] rounded-md p-4 space-y-1.5 text-sm mb-5">
              {info.initiation > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">One-time initiation fee</span>
                  <span className="font-semibold text-gray-900">${info.initiation.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">{info.tierName} dues</span>
                <span className="font-semibold text-gray-900">${info.annual.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-900 text-base">
                <span>Total</span>
                <span>${info.total.toFixed(2)}</span>
              </div>
            </div>

            {info.stripeReady ? (
              <Elements stripe={stripePromise}>
                <PayForm id={id} token={token} info={info} onPaid={(expiresAt, amount) => setPaid({ expiresAt, amount })} />
              </Elements>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
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
    <Suspense fallback={<div className="min-h-screen bg-[#f8faf9]" />}>
      <MembershipPayInner params={params} />
    </Suspense>
  );
}

'use client';
// MEM-ACCT part 2 (Cam 2026-10-30): a member's monthly account statement — what's on it, and
// paying it by card. On a tier that charges automatically, a separate box (never pre-ticked) lets
// the member have this card charged for later statements; they can turn that off here. Same
// pattern as the dues and pro-shop pay links. Data: /api/statement/[id].
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { Card } from '@/components/ui/Card';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const day = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const month = (p: string) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };

type Info = {
  period: string; totalCents: number; status: 'open' | 'paid'; dueAt: string; paidAt: string | null; autoChargeAt: string | null;
  courseName: string; brandColor: string; logoUrl: string; canPay: boolean;
  offerSaveCard: boolean; cardSaved: boolean; cardTerms: string;
  lines: { at: string; note: string; amountCents: number }[];
};

function PayForm({ id, token, info, onPaid }: { id: string; token: string; info: Info; onPaid: (saved: boolean) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveCard, setSaveCard] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setBusy(true); setError('');
    try {
      const { error: e, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card });
      if (e || !paymentMethod) { setError(e?.message || 'Card error.'); setBusy(false); return; }
      const r = await fetch(`/api/statement/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, paymentMethodId: paymentMethod.id, expectedTotalCents: info.totalCents, saveCard, agree: saveCard }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'The payment didn’t go through — try again.'); setBusy(false); return; }
      onPaid(!!d.cardSaved);
    } catch {
      setError('Network error — nothing was charged. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 mt-5">
      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1.5">Card details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10">
          <CardElement options={{ style: { base: { fontSize: '15px', color: '#141814', '::placeholder': { color: '#979B94' } } } }} />
        </div>
      </div>
      {info.offerSaveCard && !info.cardSaved && (
        <label className="flex items-start gap-2 text-[13px] text-ink"><input type="checkbox" className="mt-0.5" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} />{info.cardTerms}</label>
      )}
      {error && <p className="text-sm text-bad bg-bad/5 border border-bad/20 rounded-md px-3 py-2" role="alert">{error}</p>}
      <button onClick={pay} disabled={busy || !stripe} className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-70" style={{ backgroundColor: info.brandColor || '#173B2A' }}>
        {busy ? 'Paying…' : `Pay ${usd(info.totalCents)}`}
      </button>
      <p className="text-center text-xs text-ink-muted">Secure checkout powered by Stripe. The charge comes from {info.courseName}.</p>
    </div>
  );
}

function StopCard({ id, token }: { id: string; token: string }) {
  const [state, setState] = useState<'on' | 'busy' | 'off' | 'error'>('on');
  async function stop() {
    setState('busy');
    const r = await fetch(`/api/statement/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'stop_card' }) }).catch(() => null);
    setState(r && r.ok ? 'off' : 'error');
  }
  if (state === 'off') return <p className="text-sm text-ink mt-4">Your card won’t be charged for statements any more. You’ll get each one by email to pay.</p>;
  return (
    <div className="mt-4 text-sm text-ink">
      <p>Your saved card is charged for each statement.</p>
      <button onClick={stop} disabled={state === 'busy'} className="mt-2 px-4 py-2 rounded-md border border-line text-ink hover:bg-paper disabled:opacity-50">{state === 'busy' ? 'Turning off…' : 'Stop charging my card'}</button>
      {state === 'error' && <p role="alert" className="text-bad mt-2">That didn’t work — try again, or contact the course.</p>}
    </div>
  );
}

function StatementInner() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get('token') ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState('');
  const [paid, setPaid] = useState<null | { saved: boolean }>(null);

  useEffect(() => {
    fetch(`/api/statement/${id}?token=${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This statement link is not valid.'); return d; })
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message));
  }, [id, token]);

  if (loadError) return <main className="min-h-screen bg-paper flex items-center justify-center px-4"><p className="text-sm text-ink-soft text-center max-w-sm">{loadError}</p></main>;
  if (!info) return <main className="min-h-screen bg-paper flex items-center justify-center"><p className="text-sm text-ink-muted">Loading…</p></main>;
  const done = !!paid || info.status === 'paid';

  return (
    <main className="min-h-screen bg-paper">
      <CourseHeaderBar courseName={info.courseName} accent={info.brandColor} logoUrl={info.logoUrl} />
      <div className="max-w-md mx-auto px-4 py-8">
        <Card className="p-5">
          <h1 className="font-serif text-[26px] font-semibold text-ink leading-tight">{done ? 'Statement paid. Thank you!' : `Your ${month(info.period)} statement`}</h1>
          {!done && <p className="text-sm text-ink mt-1">{info.autoChargeAt ? `Your saved card will be charged on ${day(info.autoChargeAt)}. You can pay now with another card instead.` : `Due by ${day(info.dueAt)}.`}</p>}
          <ul className="divide-y divide-line-soft mt-4 text-sm">
            {info.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 py-2"><span className="text-ink"><span className="text-ink-muted tabular-nums mr-2">{new Date(l.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{l.note}</span><span className="tabular-nums text-ink">{usd(l.amountCents)}</span></li>
            ))}
            <li className="flex justify-between gap-3 py-2.5 font-semibold"><span className="text-ink">Total</span><span className="tabular-nums text-ink">{usd(info.totalCents)}</span></li>
          </ul>
          {done && paid?.saved && <p className="text-sm text-ink mt-3">This card will be charged for your next statements.</p>}
          {!done && info.canPay && <Elements stripe={stripePromise}><PayForm id={id} token={token} info={info} onPaid={saved => setPaid({ saved })} /></Elements>}
          {!done && !info.canPay && <p className="text-sm text-ink mt-4">This course can’t take card payments yet — please pay at the course.</p>}
          {info.cardSaved && !paid && <StopCard id={id} token={token} />}
        </Card>
      </div>
    </main>
  );
}

export default function StatementPage() {
  return <Suspense><StatementInner /></Suspense>;
}

'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, ChevronRight, Loader2, CreditCard, Plus, Trash2, AlertCircle } from 'lucide-react';

const STEPS = ['Course Details', 'Connect Payments', 'Go Live'];

type TeeSet = { id: string; name: string; yardage: string; rating: string; slope: string };

const blankTeeSet = (): TeeSet => ({ id: Math.random().toString(36).slice(2), name: '', yardage: '', rating: '', slope: '' });

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Course details — identity (name/address/phone/etc) is already collected
  // via the inquiry + setup sheet by this point, so step 1 is just play details.
  const [details, setDetails] = useState({ description: '', holes: 18, par: 72 });
  const [teeSets, setTeeSets] = useState<TeeSet[]>([blankTeeSet()]);

  // Stripe Connect status
  const [stripeActive, setStripeActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stripeBanner, setStripeBanner] = useState('');

  useEffect(() => {
    const stripeParam = params.get('stripe');
    if (stripeParam === 'success') setStripeBanner('connected');
    else if (stripeParam === 'pending') setStripeBanner('pending');
    else if (stripeParam === 'error' || stripeParam === 'refresh') setStripeBanner('error');
  }, [params]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => {
      if (r.status === 401) { router.push('/dashboard/login'); return null; }
      return r.json();
    }).then(data => {
      if (!data) return;
      if (!data.emailVerified) { router.push('/dashboard/verify'); return; }
      if (data.onboardingStep >= 3) { router.push('/dashboard'); return; }
      setStep(data.onboardingStep >= 2 ? 2 : 1);
      setLoading(false);
    });
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (!c) return;
      setDetails(d => ({ ...d, description: c.description ?? '', holes: c.holes ?? 18, par: c.par ?? 72 }));
      setStripeActive(!!c.stripeAccountActive);
    });
    fetch('/api/operator/tee-sets').then(r => r.json()).then(rows => {
      if (Array.isArray(rows) && rows.length > 0) {
        setTeeSets(rows.map((r: { id: string; name: string; yardage: number; rating: number; slope: number }) => ({
          id: r.id, name: r.name, yardage: String(r.yardage || ''), rating: String(r.rating || ''), slope: String(r.slope || ''),
        })));
      }
    });
  }, [router]);

  const set = (k: keyof typeof details, v: string | number) => setDetails(d => ({ ...d, [k]: v }));
  const setTee = (id: string, k: keyof TeeSet, v: string) => setTeeSets(ts => ts.map(t => t.id === id ? { ...t, [k]: v } : t));
  const addTee = () => setTeeSets(ts => [...ts, blankTeeSet()]);
  const removeTee = (id: string) => setTeeSets(ts => ts.filter(t => t.id !== id));

  const saveDetails = async () => {
    setSaving(true);
    await fetch('/api/operator/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    await fetch('/api/operator/tee-sets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teeSets: teeSets.filter(t => t.name.trim()) }),
    });
    setSaving(false);
    setStep(2);
  };

  const connectStripe = async () => {
    setConnecting(true);
    const r = await fetch('/api/operator/stripe/connect?from=onboarding');
    const d = await r.json();
    setConnecting(false);
    if (d.url) window.location.href = d.url;
    else setStripeBanner('error');
  };

  const finishOnboarding = async () => {
    setSaving(true);
    await fetch('/api/operator/onboarding-complete', { method: 'POST' });
    setSaving(false);
    setStep(3);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>
  );

  const isConnected = stripeActive || stripeBanner === 'connected';

  return (
    <div className="min-h-screen bg-[#0a1f0f] p-4">
      <div className="max-w-xl mx-auto pt-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-white font-black text-2xl tracking-tight">Green<span className="text-green-400">Reserve</span></span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${i + 1 <= step ? 'text-green-400' : 'text-white/30'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                  i + 1 < step ? 'bg-green-500 border-green-500 text-white' :
                  i + 1 === step ? 'border-green-400 text-green-400' :
                  'border-white/20 text-white/30'
                }`}>
                  {i + 1 < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-white/20" />}
            </div>
          ))}
        </div>

        {/* Step 1 — Course Details (play details only — identity already on file) */}
        {step === 1 && (
          <div className="bg-white rounded-lg p-6 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-1">A few details about the course itself</h2>
            <p className="text-gray-500 text-sm mb-6">Your contact info and address are already on file from your setup sheet. This is just the playing details.</p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description <span className="font-normal text-gray-400">(optional)</span></label>
                <textarea value={details.description} onChange={e => set('description', e.target.value)}
                  rows={3} placeholder="Tell golfers what makes your course special..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Holes</label>
                  <input type="number" value={details.holes} onChange={e => set('holes', Number(e.target.value))}
                    placeholder="18"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-400 mt-1">Enter whatever you actually have — 9, 18, 27, 36, etc.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Par</label>
                  <input type="number" value={details.par} onChange={e => set('par', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tee sets <span className="font-normal text-gray-400">(optional)</span></label>
                  <button onClick={addTee} className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add tee</button>
                </div>
                <p className="text-xs text-gray-400 mb-3">If you have multiple tee boxes (Black, Blue, White, Red...) with different yardage, list them here. Leave blank if you just want one overall yardage.</p>
                <div className="space-y-2">
                  {teeSets.map(t => (
                    <div key={t.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                      <input value={t.name} onChange={e => setTee(t.id, 'name', e.target.value)} placeholder="Black" className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                      <input type="number" value={t.yardage} onChange={e => setTee(t.id, 'yardage', e.target.value)} placeholder="Yardage" className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                      <input type="number" step="0.1" value={t.rating} onChange={e => setTee(t.id, 'rating', e.target.value)} placeholder="Rating" className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                      <input type="number" value={t.slope} onChange={e => setTee(t.id, 'slope', e.target.value)} placeholder="Slope" className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                      <button onClick={() => removeTee(t.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={saveDetails} disabled={saving}
              className="w-full mt-6 bg-green-600 text-white py-3.5 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Continue <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        )}

        {/* Step 2 — Connect Payments */}
        {step === 2 && (
          <div className="bg-white rounded-lg p-6 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-600" /> Connect your payments
            </h2>
            <p className="text-gray-500 text-sm mb-6">Golfers pay through Stripe at checkout — green fees go straight to your bank account. This is required before you can go live.</p>

            {isConnected ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-5 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-green-800">Stripe connected</div>
                  <div className="text-sm text-green-700">You&apos;re all set to accept payments. You can manage this anytime from Settings → Payments.</div>
                </div>
              </div>
            ) : (
              <>
                {stripeBanner === 'pending' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-start gap-2 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> Stripe said your account isn&apos;t fully verified yet — you may need to finish a step on their end. Try connecting again.
                  </div>
                )}
                {stripeBanner === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> Something interrupted the connection. Try again.
                  </div>
                )}
                <button onClick={connectStripe} disabled={connecting}
                  className="w-full bg-[#635bff] text-white py-3.5 rounded-lg font-bold hover:bg-[#564fe0] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : 'Connect with Stripe'}
                </button>
                <p className="text-xs text-gray-400 mt-2 text-center">You&apos;ll be redirected to Stripe to verify your bank details, then brought back here.</p>
              </>
            )}

            <button onClick={finishOnboarding} disabled={saving || !isConnected}
              className="w-full mt-4 bg-green-600 text-white py-3.5 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Finishing...</> : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="bg-white rounded-lg p-10 shadow-2xl text-center">
            <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-gray-900 mb-2">Setup complete!</h2>
            <p className="text-gray-500 mb-2">Your course details are saved and payments are connected. GreenReserve will review everything and take your course live — usually within 1 business day.</p>
            <p className="text-sm text-gray-400 mb-6">We&apos;ll email you a full walkthrough of your dashboard once you&apos;re live.</p>
            <button onClick={() => router.push('/dashboard')}
              className="w-full bg-green-600 text-white py-3.5 rounded-lg font-bold hover:bg-green-700">
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a1f0f]" />}>
      <OnboardingInner />
    </Suspense>
  );
}

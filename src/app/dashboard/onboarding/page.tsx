'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle, ChevronRight, Loader2, CreditCard, Plus, Trash2, AlertCircle } from 'lucide-react';

const STEPS = ['Course Details', 'Connect Payments', 'Go Live'];

type TeeSet = { id: string; name: string; yardage: string; rating: string; slope: string };
const blankTeeSet = (): TeeSet => ({ id: Math.random().toString(36).slice(2), name: '', yardage: '', rating: '', slope: '' });

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState({ description: '', holes: 18, par: 72 });
  const [teeSets, setTeeSets] = useState<TeeSet[]>([blankTeeSet()]);
  const [stripeActive, setStripeActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stripeBanner, setStripeBanner] = useState('');
  const [noFeePolicy, setNoFeePolicy] = useState(false);

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
      setNoFeePolicy(!c.lateCancellationFee);
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
    await fetch('/api/operator/courses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) });
    await fetch('/api/operator/tee-sets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teeSets: teeSets.filter(t => t.name.trim()) }) });
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
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-pine animate-spin"/>
    </div>
  );

  const isConnected = stripeActive || stripeBanner === 'connected';

  return (
    <div className="min-h-screen bg-paper p-4">
      <div className="max-w-xl mx-auto pt-10">

        {/* Wordmark */}
        <div className="text-center mb-8">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={300} height={150} priority className="w-[300px] max-w-full h-auto mx-auto" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={'flex items-center gap-1.5 ' + (i + 1 <= step ? 'text-pine' : 'text-ink-faint')}>
                <div className={'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ' + (
                  i + 1 < step  ? 'bg-pine border-pine text-white' :
                  i + 1 === step ? 'border-pine text-pine' :
                  'border-line text-ink-faint'
                )}>
                  {i + 1 < step ? <CheckCircle className="w-3.5 h-3.5"/> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-line-strong"/>}
            </div>
          ))}
        </div>

        {/* Step 1 — Course Details */}
        {step === 1 && (
          <div className="bg-white border border-line rounded-lg p-6">
            <h2 className="text-[20px] font-serif font-medium text-ink mb-1">A few details about the course</h2>
            <p className="text-sm text-ink-soft mb-6">Your contact info and address are already on file from your setup sheet. This is just the playing details.</p>

            <div className="space-y-5">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Description <span className="normal-case text-ink-faint">(optional)</span></label>
                <textarea value={details.description} onChange={e => set('description', e.target.value)}
                  rows={3} placeholder="Tell golfers what makes your course special..."
                  className={iCls + ' resize-none'}/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Holes</label>
                  <input type="number" value={details.holes} onChange={e => set('holes', Number(e.target.value))} placeholder="18" className={iCls}/>
                  <p className="text-xs text-ink-faint mt-1">9, 18, 27, 36, etc.</p>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Par</label>
                  <input type="number" value={details.par} onChange={e => set('par', Number(e.target.value))} className={iCls}/>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted">Tee Sets <span className="normal-case text-ink-faint">(optional)</span></label>
                  <button onClick={addTee} className="text-xs font-medium text-pine hover:text-pine-hover flex items-center gap-1 transition-colors">
                    <Plus className="w-3.5 h-3.5"/>Add tee
                  </button>
                </div>
                <p className="text-xs text-ink-faint mb-3">List your tee boxes (Black, Blue, White, Red…) with yardage, rating, and slope. Leave blank to skip.</p>
                <div className="space-y-2">
                  {teeSets.map(t => (
                    <div key={t.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                      <input value={t.name} onChange={e => setTee(t.id, 'name', e.target.value)} placeholder="Black" className={iCls}/>
                      <input type="number" value={t.yardage} onChange={e => setTee(t.id, 'yardage', e.target.value)} placeholder="Yds" className={iCls}/>
                      <input type="number" step="0.1" value={t.rating} onChange={e => setTee(t.id, 'rating', e.target.value)} placeholder="Rating" className={iCls}/>
                      <input type="number" value={t.slope} onChange={e => setTee(t.id, 'slope', e.target.value)} placeholder="Slope" className={iCls}/>
                      <button onClick={() => removeTee(t.id)} className="text-ink-faint hover:text-bad p-1 transition-colors"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={saveDetails} disabled={saving}
              className="w-full mt-6 bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin"/>Saving...</> : <>Continue<ChevronRight className="w-4 h-4"/></>}
            </button>
          </div>
        )}

        {/* Step 2 — Connect Payments */}
        {step === 2 && (
          <div className="bg-white border border-line rounded-lg p-6">
            <h2 className="text-[20px] font-serif font-medium text-ink mb-1 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-pine"/>Connect your payments
            </h2>
            <p className="text-sm text-ink-soft mb-6">
              {noFeePolicy
                ? "Golfers pay through Stripe at checkout — green fees go straight to your bank account. Since you don't charge cancellation fees, this is optional and you can set it up anytime from Settings → Payments."
                : 'Golfers pay through Stripe at checkout — green fees go straight to your bank account. Required before you can go live.'}
            </p>

            {isConnected ? (
              <div className="bg-ok/5 border border-ok/20 rounded-md p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-ok mt-0.5 shrink-0"/>
                <div>
                  <div className="font-medium text-ok">Stripe connected</div>
                  <div className="text-sm text-ink-soft mt-0.5">You&apos;re all set to accept payments. Manage anytime from Settings → Payments.</div>
                </div>
              </div>
            ) : (
              <>
                {stripeBanner === 'pending' && (
                  <div className="bg-warn/5 border border-warn/20 rounded-md p-4 mb-4 flex items-start gap-2 text-sm text-warn">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>Stripe says your account isn&apos;t fully verified yet — you may need to finish a step on their end. Try connecting again.
                  </div>
                )}
                {stripeBanner === 'error' && (
                  <div className="bg-bad/5 border border-bad/20 rounded-md p-4 mb-4 flex items-start gap-2 text-sm text-bad">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>Something interrupted the connection. Try again.
                  </div>
                )}
                <button onClick={connectStripe} disabled={connecting}
                  className="w-full bg-[#635bff] hover:bg-[#564fe0] text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {connecting ? <><Loader2 className="w-4 h-4 animate-spin"/>Connecting...</> : 'Connect with Stripe'}
                </button>
                <p className="text-xs text-ink-faint mt-2 text-center">You&apos;ll be redirected to Stripe to verify your bank details, then brought back here.</p>
              </>
            )}

            <button onClick={finishOnboarding} disabled={saving || (!isConnected && !noFeePolicy)}
              className="w-full mt-4 bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 disabled:bg-line-strong transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin"/>Finishing...</> : (!isConnected && noFeePolicy) ? "Skip for now — I'll do this later" : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="bg-white border border-line rounded-lg p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-ok/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-7 h-7 text-ok"/>
            </div>
            <h2 className="text-[22px] font-serif font-medium text-ink mb-2">Setup complete</h2>
            <p className="text-sm text-ink-soft mb-2">Your course details are saved and payments are connected. GreenReserve will review everything and take your course live — usually within 1 business day.</p>
            <p className="text-xs text-ink-muted mb-6">We&apos;ll email you a full walkthrough of your dashboard once you&apos;re live.</p>
            <button onClick={() => router.push('/dashboard')}
              className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] transition-colors">
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper"/>}>
      <OnboardingInner/>
    </Suspense>
  );
}

'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2, ExternalLink } from 'lucide-react';
import SignAgreements from '@/components/dashboard/SignAgreements';
import { StatusDot } from '@/components/ui/StatusDot';
import { CHANGE_CATEGORIES } from '@/lib/change-requests';

// AG-2: the single agreement checkbox became its own step — legal name,
// signer, and each document read to the end before it can be ticked.
// Cam 2026-10-27: step 1 is reviewing the golfer-facing page (approve it or ask
// for changes). It used to re-ask holes, par and tee sets — all already on the
// setup sheet, and still editable in Settings.
const STEPS = ['Review your page', 'Sign', 'Connect payments', 'Go live'];

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageStatus, setPageStatus] = useState<'none' | 'approved' | 'changes_requested'>('none');
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState('');
  const [openError, setOpenError] = useState('');
  const [asking, setAsking] = useState(false);
  const [changeCats, setChangeCats] = useState<Set<string>>(new Set());
  const [changeNote, setChangeNote] = useState('');
  const [stripeActive, setStripeActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stripeBanner, setStripeBanner] = useState('');
  // AG-2: which step to resume on depends on the profile AND whether the
  // agreements are signed; both load before the page decides.
  const [profileStep, setProfileStep] = useState<number | null>(null);
  const [signedAll, setSignedAll] = useState<boolean | null>(null);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [finishError, setFinishError] = useState('');

  useEffect(() => {
    const stripeParam = params.get('stripe');
    if (stripeParam === 'success') setStripeBanner('connected');
    else if (stripeParam === 'pending') setStripeBanner('pending');
    else if (stripeParam === 'error' || stripeParam === 'refresh') setStripeBanner('error');
  }, [params]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => {
      if (r.status === 401) { router.push('/dashboard/login'); return null; }
      if (!r.ok) { setLoadError(`Could not load your account (${r.status}).`); return null; }
      return r.json();
    }).then(data => {
      if (!data) return;
      if (!data.emailVerified) { router.push('/dashboard/verify'); return; }
      if (data.onboardingStep >= 3) { router.push('/dashboard'); return; }
      setProfileStep(data.onboardingStep);
    }).catch(() => setLoadError('Network error loading your account.')); // SD-10: was a spinner forever
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (!c) return;
      setStripeActive(!!c.stripeAccountActive);
      if (c.pageApprovalStatus === 'approved' || c.pageApprovalStatus === 'changes_requested') setPageStatus(c.pageApprovalStatus);
    }).catch(() => setLoadError('Network error loading your course — reload the page.'));
    fetch('/api/operator/sign?status=1').then(r => r.ok ? r.json() : null).then(d => {
      const st = d?.status;
      setSignedAll(st ? st.total === 0 || st.signed === st.total : false);
    }).catch(() => setSignedAll(false));
  }, [router]);

  useEffect(() => {
    if (profileStep === null || signedAll === null) return;
    setStep(profileStep >= 2 ? (signedAll ? 3 : 2) : 1);
    setLoading(false);
  }, [profileStep, signedAll]);

  // Opens the course's own preview (the same link as the dashboard's "View your page").
  // The tab opens inside the click so a pop-up blocker allows it.
  const openPage = async () => {
    setOpenError(''); setBlockedUrl(''); setOpening(true);
    const tab = window.open('', '_blank');
    try {
      const r = await fetch('/api/operator/preview-link');
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      if (r.ok && typeof d.url === 'string') { // Pop-up blocked: show the link here rather than leaving onboarding.
        if (tab) tab.location.href = d.url; else setBlockedUrl(d.url); setOpened(true); return; }
      tab?.close(); setOpenError(String(d.error || `Couldn’t open your page (${r.status}) — try again.`));
    } catch { tab?.close(); setOpenError('Couldn’t reach the server — check your connection and try again.'); }
    finally { setOpening(false); }
  };

  // Step 1 done → step 2 (the endpoint bumps onboardingStep, so a reload resumes at Sign).
  const advance = async () => {
    const r = await fetch('/api/operator/profile', { method: 'PATCH' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Could not save your progress (${r.status}).`); }
    setStep(signedAll ? 3 : 2);
  };

  const decide = async (decision: 'approve' | 'changes' | 'later') => {
    setSaving(true); setSaveError('');
    try {
      if (decision === 'approve') {
        const r = await fetch('/api/operator/approve-page', { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Could not record your approval (${r.status}).`);
        setPageStatus('approved');
      } else if (decision === 'changes') {
        if (changeCats.size === 0) throw new Error('Pick what needs changing.');
        // The note rides on the first category only, so the admin thread doesn't repeat it per category.
        const items = [...changeCats].map((category, i) => ({ category, detail: i === 0 ? changeNote : '' }));
        const r = await fetch('/api/operator/request-changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Could not send your changes (${r.status}).`);
        setPageStatus('changes_requested');
      }
      await advance();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setSaving(false);
    }
  };

  const connectStripe = async () => {
    setConnecting(true);
    try {
      const r = await fetch('/api/operator/stripe/connect?from=onboarding');
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setStripeBanner('error');
    } catch {
      setStripeBanner('error'); // SD-10: was "Connecting..." forever
    } finally {
      setConnecting(false);
    }
  };

  const finishOnboarding = async () => {
    setSaving(true); setFinishError('');
    try {
      const r = await fetch('/api/operator/onboarding-complete', { method: 'POST' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setFinishError(d.error || `Could not finish setup (${r.status}) — try again.`); return; }
      setStep(4);
    } catch {
      setFinishError('Network error — try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white border border-bad/20 rounded-lg px-6 py-5 max-w-sm text-center">
        <p className="text-sm text-bad mb-4">{loadError}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-colors">Reload</button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-pine animate-spin"/>
    </div>
  );

  const isConnected = stripeActive || stripeBanner === 'connected';

  const todo = [
    pageStatus === 'changes_requested' ? 'approve your updated page once we send it' : pageStatus !== 'approved' ? 'approve your booking page' : '',
    !isConnected ? 'connect Stripe' : '',
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-paper p-4">
      <div className="max-w-xl mx-auto pt-10">

        {/* Wordmark */}
        <div className="text-center mb-8">
          <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
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
                  {i + 1 < step ? <StatusDot status="ok" /> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:block">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Step 1 — Review your page (Cam 2026-10-27) */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow-card p-6">
            <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-2">Review your booking page</h2>
            <p className="text-sm text-ink mb-5">This is what golfers will see. Check your prices, tee times, photos and policies, then approve it or tell us what to change. Booking is off until you go live.</p>

            <button onClick={openPage} disabled={opening}
              className="w-full flex items-center justify-center gap-2 bg-white border border-line hover:border-pine/40 text-ink py-3 rounded-md font-medium text-[13px] transition-colors">
              {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <>Open your page <ExternalLink className="w-3.5 h-3.5" aria-hidden /></>}
            </button>
            {blockedUrl && <p className="text-sm text-ink mt-2">Your browser blocked the new tab. <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="text-pine underline">Open your page here</a>.</p>}
            {openError && <p role="alert" className="text-sm text-bad mt-2">{openError}</p>}

            {pageStatus !== 'none' ? (
              <div className="mt-5">
                <StatusDot status={pageStatus === 'approved' ? 'ok' : 'warn'} label={pageStatus === 'approved' ? 'You approved this page.' : 'You asked for changes — we’ll email you when they’re made.'} />
              </div>
            ) : asking ? (
              <div className="mt-5 space-y-3">
                <p className="text-[13px] font-semibold text-ink">What needs changing?</p>
                <div className="grid grid-cols-2 gap-2">
                  {CHANGE_CATEGORIES.map(c => (
                    <label key={c.key} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                      <input type="checkbox" className="accent-pine" checked={changeCats.has(c.key)}
                        onChange={() => setChangeCats(prev => { const n = new Set(prev); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />
                      {c.label}
                    </label>
                  ))}
                </div>
                <textarea value={changeNote} onChange={e => setChangeNote(e.target.value)} rows={3} maxLength={1000}
                  placeholder="Tell us what to change" className={iCls + ' resize-none'} />
              </div>
            ) : null}

            {saveError && <p role="alert" className="text-sm text-bad mt-4">{saveError}</p>}

            {pageStatus !== 'none' ? (
              <button onClick={() => decide('later')} disabled={saving}
                className="w-full mt-5 bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Continue'}
              </button>
            ) : asking ? (
              <div className="mt-5 flex gap-2">
                <button onClick={() => { setAsking(false); setSaveError(''); }} disabled={saving}
                  className="px-4 py-3 rounded-md border border-line text-ink text-[13px] font-medium hover:border-pine/40 disabled:opacity-50 transition-colors">Back</button>
                <button onClick={() => decide('changes')} disabled={saving}
                  className="flex-1 bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors">
                  {saving ? 'Sending…' : 'Send my changes'}
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => { setAsking(true); setSaveError(''); }} disabled={saving}
                    className="py-3 rounded-md border border-line text-ink text-[13px] font-medium hover:border-pine/40 disabled:opacity-50 transition-colors">Something needs changing</button>
                  <button onClick={() => decide('approve')} disabled={saving || !opened}
                    title={opened ? undefined : 'Open your page first'}
                    className="bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors">
                    {saving ? 'Saving…' : 'Looks good — approve it'}
                  </button>
                </div>
                {!opened && <p className="text-xs text-ink-soft mt-2 text-center">Open your page first to approve it.</p>}
                <button onClick={() => decide('later')} disabled={saving}
                  className="w-full mt-3 text-[13px] text-ink-muted hover:text-ink transition-colors">I&apos;ll review it later</button>
              </>
            )}
          </div>
        )}
        {/* Step 2 — Sign (AG-2) */}
        {step === 2 && (
          <div className="bg-white rounded-lg shadow-card p-6">
            <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-1 flex items-center gap-2">
              Sign the agreements
            </h2>
            <p className="text-sm text-ink-soft mb-6">The terms every course on GreenReserve operates under. Read each one to the end, then sign once — signed copies are emailed to you.</p>
            <SignAgreements onSigned={() => { setSignedAll(true); setStep(3); }} />
          </div>
        )}

        {/* Step 3 — Connect Payments */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow-card p-6">
            <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-1 flex items-center gap-2">
              Connect your payments
            </h2>
            <p className="text-sm text-ink-soft mb-6">
              Golfers pay through Stripe at checkout — green fees go straight to your bank account. You can explore the rest of your dashboard without connecting, but it&apos;s required before your course can go live.
            </p>

            {isConnected ? (
              <div className="bg-ok/5 border border-ok/20 rounded-md p-4 flex items-start gap-3">
                <StatusDot status="ok" />
                <div>
                  <div className="font-medium text-ok">Stripe connected</div>
                  <div className="text-sm text-ink-soft mt-0.5">You&apos;re all set to accept payments. Manage anytime from Settings → Payments.</div>
                </div>
              </div>
            ) : (
              <>
                {stripeBanner === 'pending' && (
                  <div className="bg-warn/5 border border-warn/20 rounded-md p-4 mb-4 flex items-start gap-2 text-sm text-warn">
                    <StatusDot status="bad" />Stripe says your account isn&apos;t fully verified yet — you may need to finish a step on their end. Try connecting again.
                  </div>
                )}
                {stripeBanner === 'error' && (
                  <div className="bg-bad/5 border border-bad/20 rounded-md p-4 mb-4 flex items-start gap-2 text-sm text-bad">
                    <StatusDot status="bad" />Something interrupted the connection. Try again.
                  </div>
                )}
                <button onClick={connectStripe} disabled={connecting}
                  className="w-full bg-[#635bff] hover:bg-[#564fe0] text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {connecting ? <><Loader2 className="w-4 h-4 animate-spin"/>Connecting...</> : 'Connect with Stripe'}
                </button>
                <p className="text-xs text-ink-soft mt-2 text-center">You&apos;ll be redirected to Stripe to verify your bank details, then brought back here.</p>
              </>
            )}

            {/* STRIPE RULE FINAL (RUN_QUEUE) — fully skippable pre-live,
                regardless of fee policy. Required only at actual go-live
                time (enforced server-side in go-live-preflight.ts). */}
            {finishError && <p className="text-sm text-bad mb-3">{finishError}</p>}
            <button onClick={finishOnboarding} disabled={saving}
              className="w-full mt-4 bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 disabled:bg-line-strong transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin"/>Finishing...</> : !isConnected ? "Skip for now — I'll do this later" : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 4 — Done */}
        {step === 4 && (
          <div className="bg-white rounded-lg shadow-card p-10 text-center">
            <h2 className="text-[30px] font-serif font-semibold leading-none text-ink mb-2">Setup complete</h2>
            <p className="text-sm text-ink mb-2">{pageStatus === 'approved' && isConnected
              ? 'Your page is approved and payments are connected. GreenReserve will check everything and take your course live — usually within 1 business day.'
              : `Before your course goes live: ${todo.join(' and ')}. Your dashboard’s checklist has ${todo.length === 1 ? 'it' : 'both'}.`}</p>
            <p className="text-xs text-ink-soft mb-6">We&apos;ll email you a full walkthrough of your dashboard once you&apos;re live.</p>
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

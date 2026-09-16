'use client';
// SD-8 — the Stripe card, moved here out of Settings. Getting paid is money,
// not configuration, and an operator looking for "where is my money" was
// being sent to a settings sub-tab.
import { useState } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ACCESS_FEE_PER_PLAYER } from '@/lib/booking-fees';
import type { MoneyCourse } from './types';

export function PayoutsPanel({ course, stripeParam, onConnected }: {
  course: MoneyCourse;
  /** ?stripe=pending|error, set by the Connect return URL. */
  stripeParam: string | null;
  onConnected: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [stripeError, setStripeError] = useState('');

  async function connectStripe() {
    setConnecting(true); setStripeError('');
    try {
      const res = await fetch('/api/operator/stripe/connect');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStripeError(data.error || 'Could not start Stripe Connect.'); setConnecting(false); return; }
      if (data.url) { window.location.href = data.url; return; }
      if (data.connected) onConnected();
    } catch { setStripeError('Could not reach Stripe. Try again.'); }
    setConnecting(false);
  }

  async function openStripeDashboard() {
    setOpeningDashboard(true); setStripeError('');
    try {
      const res = await fetch('/api/operator/stripe/dashboard-link', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) window.open(data.url, '_blank', 'noopener');
      else setStripeError(data.error || 'Could not open the Stripe dashboard.');
    } catch { setStripeError('Could not reach Stripe. Try again.'); }
    setOpeningDashboard(false);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-4">Payouts (Stripe)</div>
        <div className="space-y-4">
          {stripeParam === 'pending' && (
            <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-md p-3 text-warn text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>
              Stripe says your account isn&apos;t fully verified yet. Finish any remaining steps on Stripe, or click Connect again to pick back up.
            </div>
          )}
          {stripeParam === 'error' && (
            <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 text-bad text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>
              Something went wrong connecting to Stripe. Try again below.
            </div>
          )}
          {stripeError && (
            <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 text-bad text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>
              {stripeError}
            </div>
          )}

          {course.stripeAccountActive ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-ok/5 border border-ok/20 rounded-md p-4">
                <CheckCircle2 className="w-6 h-6 text-ok shrink-0"/>
                <div>
                  <div className="font-medium text-ok text-sm">Stripe connected</div>
                  <div className="text-xs text-ink-soft mt-0.5">Charges and payouts are enabled. Green fees go straight to your bank account.</div>
                </div>
              </div>
              <button onClick={openStripeDashboard} disabled={openingDashboard}
                className="flex items-center justify-center gap-2 w-full bg-paper border border-line hover:border-line-strong text-ink-soft py-2.5 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
                {openingDashboard ? <><Loader2 className="w-4 h-4 animate-spin"/>Opening...</> : 'View payouts & balance →'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft">Connect your bank account through Stripe so you can get paid for bookings. This takes about 5 minutes — you&apos;ll need your business/bank details. GreenReserve can&apos;t take your course live until this is connected.</p>
              <button onClick={connectStripe} disabled={connecting}
                className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
                {connecting ? <><Loader2 className="w-4 h-4 animate-spin"/>Connecting...</> : <><CreditCard className="w-4 h-4"/>Connect with Stripe</>}
              </button>
            </div>
          )}

          <div className="text-xs text-ink-faint pt-2 border-t border-line-soft">
            Status: <span className="font-medium text-ink-muted capitalize">{course.liveStatus || 'draft'}</span>
            {course.liveStatus !== 'live' && course.stripeAccountActive ? ' — Stripe is connected. GreenReserve will review and take you live shortly.' : ''}
          </div>
        </div>
      </div>

      {/* SD-8: the one number every operator asks about, written down where the
          money lives instead of only in the onboarding email. */}
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-3">What GreenReserve takes</div>
        <p className="text-[13.5px] text-ink-soft">
          <span className="font-medium text-ink">${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player</span>, charged to the <span className="font-medium text-ink">golfer</span> on top of your price, in the same card payment as your green fee. You keep 100% of your green and cart fees. Stripe&apos;s normal card-processing fee applies to the payment, like any card you take; GreenReserve charges you nothing on top of it.
        </p>
      </div>
    </div>
  );
}

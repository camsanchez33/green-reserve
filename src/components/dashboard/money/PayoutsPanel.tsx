'use client';
// SD-8 — the Stripe card, moved here out of Settings. Getting paid is money,
// not configuration, and an operator looking for "where is my money" was
// being sent to a settings sub-tab.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PayoutsTable } from './PayoutsTable';
import { ACCESS_FEE_PER_PLAYER } from '@/lib/booking-fees';
import type { MoneyCourse } from './types';
import { StatusDot } from '@/components/ui/StatusDot';

export function PayoutsPanel({ course, stripeParam, onConnected, canConnect }: {
  course: MoneyCourse;
  /** R-AUTH-007: connecting Stripe is the owner's alone (STAFF_FORBIDDEN) — staff see who does it instead. */
  canConnect: boolean;
  /** ?stripe=success|pending|refresh|error, set by the Stripe return URL. */
  stripeParam: string | null;
  onConnected: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
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

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg shadow-card p-5">
        
        <div className="space-y-4">
          {/* SD-8 review: Stripe returns four states and only two were spoken
              for — someone who abandoned onboarding mid-flow ('refresh') or
              finished it ('success') landed here with no acknowledgement at
              all, which reads as "nothing happened". */}
          {stripeParam === 'success' && (
            <div className="flex items-start gap-2 bg-ok/5 border border-ok/20 rounded-md p-3 text-ok text-sm">
              <StatusDot status="ok" />
              Stripe is connected. Payouts are enabled — green fees go straight to your bank account.
            </div>
          )}
          {stripeParam === 'pending' && (
            <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-md p-3 text-warn text-sm">
              <StatusDot status="bad" />
              Stripe says your account isn&apos;t fully verified yet. Finish any remaining steps on Stripe, or click Connect again to pick back up.
            </div>
          )}
          {stripeParam === 'refresh' && (
            <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-md p-3 text-warn text-sm">
              <StatusDot status="bad" />
              That Stripe link expired before you finished. Nothing was lost — click Connect to pick up where you left off.
            </div>
          )}
          {stripeParam === 'error' && (
            <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 text-bad text-sm">
              <StatusDot status="bad" />
              Something went wrong connecting to Stripe. Try again below.
            </div>
          )}
          {stripeError && (
            <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 text-bad text-sm">
              <StatusDot status="bad" />
              {stripeError}
            </div>
          )}

          {course.stripeAccountActive ? <PayoutsTable /> : (
            <div className="space-y-3">
              <p className="text-[13.5px] text-ink">Connect your bank account through Stripe so card payments reach you. You&apos;ll need your business and bank details. GreenReserve can&apos;t take your course live until this is connected.</p>
              {canConnect ? (
                <button onClick={connectStripe} disabled={connecting}
                  className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors">
                  {connecting ? <><Loader2 className="w-4 h-4 animate-spin"/>Connecting...</> : 'Connect with Stripe'}
                </button>
              ) : (
                <p className="text-[13.5px] text-ink">The course owner connects Stripe from their own login.</p>
              )}
              {course.liveStatus !== 'live' && <p className="text-[12.5px] text-ink-muted">Course status: <span className="capitalize">{course.liveStatus || 'draft'}</span></p>}
            </div>
          )}
        </div>
      </div>

      {/* Cam 2026-10-19: keep the GreenReserve note, cleaner. Sentences only from legal/LQ-2_FEE_COPY.md's allowed list. */}
      <div className="bg-white rounded-lg shadow-card px-5 py-4">
        <h3 className="text-[15px] font-semibold text-ink">GreenReserve&apos;s fee</h3>
        <p className="text-[13.5px] text-ink mt-1.5 leading-relaxed">
          Golfers pay ${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player on each online booking, added to your price. Your green fee and our fee are collected in one card payment to your own Stripe account; our ${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player is then passed to GreenReserve. Stripe&apos;s standard card-processing fee applies to the payment, the same as any card you take today. GreenReserve charges you nothing on top of it.
        </p>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, Circle, ChevronRight, ChevronDown, Eye, CreditCard, Clock, Loader2 } from 'lucide-react';
import { CORE_TABS, LOOK_AROUND_THRESHOLD, getVisitedTabs } from '@/lib/dashboard-visits';

interface Step {
  key: string;
  title: string;
  blurb: string;
  done: boolean;
  action?: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean };
}

interface Props {
  emailVerified: boolean;
  onboardingStep: number;
  courseDraft: boolean;
  pageApprovalStatus: 'none' | 'approved' | 'changes_requested';
  onApprovePage: () => void;
  approvingPage: boolean;
  approveError: string;
  onRequestChanges: () => void;
  stripeAccountActive: boolean;
  noFeePolicy: boolean;
  onConnectStripe: () => void;
  connectingStripe: boolean;
  onNavigate: (href: string) => void;
}

// Plain-English steps for a first-time, non-technical operator. Every step's
// "done" state is derived from real data — nothing here is a checkbox anyone
// can just click to dismiss (V13 item 1).
export default function GettingStartedChecklist({
  emailVerified, onboardingStep, courseDraft, pageApprovalStatus, onApprovePage, approvingPage, approveError,
  onRequestChanges, stripeAccountActive, noFeePolicy, onConnectStripe, connectingStripe, onNavigate,
}: Props) {
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setVisited(getVisitedTabs()); }, []);

  const lookedAround = CORE_TABS.filter(t => visited.has(t)).length >= LOOK_AROUND_THRESHOLD;
  const checkedSchedule = visited.has('schedule');
  const pageReviewed = pageApprovalStatus === 'approved';

  const steps: Step[] = [
    { key: 'email', title: 'Verify your email', blurb: 'Confirms it’s really you before anything goes live.', done: emailVerified },
    { key: 'password', title: 'Set your password', blurb: 'Your account is secured and ready to log in anytime.', done: onboardingStep >= 1 },
    {
      key: 'look-around', title: 'Look around your dashboard',
      blurb: 'Click through Tee Sheet, Schedule, Members, and Payments so you know where everything lives.',
      done: lookedAround,
      action: lookedAround ? undefined : { label: 'Start exploring', onClick: () => onNavigate('/dashboard/schedules') },
    },
    {
      key: 'review-page', title: 'Review your booking page',
      blurb: 'Take a look at the page golfers will see, then approve it or tell us what to change.',
      done: pageReviewed,
      action: pageReviewed ? undefined : {
        label: 'Looks good — approve', onClick: onApprovePage, loading: approvingPage,
      },
    },
    {
      key: 'stripe', title: 'Connect Stripe so you can get paid',
      blurb: noFeePolicy
        ? 'Optional since you don’t charge cancellation fees — but you’ll need it to collect green fees online. Takes about 5 minutes; you’ll need your bank account details.'
        : 'Required before you can go live. Takes about 5 minutes; you’ll need your bank account details.',
      done: stripeAccountActive,
      action: stripeAccountActive ? undefined : { label: 'Connect with Stripe', onClick: onConnectStripe, loading: connectingStripe },
    },
    {
      key: 'schedule', title: 'Check your tee sheet schedule',
      blurb: 'This is what generates your bookable tee times automatically — make sure it matches your hours.',
      done: checkedSchedule,
      action: checkedSchedule ? undefined : { label: 'Review schedule', onClick: () => onNavigate('/dashboard/schedules') },
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  // Disappears entirely once live AND every step is done — it's done its job.
  if (!courseDraft && allDone) return null;

  if (collapsed || (allDone && courseDraft)) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center justify-between bg-white border border-line rounded-lg px-4 py-2.5 mb-4 text-left hover:border-line-strong transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-ink">
          <CheckCircle className="w-4 h-4 text-ok"/>
          Getting Started — {doneCount} of {steps.length} done
        </span>
        <ChevronDown className="w-4 h-4 text-ink-muted"/>
      </button>
    );
  }

  return (
    <div className="bg-white border border-line rounded-lg mb-5 overflow-hidden">
      <button onClick={() => setCollapsed(true)} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div>
          <div className="text-[15px] font-serif font-medium text-ink">Getting Started</div>
          <div className="text-xs text-ink-muted mt-0.5">{doneCount} of {steps.length} done</div>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-faint"/>
      </button>
      <div className="px-5 pb-2">
        <div className="h-1.5 bg-line-soft rounded-full overflow-hidden mb-4">
          <div className="h-full bg-pine rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }}/>
        </div>
      </div>
      <div className="divide-y divide-line-soft border-t border-line-soft">
        {steps.map(s => (
          <div key={s.key} className="flex items-start gap-3 px-5 py-3.5">
            {s.done
              ? <CheckCircle className="w-4 h-4 text-ok mt-0.5 shrink-0"/>
              : <Circle className="w-4 h-4 text-ink-faint mt-0.5 shrink-0"/>}
            <div className="flex-1 min-w-0">
              <div className={'text-sm font-medium ' + (s.done ? 'text-ink-soft' : 'text-ink')}>{s.title}</div>
              <div className="text-xs text-ink-muted mt-0.5">{s.blurb}</div>
              {s.key === 'review-page' && !pageReviewed && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => onNavigate('#preview')} className="text-xs font-medium text-ink-soft bg-paper border border-line hover:border-line-strong px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5"/>View your page
                  </button>
                  {pageApprovalStatus === 'changes_requested' ? (
                    <span className="text-xs text-warn font-medium">Changes requested — we’ll follow up</span>
                  ) : (
                    <button onClick={onRequestChanges} className="text-xs text-ink-muted hover:text-ink transition-colors">Request changes</button>
                  )}
                </div>
              )}
              {s.key === 'review-page' && !!approveError && (
                <p className="text-xs text-bad mt-1.5">{approveError}</p>
              )}
            </div>
            {s.action && (
              <button
                onClick={s.action.onClick}
                disabled={s.action.loading || s.action.disabled}
                className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-white bg-pine hover:bg-pine-hover px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
              >
                {s.action.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : s.key === 'stripe' ? <CreditCard className="w-3.5 h-3.5"/> : s.key === 'schedule' ? <Clock className="w-3.5 h-3.5"/> : null}
                {s.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

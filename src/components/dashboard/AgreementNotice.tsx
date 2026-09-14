'use client';
// AGREEMENT_SPEC AG-3 §3 — the re-acceptance banner and, after the deadline,
// the modal. Rendered inside the authenticated dashboard shell
// (OperatorSidebar) on every page except /dashboard/sign itself. A 428 from
// any configuration write (lib/dashboard-fetch) also opens the modal.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import SignAgreements from '@/components/dashboard/SignAgreements';

type Reaccept = { version: string; effectiveAt: string; reacceptBy: string; title: string; changeSummary: string; overdue: boolean; daysLeft: number };

export const AGREEMENT_REQUIRED_EVENT = 'gr:agreement-required';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

export default function AgreementNotice() {
  const pathname = usePathname();
  const [re, setRe] = useState<Reaccept | null>(null);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/operator/sign?status=1').then(r => r.ok ? r.json() : null).then(d => {
      if (!alive) return;
      const r = d?.reaccept as Reaccept | null | undefined;
      setRe(r ?? null);
      if (r?.overdue) setModal(true);
    }).catch(() => { /* the banner is a nudge; a failed read shows nothing */ });
    const open = () => setModal(true);
    window.addEventListener(AGREEMENT_REQUIRED_EVENT, open);
    return () => { alive = false; window.removeEventListener(AGREEMENT_REQUIRED_EVENT, open); };
  }, []);

  if (!re || pathname === '/dashboard/sign') return null;

  if (modal) {
    return (
      <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4 overflow-y-auto">
        <div className="bg-white rounded-lg border border-line max-w-xl w-full p-6 my-8">
          <h2 className="text-[18px] font-serif font-medium text-ink mb-1">The Operator Agreement changed on {fmt(re.effectiveAt)}</h2>
          <p className="text-sm text-ink-soft mb-4">
            {re.overdue
              ? <>The deadline to sign was {fmt(re.reacceptBy)}. Until you sign, course settings are read-only — bookings and check-ins keep working.</>
              : <>Please review and sign by {fmt(re.reacceptBy)}.</>}
            {re.changeSummary && <> <span className="text-ink">What changed:</span> {re.changeSummary}</>}
          </p>
          <SignAgreements onSigned={() => { setModal(false); setRe(null); window.location.reload(); }} continueLabel="Sign" />
          {!re.overdue && (
            <button onClick={() => setModal(false)} className="mt-3 text-xs text-ink-muted hover:text-ink">Not now</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-warn/5 border-b border-warn/20 px-4 py-2 text-sm text-warn flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        The Operator Agreement changed on {fmt(re.effectiveAt)}. Please review and sign by {fmt(re.reacceptBy)}{re.daysLeft <= 7 ? ` (${re.daysLeft} day${re.daysLeft === 1 ? '' : 's'} left)` : ''}.
      </span>
      <button onClick={() => setModal(true)} className="shrink-0 bg-pine hover:bg-pine-hover text-white px-3 py-1 rounded-md text-xs font-medium transition-colors">Sign</button>
    </div>
  );
}

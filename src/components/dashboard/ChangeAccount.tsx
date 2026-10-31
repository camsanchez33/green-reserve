'use client';
// MEM-ACCT (Cam 2026-10-31, "move to the right member"): a round or shop sale put on the wrong
// member's account moves to another member before it is billed. Pick the member; the new
// member's limit and standing are checked. Used on the tee sheet card (by the round) and on a
// member's account lines (by the charge). Data: POST /api/operator/member-accounts move_charge.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { AccountPicker } from '@/components/dashboard/AccountPicker';

export function ChangeAccount({ target, onDone, className, inputClass }: { target: { bookingId: string } | { chargeId: string }; onDone: (message: string) => void; className: string; inputClass: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return <button type="button" onClick={() => setOpen(true)} className={className}>Change member</button>;
  return (
    <div className="w-full mt-2 bg-paper/70 rounded-md p-2 text-[13px] space-y-1">
      <div className="flex justify-end"><button type="button" onClick={() => { setOpen(false); setError(''); }} className="text-ink-soft hover:text-ink">Cancel</button></div>
      <AccountPicker picked={null} className={inputClass} onPick={async m => {
        if (!m || busy) return;
        setBusy(true); setError('');
        const r = await dfetch('/api/operator/member-accounts', { method: 'POST', body: JSON.stringify({ action: 'move_charge', ...target, toMembershipId: m.id }) });
        setBusy(false);
        if (!r.ok) { setError(r.error); return; }
        setOpen(false);
        onDone(`Moved to ${m.name}’s account.`);
      }} />
      {busy && <p className="text-ink-muted">Moving…</p>}
      {error && <p role="alert" className="text-bad">{error}</p>}
    </div>
  );
}

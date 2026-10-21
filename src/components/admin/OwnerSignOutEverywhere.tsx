'use client';
// AW-1: the owner's "that wasn't me" lever — ends every owner session on every
// device (the sign-in alert email points here).
import { useState } from 'react';

export default function OwnerSignOutEverywhere() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    if (!confirm('Sign out of the owner account on every device, including this one?')) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ everywhere: true }) });
      if (!r.ok) { setError('Couldn’t sign out everywhere — try again.'); return; }
      window.location.assign('/cam');
    } catch { setError('Network error — nothing changed. Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-4 pt-3 border-t border-line-soft">
      <p className="text-[13px] text-ink mb-2">Signed in for 4 hours at a time, only on devices you approved. Every sign-in is emailed to you.</p>
      <button type="button" onClick={go} disabled={busy} className="text-[13px] font-medium text-bad border border-bad/30 hover:bg-bad/5 rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Signing out…' : 'Sign out everywhere'}</button>
      {error && <p className="text-[13px] text-bad mt-2" role="alert">{error}</p>}
    </div>
  );
}

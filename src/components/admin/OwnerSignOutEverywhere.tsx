'use client';
// AW-1: the owner's "that wasn't me" lever — ends every owner session on every
// device (the sign-in alert email points here).
// My profile re-skin (Cam approved the mockup 2026-11-15): not a card — one plain sentence under the cards with a red
// link that confirms first. Same call, same errors.
import { useState } from 'react';
import { Msg, useConfirm, profileStyles as s } from './ProfileCard';

export default function OwnerSignOutEverywhere() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, ask] = useConfirm();
  async function go() {
    if (!await ask('Sign out everywhere?', 'Sign out of the owner account on every device, including this one?', 'Sign out everywhere')) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ everywhere: true }) });
      if (!r.ok) { setError('Couldn’t sign out everywhere — try again.'); return; }
      window.location.assign('/cam');
    } catch { setError('Network error — nothing changed. Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <div className={s.soe}>
        <p>You stay signed in for 4 hours at a time, only on devices you approved, and we email you every time you sign in. Lost a device or see a sign-in you don’t recognise?</p>
        <button type="button" onClick={go} disabled={busy} className={`${s.lnk} ${s.lnkBad}`}>{busy ? 'Signing out…' : 'Sign out everywhere'}</button>
      </div>
      {error && <Msg ok={false}>{error}</Msg>}
      {dialog}
    </div>
  );
}

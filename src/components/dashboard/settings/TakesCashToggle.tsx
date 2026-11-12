'use client';
// HOME-3 (Cam 2026-11-12: "Open the register" shows ONLY when the course has turned on, in Settings, that it takes
// cash and keeps track of the register). One switch in Settings → Pro shop that saves itself (settings.edit, the
// settings route). Display only: it never changes what cash the register or the tee sheet accepts.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';

export function TakesCashToggle({ initial, canEdit }: { initial: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function flip() {
    const next = !on;
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/settings', { method: 'PATCH', body: JSON.stringify({ takesCash: next }) });
    setBusy(false);
    if (!r.ok) { setError(`Couldn't save — ${r.error}`); return; }
    setOn(next);
  }
  return (
    <div>
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={on} disabled={!canEdit || busy} onChange={flip} className="accent-pine" />
        We take cash and keep track of the register
        {busy && <span className="text-[12.5px] text-ink-muted">Saving…</span>}
      </label>
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

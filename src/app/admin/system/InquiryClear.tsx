'use client';
// KEEP-OUTREACH (Cam 2026-11-18): the launch wipe keeps the outreach pipeline, so the test inquiries
// made before outreach prep starts (Nov 23) are cleared once here. Owner only; the route asks for the
// second step, a reason and the words typed exactly (src/app/api/admin/data-reset/inquiries/route.ts).
import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import s from './system.module.css';

type Preview = { open: boolean; confirmWords: string; before: string; inquiries: number; calls: number; touches: number; keptBuilt: number; keptAfter: number };

export function InquiryClear({ onCleared }: { onCleared: () => void }) {
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState('');
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    setErr('');
    const res = await adminFetch<Preview>('/api/admin/data-reset/inquiries', { subject: 'the inquiry counts' });
    if (!res.ok) { setErr(res.message); return; }
    setP(res.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run() {
    if (!p) return;
    setBusy(true); setErr('');
    const res = await adminFetch<{ cleared: { inquiries: number } }>('/api/admin/data-reset/inquiries', {
      method: 'POST', body: JSON.stringify({ confirm: typed, reason: reason.trim() }), action: 'save', subject: 'the clear',
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message); return; }
    setDone(`Cleared ${res.data.cleared.inquiries.toLocaleString()} test inquiries.`);
    setTyped(''); setReason('');
    load(); onCleared();
  }

  const row = (label: string, n: number) => <div className={s.cnt}><span>{label}</span><b>{n.toLocaleString()}</b></div>;
  return (
    <div className={`${s.box} ${s.bbad}`}>
      <p className={`${s.clr} ${s.ink}`}>Test inquiries: clear once before outreach starts. Deletes inquiries added before Nov 23 with their calls and touches. The wipe deletes any left.</p>
      {done && <p className={s.toast} role="status">{done}</p>}
      {err && <p className={s.err} role="alert">{err} <button type="button" className={s.ol} onClick={load}>Try again</button></p>}
      {!p && !err && <p className={s.clr}>Counting…</p>}
      {p && (
        <>
          <div>
            {row('inquiries deleted', p.inquiries)}
            {row('calls', p.calls)}
            {row('touches', p.touches)}
            {row('kept until the wipe: became a course', p.keptBuilt)}
            {row('kept: added from Nov 23', p.keptAfter)}
          </div>
          {p.inquiries > 0 && (
            <>
              <p className={`${s.clr} ${s.ink}`}>Type <b>{p.confirmWords}</b> to confirm.</p>
              <input className={s.fld} value={typed} onChange={e => setTyped(e.target.value)} aria-label="Confirmation words for clearing test inquiries" autoComplete="off" />
              <label className={s.lab}>Reason (kept in the audit record)<input className={s.fld} value={reason} onChange={e => setReason(e.target.value)} autoComplete="off" /></label>
              <div className={s.acts}>
                <button type="button" className={`${s.btn} ${s.dng} ${s.solid}`} onClick={run} disabled={busy || typed !== p.confirmWords || reason.trim().length < 4}>{busy ? 'Clearing…' : 'Clear test inquiries'}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

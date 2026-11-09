'use client';
// POS-7 (Cam 2026-11-09: "input a starting cash at the beginning of the day … like a notification thing at the top
// on the homepage … locks after it is confirmed"; "it says open the register"). One card for Home and the Register:
// until today's register is open it asks for the starting cash — type it, then confirm (it locks). Once open it
// shows nothing on Home and the Register; the Close out tab shows the locked amount (with Change for shop.open_fix).
// DRAWER-1 (Cam 2026-11-09): opening counts the drawer against what the last close-out left (shown with who left it
// and their note); a different count needs a reason. After a close-out the same day it's "Reopen the register".
// Until it's open nothing is charged at the register (the server refuses). Data: /api/operator/register-open.
import { useCallback, useEffect, useRef, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { useDashboardAccess } from '@/lib/use-dashboard-access';

type Row = { startingCashCents: number; reason: string; openedBy: string; createdAt: string; kind?: string; leftCents?: number | null };
type Handoff = { day: string; leaveInCents: number; depositCents: number | null; note: string; closedBy: string; at: string };
type Data = { day: string; status: 'not_open' | 'open' | 'closed'; current: Row | null; history: Row[]; handoff: Handoff | null; notClosed: string | null; hasShop: boolean; canOpen: boolean; canFix: boolean };
const dayWord = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const toCents = (s: string) => { const t = s.trim(); if (!t) return null; const n = Math.round(Number(t) * 100); return Number.isFinite(n) && n >= 0 ? n : null; };
const at = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Today's register: open it (Home, Register), or see and change its locked starting cash (Close out). */
export function OpenRegister({ where, onOpened, onStatus }: { where: 'home' | 'register' | 'close'; onOpened?: (cents: number) => void; onStatus?: (status: Data['status']) => void }) {
  const access = useDashboardAccess();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'type' | 'confirm' | 'fix'>('type');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justOpened, setJustOpened] = useState(false);
  const opened = useRef(onOpened); opened.current = onOpened;
  const statusCb = useRef(onStatus); statusCb.current = onStatus;
  // Prefill the count with what was left, once.
  const prefilled = useRef(false);

  const load = useCallback(async () => {
    const r = await dfetch<Data>('/api/operator/register-open');
    if (r.ok) {
      setData(r.data); setLoadError(''); statusCb.current?.(r.data.status);
      if (r.data.current && r.data.status !== 'not_open') opened.current?.(r.data.current.startingCashCents);
      if (!prefilled.current && r.data.status !== 'open' && r.data.handoff) { prefilled.current = true; setAmount((r.data.handoff.leaveInCents / 100).toFixed(2)); }
    } else setLoadError(r.error);
  }, []);
  const canSell = access.can('shop.sell');
  useEffect(() => { if (access.loaded && canSell) load(); }, [access.loaded, canSell, load]);

  if (!access.loaded || !canSell) return null;
  // Home too (no-silent-failures audit 2026-11-09): a closed register blocks cash, so not knowing is worth a line.
  if (loadError) return (
    <p role="alert" className={'text-[13px] ' + (where === 'home' ? 'text-warn' : 'text-bad')}>Couldn&apos;t check the register — {loadError} <button type="button" onClick={load} className="underline font-medium">Retry</button></p>
  );
  if (!data || (where === 'home' && !data.hasShop)) return null;

  const cents = toCents(amount);
  async function send(action: 'open' | 'fix') {
    if (cents === null) { setError('Enter the starting cash as an amount (0 if the drawer is empty).'); return; }
    setBusy(true); setError('');
    const r = await dfetch<Omit<Data, 'hasShop' | 'canOpen' | 'canFix'>>('/api/operator/register-open', { method: 'POST', body: JSON.stringify({ action, startingCashCents: cents, reason }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); if (r.status === 409) load(); return; }
    setData(d => d && { ...d, ...r.data }); setAmount(''); setReason(''); setStep('type'); setJustOpened(true);
    statusCb.current?.(r.data.status);
    if (r.data.current) opened.current?.(r.data.current.startingCashCents);
  }

  // Open: Home and the Register say nothing more (a one-line "opened" right after); Close out shows the lock.
  const isOpen = data.status === 'open';
  if (isOpen && where !== 'close') {
    return justOpened ? <p className="text-[13px] text-ok" aria-live="polite">Register open · {usd(data.current?.startingCashCents ?? 0)} starting cash, locked.</p> : null;
  }
  if (data.current && where === 'close') {
    const first = data.history[0];
    return (
      <div className="text-[13px]">
        <p className="text-ink">Starting cash <b className="tabular-nums">{usd(data.current.startingCashCents)}</b> <span className="text-ink-muted">· locked · {data.current.openedBy || 'staff'}, {at(data.current.createdAt)}</span></p>
        {data.history.length > 1 && <p className="mt-0.5 text-ink-muted">Changed from {usd(first.startingCashCents)} — {data.current.reason}</p>}
        {data.current.leftCents != null && data.current.leftCents !== data.current.startingCashCents && <p className="mt-0.5 text-warn">{usd(data.current.leftCents)} was left at close-out{data.current.reason && data.history.at(-1)?.kind !== 'fix' ? ` — ${data.current.reason}` : ''}</p>}
        {data.canFix && isOpen && (step === 'fix' ? (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); send('fix'); }}>
            <div className="relative w-28"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="New starting cash" className={INPUT + ' w-full pl-6'} autoFocus /></div>
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Why" aria-label="Why it's changing" className={INPUT + ' flex-1 min-w-[10rem]'} />
            <button type="submit" disabled={busy || cents === null || !reason.trim()} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-2 disabled:opacity-50">{busy ? 'Saving…' : 'Change'}</button>
            <button type="button" onClick={() => { setStep('type'); setError(''); }} className="text-[13px] text-ink-soft hover:text-ink px-1">Cancel</button>
          </form>
        ) : <button type="button" onClick={() => { setStep('fix'); setError(''); }} className="mt-1 text-[13px] font-medium text-pine hover:underline underline-offset-4">Change the starting cash</button>)}
        {error && <p role="alert" className="mt-1.5 text-[12.5px] text-bad">{error}</p>}
      </div>
    );
  }

  // Not open yet today, or closed out — open (or reopen) it: count the drawer against what was left.
  const box = where === 'close' ? '' : 'bg-white rounded-[10px] shadow-card border-l-[3px] border-warn px-4 py-3';
  const reopen = data.status === 'closed';
  const title = reopen ? 'Reopen the register' : 'Open the register';
  const h = data.handoff;
  const differs = !!h && cents !== null && cents !== h.leaveInCents;
  if (!data.canOpen) return <div className={box}><p className="text-[13.5px] text-ink">{reopen ? 'The register is closed out.' : 'The register isn’t open yet today.'} Nothing can be charged until someone opens it.</p></div>;
  return (
    <div className={box}>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {h ? (
        <div className="mt-1 text-[13px] text-ink">
          <p><b className="tabular-nums">{usd(h.leaveInCents)}</b> left in the drawer <span className="text-ink-muted">· {h.closedBy || 'staff'}, {h.day === data.day ? `today ${at(h.at)}` : dayWord(h.day)}</span></p>
          {h.note && <p className="mt-0.5 text-ink-soft">“{h.note}”</p>}
        </div>
      ) : data.notClosed ? (
        <p className="mt-1 text-[13px] text-warn">{dayWord(data.notClosed)}’s register was never closed out — count what’s there.</p>
      ) : null}
      <form className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2" onSubmit={e => {
        e.preventDefault();
        if (step === 'type') {
          if (cents === null) { setError('Enter the cash in the drawer (0 if it is empty).'); return; }
          if (differs && !reason.trim()) { setError('The count isn’t what was left — say why.'); return; }
          setError(''); setStep('confirm');
        } else send('open');
      }}>
        {step === 'type' ? (
          <>
            <label className="text-[13px] text-ink">Cash in the drawer</label>
            <div className="relative w-32"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Cash in the drawer" className={INPUT + ' w-full pl-6'} /></div>
            {differs && <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder={`Why it isn’t ${usd(h!.leaveInCents)}`} aria-label="Why the count is different" aria-invalid={!reason.trim()} className={INPUT + ' flex-1 min-w-[12rem]' + (!reason.trim() ? ' border-bad' : '')} />}
            <button type="submit" disabled={cents === null || (differs && !reason.trim())} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-2 disabled:opacity-50">Next</button>
          </>
        ) : (
          <>
            <span className="text-[13.5px] text-ink">Lock <b className="tabular-nums">{usd(cents ?? 0)}</b> as the starting cash?</span>
            <button type="submit" disabled={busy} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-2 disabled:opacity-50">{busy ? 'Opening…' : reopen ? 'Reopen' : 'Confirm and lock'}</button>
            <button type="button" onClick={() => setStep('type')} className="text-[13px] text-ink-soft hover:text-ink px-1">Back</button>
          </>
        )}
      </form>
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

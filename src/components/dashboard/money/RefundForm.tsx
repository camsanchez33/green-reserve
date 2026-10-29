'use client';
// Revamp 3 dead end 14 (Cam 2026-10-29): staff refund a round (the course's share,
// part or all) or give back a late fee kept on a cancellation. A reason is required —
// the golfer is emailed it. The route decides how much may go back and says so.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';

const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return v.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

export function RefundForm({ bookingId, kind, onDone }: {
  bookingId: string;
  /** round: part or all of a paid round; late_fee: the whole late fee kept on a cancellation. */
  kind: 'round' | 'late_fee';
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] font-medium text-pine hover:underline">{kind === 'round' ? 'Refund' : 'Give the fee back'}</button>
  );
  async function submit() {
    if (kind === 'round' && amount.trim() && toCents(amount) === null) { setError('Enter an amount above $0, or leave it blank for all of it.'); return; }
    setBusy(true); setError('');
    const r = await dfetch<{ amountCents: number; full: boolean; emailSent: boolean }>('/api/operator/bookings', {
      method: 'PATCH',
      body: JSON.stringify({ id: bookingId, action: kind === 'round' ? 'refund_round' : 'waive_late_fee', reason, ...(kind === 'round' && amount.trim() ? { amountCents: toCents(amount) } : {}) }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setOpen(false); setAmount(''); setReason('');
    onDone(`Refunded $${(r.data.amountCents / 100).toFixed(2)}${r.data.emailSent ? ' — the golfer was emailed.' : '. The email to the golfer didn’t send.'}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1.5">
      {kind === 'round' && <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="All" aria-label="Amount to refund (blank for all)" className={INPUT + ' w-24'} />}
      <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Reason (the golfer sees it)" aria-label="Reason" className={INPUT + ' flex-1 min-w-[10rem]'} />
      <button type="button" onClick={submit} disabled={busy || !reason.trim()} className="px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium disabled:opacity-50">{busy ? 'Refunding…' : 'Refund'}</button>
      <button type="button" onClick={() => { setOpen(false); setError(''); }} className="text-[12.5px] text-ink-soft hover:text-ink">Cancel</button>
      {error && <p role="alert" className="basis-full text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

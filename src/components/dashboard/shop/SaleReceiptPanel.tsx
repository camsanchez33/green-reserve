'use client';
// RECEIPT-3 (Cam 2026-11-09: "if I click receipt as the course I should be able to see it, not just send to them; I
// should then have an option on that receipt screen to send to them, and the email and text buttons should look
// better, and send receipt can just be a little send icon"). Pro shop → Sales → Receipt opens the sale's receipt in
// place (GET /api/operator/shop-sales?receipt=…), with the send row under it.
import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { ShopReceiptBody } from '@/components/dashboard/shop/ShopReceiptBody';
import type { ShopReceipt } from '@/lib/shop-receipt';

export type ReceiptTarget = { id: string; via: 'email' | 'sms'; to: string };

/** Email or Text, the address, and a send icon — one row. */
export function ReceiptSendRow({ receipt, setReceipt, onSend, busy }: {
  receipt: ReceiptTarget; setReceipt: (r: ReceiptTarget) => void; onSend: () => void; busy: boolean;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); onSend(); }}>
      <div className="inline-flex gap-1 p-1 rounded-[7px] bg-page" role="group" aria-label="Send the receipt by">
        {(['email', 'sms'] as const).map(v => (
          <button key={v} type="button" aria-pressed={receipt.via === v} onClick={() => setReceipt({ ...receipt, via: v, to: '' })}
            className={'px-3 min-h-[30px] rounded-[7px] text-[13px] ' + (receipt.via === v ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-soft hover:text-ink')}>{v === 'email' ? 'Email' : 'Text'}</button>
        ))}
      </div>
      <input value={receipt.to} onChange={e => setReceipt({ ...receipt, to: e.target.value })} type={receipt.via === 'email' ? 'email' : 'tel'} required
        placeholder={receipt.via === 'email' ? 'Their email' : 'Their mobile'} aria-label={receipt.via === 'email' ? 'Receipt email' : 'Receipt mobile number'} className={INPUT + ' flex-1 min-w-[10rem]'} />
      <button type="submit" disabled={busy || !receipt.to.trim()} aria-label="Send receipt" title="Send receipt"
        className="w-9 h-9 inline-flex items-center justify-center rounded-[7px] bg-pine hover:bg-pine-hover text-white disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
      </button>
    </form>
  );
}

/** The sale's receipt, read from the server, with the send row under it. */
export function SaleReceiptPanel({ receipt, setReceipt, onSend, busy, onClose }: {
  receipt: ReceiptTarget; setReceipt: (r: ReceiptTarget) => void; onSend: () => void; busy: boolean; onClose: () => void;
}) {
  const [r, setR] = useState<ShopReceipt | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    const res = await dfetch<{ receipt: ShopReceipt }>(`/api/operator/shop-sales?receipt=${encodeURIComponent(receipt.id)}`);
    if (res.ok) setR(res.data.receipt); else setError(res.error);
  };
  useEffect(() => { load(); }, [receipt.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-2 max-w-md bg-paper/70 rounded-md p-3">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-ink">Receipt</h3>
        <button type="button" onClick={onClose} className="text-[12.5px] text-ink-soft hover:text-ink">Close</button>
      </div>
      {error ? <p role="alert" className="text-[13px] text-bad">{error} <button type="button" onClick={load} className="underline font-medium">Try again</button></p>
        : !r ? <p className="text-[13px] text-ink-muted">Loading the receipt…</p>
        : <ShopReceiptBody r={r} />}
      <div className="mt-3 pt-3 border-t border-line">
        <p className="text-[12.5px] text-ink-muted mb-2">Send it to them</p>
        <ReceiptSendRow receipt={receipt} setReceipt={setReceipt} onSend={onSend} busy={busy} />
      </div>
    </div>
  );
}

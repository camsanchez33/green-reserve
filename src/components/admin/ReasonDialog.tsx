'use client';
// BRAIN-1a (Cam 2026-10-22): money, access and deletes are said with a reason.
// Mounted once in the admin layout; stepUpFetch opens it when a route answers
// "reason required" and sends the request again with what was typed.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { INPUT } from '@/components/ui/field';
import { registerReasonHandler } from '@/lib/step-up-client';

const MIN = 4;

export default function ReasonDialog() {
  const [label, setLabel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const resolver = useRef<((r: string | null) => void) | null>(null);

  useEffect(() => {
    registerReasonHandler(l => new Promise<string | null>(resolve => {
      resolver.current = resolve;
      setText(''); setLabel(l);
    }));
    return () => registerReasonHandler(null);
  }, []);

  function finish(r: string | null) {
    setLabel(null);
    resolver.current?.(r);
    resolver.current = null;
  }

  if (label === null) return null;
  const ok = text.trim().length >= MIN;
  return (
    <Modal title={label ? `${label}: why?` : 'Why?'} size="sm" onClose={() => finish(null)}>
      <form onSubmit={e => { e.preventDefault(); if (ok) finish(text.trim()); }}>
        <p className="text-[13.5px] text-ink-soft mb-3">A short reason is kept with this change, so anyone looking later knows why it happened.</p>
        <label className="grid gap-1 text-[13px] text-ink-soft">Reason
          <input autoFocus value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder="e.g. Course closed for frost" className={INPUT} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => finish(null)} className="px-4 py-2 rounded-md text-[13.5px] text-ink-soft hover:text-ink">Cancel</button>
          <button type="submit" disabled={!ok} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13.5px] font-medium disabled:opacity-50">Continue</button>
        </div>
      </form>
    </Modal>
  );
}

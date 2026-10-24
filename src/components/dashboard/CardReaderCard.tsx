'use client';
// POS-3 R3: Settings → Pro shop → Card reader. The owner connects a Stripe
// card reader with the code it shows on screen; the register then offers
// "Card reader". With test keys a simulated reader can be added instead, so
// the whole flow can be tried before a reader arrives. Owner only — the route
// refuses staff.
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';

type Reader = { id: string; label: string; online: boolean; simulated: boolean; device: string };
type List = { readers: Reader[]; testMode: boolean; simulatedCode: string | null };

export function CardReaderCard() {
  const [list, setList] = useState<List | null>(null);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('Pro shop');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const r = await dfetch<List>('/api/operator/card-readers');
    if (!r.ok) { setLoadError(r.error); return; }
    setList(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(withCode: string) {
    setBusy('add'); setError(''); setNote('');
    const r = await dfetch<{ reader: Reader }>('/api/operator/card-readers', { method: 'POST', body: JSON.stringify({ code: withCode, label }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    setCode(''); setNote(`${r.data.reader.label} is connected. Pick “Card reader” at the register.`);
    load();
  }

  async function remove(r: Reader) {
    if (!confirm(`Remove ${r.label}? It stops taking payments until it is connected again.`)) return;
    setBusy(r.id); setError(''); setNote('');
    const res = await dfetch(`/api/operator/card-readers?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    setBusy('');
    if (!res.ok) { setError(res.error); return; }
    setNote(`${r.label} removed.`);
    load();
  }

  if (loadError) return <p className="text-[13px] text-bad" role="alert">{loadError} <button type="button" onClick={load} className="underline font-medium">Try again</button></p>;
  if (!list) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">Take cards at the register on a Stripe card reader. Customers tap, insert or swipe; the money goes to your Stripe account like any other payment.</p>
      {list.readers.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {list.readers.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="text-ink font-medium">{r.label}</span>
                {r.simulated && <span className="text-ink-muted"> · simulated (test mode)</span>}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <StatusDot status={r.online ? 'ok' : 'neutral'} label={r.online ? 'Online' : 'Offline'} />
                <button type="button" onClick={() => remove(r)} disabled={!!busy} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">{busy === r.id ? 'Removing…' : 'Remove'}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <span className="block text-[13px] font-medium text-ink">Connect a reader</span>
        <p className="text-[12.5px] text-ink-muted">On the reader, open its settings and choose “Generate pairing code”, then enter the code here.</p>
        <div className="flex flex-wrap gap-2">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Pairing code" aria-label="Pairing code" autoComplete="off" className={INPUT + ' w-48'} />
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder="Name, e.g. Front counter" aria-label="Reader name" className={INPUT + ' w-48'} />
          <button type="button" onClick={() => add(code)} disabled={!!busy || !code.trim()} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm px-4 py-2 disabled:opacity-50">{busy === 'add' ? 'Connecting…' : 'Connect'}</button>
        </div>
        {list.simulatedCode && (
          <p className="text-[12.5px] text-ink-muted">No reader yet? <button type="button" onClick={() => add(list.simulatedCode!)} disabled={!!busy} className="text-pine font-medium hover:underline disabled:opacity-50">Add a simulated reader</button> to try the register (test mode only).</p>
        )}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      {note && <p className="text-[13px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />{note}</p>}
    </div>
  );
}

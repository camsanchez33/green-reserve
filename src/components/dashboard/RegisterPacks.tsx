'use client';
// PRICE-3 (Cam 2026-10-30: "Round packs"): the Pro shop page's packs. PackPicker adds a pack
// to the sale being rung up (it rides the sale like any line; the customer's email is the
// holder). PackHolders lists who holds rounds and how many are left. Data:
// /api/operator/round-packs (lib/round-packs.ts).
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import type { PackRow, Holding } from '@/lib/round-packs';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function PackPicker({ onPick, onClose }: { onPick: (p: PackRow) => void; onClose: () => void }) {
  const [packs, setPacks] = useState<PackRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await dfetch<{ packs: PackRow[] }>('/api/operator/round-packs');
    if (r.ok) { setPacks(r.data.packs.filter(p => p.active)); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="mt-2"><LoadError message={`Couldn't load round packs — ${error}`} onRetry={load} /></div>;
  if (!packs) return null;
  return (
    <div className="mt-2 bg-paper/70 rounded-md p-3">
      {packs.length ? (
        <ul className="divide-y divide-line-soft text-[13px]">
          {packs.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); onClose(); }} className="w-full flex justify-between gap-3 py-1.5 text-left hover:text-pine">
                <span>{p.name} · {p.rounds} rounds</span><span className="tabular-nums">{usd(p.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-ink-muted">No round packs — add them in Settings → Pro shop.</p>}
      <p className="mt-2 text-[12.5px] text-ink-muted">Add the customer’s email below — the rounds are theirs.</p>
    </div>
  );
}

export function PackHolders() {
  const [rows, setRows] = useState<Holding[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const r = await dfetch<{ holders: Holding[] }>('/api/operator/round-packs?holders=1');
    if (r.ok) { setRows(r.data.holders); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);
  const shown = (rows ?? []).filter(h => !q.trim() || `${h.holderName} ${h.holderEmail} ${h.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Round packs</h2>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="ml-auto text-[13px] font-medium text-pine hover:underline underline-offset-4">{open ? 'Hide' : 'Holders'}</button>
      </div>
      {open && (error ? <div className="mt-3"><LoadError message={`Couldn't load holders — ${error}`} onRetry={load} /></div> : rows && (
        <div className="mt-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a holder" aria-label="Find a holder" className={INPUT + ' w-full max-w-xs'} />
          <table className="mt-3 w-full text-[13px] tabular-nums">
            <thead><tr className="text-left text-[12.5px] text-ink-muted border-b border-line-soft"><th className="py-2 pr-3 font-medium">Holder</th><th className="py-2 pr-3 font-medium">Pack</th><th className="py-2 pr-3 font-medium text-right">Left</th><th className="py-2 font-medium">Ends</th></tr></thead>
            <tbody className="divide-y divide-line-soft">
              {shown.map(h => (
                <tr key={h.lineId}>
                  <td className="py-2 pr-3 text-ink">{h.holderName || '—'}{h.holderEmail && <span className="block text-ink-muted">{h.holderEmail}</span>}</td>
                  <td className="py-2 pr-3 text-ink-soft">{h.name}</td>
                  <td className="py-2 pr-3 text-right text-ink">{h.left}</td>
                  <td className="py-2 text-ink-muted">{h.expiresAt ? day(h.expiresAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="text-[13px] text-ink-muted py-2">No holders.</p>}
        </div>
      ))}
    </Card>
  );
}

/** The tee sheet's walk-in form: "Round pack" as a rate — find the holder and pick their pack. */
export const PACK_RATE: [string, string] = ['pack', 'Round pack'];
export function PackHolderPick({ value, onPick, inputClass }: { value: Holding | null; onPick: (h: Holding | null) => void; inputClass: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Holding[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (value || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await dfetch<{ holders: Holding[] }>(`/api/operator/round-packs?q=${encodeURIComponent(q.trim())}`);
      if (r.ok) { setHits(r.data.holders); setError(''); } else setError(r.error);
    }, 250);
    return () => clearTimeout(t);
  }, [q, value]);
  if (value) return <p className="text-[13px] text-ink">{value.holderName} · {value.name} · {value.left} left{value.guests ? ' · guests too' : ''} <button type="button" onClick={() => onPick(null)} className="text-pine font-medium hover:underline">Change</button></p>;
  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find the holder" aria-label="Find the holder" className={inputClass} />
      {error && <p role="alert" className="text-[12.5px] text-bad mt-1">{error}</p>}
      {hits.map(h => <button key={h.lineId} type="button" onClick={() => onPick(h)} className="block w-full text-left px-2 py-1.5 text-[13px] text-ink hover:bg-paper">{h.holderName || h.holderEmail || 'Holder'} <span className="text-ink-muted">· {h.name} · {h.left} left</span></button>)}
      {q.trim().length >= 2 && !hits.length && !error && <p className="text-[12.5px] text-ink-muted mt-1">No one with rounds left.</p>}
    </div>
  );
}

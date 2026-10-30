'use client';
// PRICE-3 (Cam 2026-10-30: "Round packs" — cart and guests "course decides per pack"):
// Settings → Pro shop's packs. A pack is N rounds for a price, sold at the register (and
// online when ticked); it can cover the cart and the holder's guests, and end after a
// number of days. Data: /api/operator/round-packs (lib/round-packs.ts).
import { useCallback, useEffect, useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import type { PackRow } from '@/lib/round-packs';

type Draft = { id?: string; name: string; rounds: string; price: string; coversCart: boolean; guests: boolean; validDays: string; sellOnline: boolean; openLinks: 'keep' | 'current' };
const blank = (): Draft => ({ name: '', rounds: '10', price: '', coversCart: false, guests: false, validDays: '', sellOnline: false, openLinks: 'keep' });
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const terms = (p: PackRow) => [`${p.rounds} rounds`, usd(p.priceCents), p.coversCart ? 'cart included' : '', p.guests ? 'guests too' : '', p.validDays ? `${p.validDays} days` : '', p.sellOnline ? 'online' : ''].filter(Boolean).join(' · ');

export function RoundPacks() {
  const [packs, setPacks] = useState<PackRow[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [note, setNote] = useState('');
  const [linkError, setLinkError] = useState('');

  const load = useCallback(async () => {
    const r = await dfetch<{ packs: PackRow[] }>('/api/operator/round-packs');
    if (r.ok) { setPacks(r.data.packs); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true); setFormError(''); setNote(''); setLinkError('');
    const body = { ...draft, rounds: Number(draft.rounds), priceCents: Math.round(Number(draft.price) * 100), validDays: draft.validDays.trim() };
    const r = await dfetch<{ linksClosed?: number; linksNotClosed?: number }>('/api/operator/round-packs', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setFormError(r.error); return; }
    // PRICE-4: unpaid links closed because the pack changed (and any that couldn't be — save again to retry).
    const closed = r.data?.linksClosed ?? 0, stuck = r.data?.linksNotClosed ?? 0;
    setNote(closed ? `${closed} unpaid link${closed === 1 ? '' : 's'} closed.` : '');
    setLinkError(stuck ? `${stuck} unpaid link${stuck === 1 ? '' : 's'} couldn’t be closed — save again. They can’t be paid at the old price meanwhile.` : '');
    setDraft(null); load();
  }
  async function toggle(p: PackRow) {
    setNote(''); setLinkError('');
    const r = await dfetch('/api/operator/round-packs', { method: 'PATCH', body: JSON.stringify({ id: p.id, active: !p.active }) });
    if (!r.ok) { setError(r.error); return; }
    load();
  }
  const box = (k: 'coversCart' | 'guests' | 'sellOnline', label: string) => draft && (
    <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.checked })} />{label}</label>
  );

  if (error && !packs) return <LoadError message={`Couldn't load round packs — ${error}`} onRetry={load} />;
  if (!packs) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-4">
        <h3 className="text-[15px] font-semibold text-ink">Round packs</h3>
        {!draft && <button onClick={() => { setFormError(''); setDraft(blank()); }} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">New pack</button>}
      </div>
      {error && <p role="alert" className="text-[12.5px] text-bad mt-2">{error}</p>}
      {note && <p className="text-[12.5px] text-ink-muted mt-2">{note}</p>}
      {linkError && <p role="alert" className="text-[12.5px] text-bad mt-2">{linkError}</p>}
      {draft && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3 bg-paper/70 rounded-md p-3">
          <label className="text-[12.5px] text-ink-soft sm:col-span-2">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={60} className={INPUT + ' block mt-1 w-full'} /></label>
          <label className="text-[12.5px] text-ink-soft">Rounds<input value={draft.rounds} onChange={e => setDraft({ ...draft, rounds: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-full'} /></label>
          <label className="text-[12.5px] text-ink-soft">Price $<input value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} inputMode="decimal" className={INPUT + ' block mt-1 w-full'} /></label>
          <label className="text-[12.5px] text-ink-soft">Good for (days, blank = no end)<input value={draft.validDays} onChange={e => setDraft({ ...draft, validDays: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-full'} /></label>
          <div className="flex flex-col gap-2 justify-end">
            {box('coversCart', 'Covers the cart')}
            {box('guests', 'Guests can use rounds')}
            {box('sellOnline', 'Sell online')}
          </div>
          <label className="text-[12.5px] text-ink-soft sm:col-span-2">Unpaid links when this pack changes
            <select value={draft.openLinks} onChange={e => setDraft({ ...draft, openLinks: e.target.value === 'current' ? 'current' : 'keep' })} className={INPUT + ' block mt-1 w-full'}>
              <option value="keep">Keep the price they were sent at</option>
              <option value="current">Close them — buy again at the new price</option>
            </select>
          </label>
          {formError && <p role="alert" className="sm:col-span-2 text-[12.5px] text-bad">{formError}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={save} disabled={busy} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setDraft(null)} className="text-[13px] text-ink-soft hover:text-ink px-2">Cancel</button>
          </div>
        </div>
      )}
      {packs.length > 0 ? (
        <ul className="mt-3 divide-y divide-line-soft text-[13px]">
          {packs.map(p => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium text-ink">{p.name}</span>
              <span className="text-ink-muted tabular-nums">{terms(p)}</span>
              {!p.active && <StatusDot status="neutral" label="Off" />}
              <span className="ml-auto flex gap-3">
                <button onClick={() => { setFormError(''); setDraft({ id: p.id, name: p.name, rounds: String(p.rounds), price: (p.priceCents / 100).toFixed(2), coversCart: p.coversCart, guests: p.guests, validDays: p.validDays == null ? '' : String(p.validDays), sellOnline: p.sellOnline, openLinks: p.openLinks === 'current' ? 'current' : 'keep' }); }} className="text-pine font-medium hover:underline underline-offset-4">Edit</button>
                <button onClick={() => toggle(p)} className="text-ink-soft hover:text-ink">{p.active ? 'Turn off' : 'Turn on'}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : !draft && <p className="mt-2 text-[13px] text-ink-muted">No packs yet.</p>}
    </div>
  );
}

'use client';
// Pro shop item stock box (Cam 2026-11-12, ADMIN_REDO_SPEC "Pro shop item stock box: APPROVED", mockup
// lanes/dashboard/stock-edit-mockup.html): today's confusing stock fields, cleaned up. One "In stock" number (amber below
// zero, with how to fix it), then two choices — "New stock" (how many, the cost of one, what it comes to) or "Current
// inventory" (what is on the shelf now) — and the reorder point. Hide from the register and Delete item as small links.
// Writes through the routes ItemForm already uses: shop-stock receive / reorder, shop-items PATCH stockCount / active,
// DELETE. The reminder EMAIL is not built (Build 2026-11-12): the reorder point marks the item Low on Stock, as today.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import type { TreeItem } from '@/lib/shop-tree';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function Stepper({ value, onChange, min = 0, label }: { value: number; onChange: (n: number) => void; min?: number; label: string }) {
  return (
    <div className="flex items-center gap-1 bg-page border border-line rounded-[10px] p-[3px]">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`One less: ${label}`} className="w-8 h-8 rounded-[8px] text-[17px] text-ink hover:bg-line">−</button>
      <input value={value} onChange={e => { const n = Number(e.target.value.replace(/\D/g, '')); onChange(Number.isFinite(n) ? Math.max(min, Math.min(99999, n)) : min); }}
        inputMode="numeric" aria-label={label} className="w-12 bg-transparent text-center text-[15px] font-semibold text-ink tabular-nums outline-none" />
      <button type="button" onClick={() => onChange(Math.min(99999, value + 1))} aria-label={`One more: ${label}`} className="w-8 h-8 rounded-[8px] text-[17px] text-ink hover:bg-line">+</button>
    </div>
  );
}

export function StockBox({ item, reorderAt, lastCostCents, canCost, onDone }: {
  item: TreeItem;
  reorderAt: number | null;
  /** The owner's last cost of one (prefills "Cost of one"); undefined for staff, who never see costs. */
  lastCostCents?: number | null;
  canCost: boolean;
  /** After a write: what to say (or what failed), so the page reloads and shows it. */
  onDone: (msg: string, failed?: string) => Promise<void> | void;
}) {
  const count = item.stockCount;
  const counted = count !== null;
  const [mode, setMode] = useState<'in' | 'count'>(counted ? 'in' : 'count');
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(lastCostCents != null ? (lastCostCents / 100).toFixed(2) : '');
  const [shelf, setShelf] = useState(Math.max(0, count ?? 0));
  const [ro, setRo] = useState(reorderAt ?? 0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function run(key: string, call: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(key); setError('');
    const r = await call();
    setBusy('');
    if (!r.ok) { setError(r.error || 'That didn’t save — try again.'); return; }
    await onDone(msg);
  }
  const addStock = () => {
    const c = cost.trim() === '' ? null : Math.round(Number(cost.replace(/[$,\s]/g, '')) * 100);
    if (c !== null && !(Number.isFinite(c) && c >= 0)) { setError('Check the cost of one.'); return; }
    return run('in', () => dfetch('/api/operator/shop-stock', { method: 'POST', body: JSON.stringify({ action: 'receive', itemId: item.id, quantity: qty, ...(canCost && c !== null ? { unitCostCents: c } : {}) }) }), `${qty} added to ${item.name}.`);
  };
  const saveCount = () => run('count', () => dfetch('/api/operator/shop-items', { method: 'PATCH', body: JSON.stringify({ id: item.id, stockCount: shelf }) }), `${item.name} counted: ${shelf} in stock.`);
  const saveReorder = () => run('ro', () => dfetch('/api/operator/shop-stock', { method: 'POST', body: JSON.stringify({ action: 'reorder', itemId: item.id, reorderAt: ro > 0 ? ro : null }) }), ro > 0 ? `${item.name} shows as low below ${ro}.` : `${item.name} no longer shows as low.`);
  const hide = () => run('hide', () => dfetch('/api/operator/shop-items', { method: 'PATCH', body: JSON.stringify({ id: item.id, active: !item.active }) }), item.active ? `${item.name} hidden from the register.` : `${item.name} back on the register.`);
  async function del() {
    if (!confirm(`Delete ${item.name}?`)) return;
    setBusy('del'); setError('');
    const r = await dfetch<{ hidden?: boolean }>('/api/operator/shop-items', { method: 'DELETE', body: JSON.stringify({ id: item.id }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    await onDone(r.data?.hidden ? 'That item has been sold before, so it was hidden instead of deleted.' : `${item.name} deleted.`);
  }

  const after = mode === 'in' ? (count ?? 0) + qty : shelf;
  const roChanged = ro !== (reorderAt ?? 0);
  const BTN = 'w-full min-h-[44px] rounded-[10px] bg-pine hover:bg-pine-hover text-white text-[14px] font-semibold disabled:opacity-50';
  const ROW = 'flex items-center justify-between gap-3 py-2.5';
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        {item.photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.photoUrl} alt="" loading="lazy" className="w-11 h-11 rounded-[10px] object-cover bg-page" />
          : <span aria-hidden="true" className="flex w-11 h-11 rounded-[10px] bg-page items-center justify-center text-[13px] font-bold text-ink-soft">{initials(item.name)}</span>}
        <div className="min-w-0">
          <b className="block truncate text-[16px] font-semibold text-ink">{item.name}</b>
          <span className="block text-[12.5px] text-ink-muted">{[item.category, usd(item.priceCents)].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3 py-2 border-t border-line">
        <span className="text-[13.5px] text-ink-soft">In stock</span>
        <b className={'text-[30px] font-semibold tabular-nums leading-none ' + (counted && count! < 0 ? 'text-warn' : 'text-ink')}>{counted ? count!.toLocaleString().replace('-', '−') : 'Not counted'}</b>
      </div>
      {counted && count! < 0 && <p className="text-[12.5px] text-warn mb-1">Sold {Math.abs(count!)} more than you had. Fix it under Current inventory.</p>}

      <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-page mt-2 mb-1" role="tablist" aria-label="Stock">
        {(['in', 'count'] as const).map(k => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} disabled={k === 'in' && !counted} onClick={() => { setMode(k); setError(''); }}
            className={'min-h-[34px] rounded-[8px] text-[13px] disabled:opacity-40 ' + (mode === k ? 'bg-white text-ink font-semibold' : 'text-ink-soft hover:text-ink')}>{k === 'in' ? 'New stock' : 'Current inventory'}</button>
        ))}
      </div>
      {mode === 'in' ? (
        <div>
          <div className={ROW}><span className="text-[13.5px] text-ink">How many</span><Stepper value={qty} min={1} onChange={setQty} label="How many came in" /></div>
          {canCost && (
            <div className={ROW}>
              <span className="text-[13.5px] text-ink">Cost of one<small className="block text-[12px] text-ink-muted">Optional</small></span>
              <label className="relative w-28"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                <input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" aria-label="Cost of one" className="w-full bg-page border border-line rounded-[10px] pl-6 pr-2.5 py-2 text-right text-[14px] text-ink tabular-nums outline-none focus:border-pine/40" /></label>
            </div>
          )}
          <p className="text-[13px] text-ink-muted mb-2">After this: <b className="text-ink tabular-nums">{after.toLocaleString().replace('-', '−')} in stock</b></p>
          <button type="button" onClick={addStock} disabled={!!busy} className={BTN}>{busy === 'in' ? 'Adding…' : 'Add to stock'}</button>
        </div>
      ) : (
        <div>
          <div className={ROW}><span className="text-[13.5px] text-ink">How many you have now</span><Stepper value={shelf} onChange={setShelf} label="How many you have now" /></div>
          <p className="text-[13px] text-ink-muted mb-2">After this: <b className="text-ink tabular-nums">{shelf.toLocaleString()} in stock</b></p>
          <button type="button" onClick={saveCount} disabled={!!busy} className={BTN}>{busy === 'count' ? 'Saving…' : 'Save the count'}</button>
        </div>
      )}

      <div className="mt-4 pt-2 border-t border-line">
        <div className={ROW}>
          <span className="text-[13.5px] text-ink">Remind me when it&apos;s below<small className="block text-[12px] text-ink-muted">Shows as Low on Stock</small></span>
          <Stepper value={ro} onChange={setRo} label="Remind me when it's below" />
        </div>
        {roChanged && <button type="button" onClick={saveReorder} disabled={!!busy} className="w-full min-h-[38px] rounded-[10px] border border-line text-[13.5px] font-semibold text-ink hover:bg-page disabled:opacity-50">{busy === 'ro' ? 'Saving…' : 'Save'}</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
      <div className="mt-3 flex justify-center gap-5 text-[12.5px]">
        <button type="button" onClick={hide} disabled={!!busy} className="text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-50">{busy === 'hide' ? 'Saving…' : item.active ? 'Hide from the register' : 'Show on the register'}</button>
        <button type="button" onClick={del} disabled={!!busy} className="text-bad underline underline-offset-4 disabled:opacity-50">{busy === 'del' ? 'Deleting…' : 'Delete item'}</button>
      </div>
    </div>
  );
}

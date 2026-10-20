'use client';
// POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): pro-shop items on one
// group's booking, in the tee-sheet panel. Items are charged with the round at
// check-in or on the golfer's pay link, plus GreenReserve's $0.50 per sale
// (paid by the golfer). Once the round is paid they lock — a later sale is a
// separate counter sale.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { SHOP_FEE_LABEL, SHOP_SALE_FEE_CENTS, SHOP_FEE_ON } from '@/lib/booking-fees';

export type ShopLine = { id: string; name: string; unitPriceCents: number; quantity: number };
type CatalogItem = { id: string; name: string; category: string; priceCents: number; active: boolean; parentId?: string | null };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function ShopItemsForGroup({ bookingId, lines, shopFeeCents, editable, canSell, showMoney, onChanged }: {
  bookingId: string;
  lines: ShopLine[];
  shopFeeCents: number;
  /** The round is not yet paid, checked in or cancelled. */
  editable: boolean;
  /** shop.sell */
  canSell: boolean;
  /** money.payments — staff without it see what was added, not the prices. */
  showMoney: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function openPicker() {
    setPicking(true); setError(''); setLoadError('');
    if (catalog) return;
    const r = await dfetch<{ items: CatalogItem[] }>('/api/operator/shop-items');
    if (!r.ok) { setLoadError(r.error); return; }
    // W2-7: sellable rows only — an item with sizes/colors is picked by its option ("Logo polo — M").
    const parents = new Set(r.data.items.map(i => i.parentId).filter(Boolean));
    const active = r.data.items.filter(i => i.active && !parents.has(i.id)).sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
    setCatalog(active);
    if (active[0]) setItemId(active[0].id);
  }

  async function add() {
    if (!itemId) return;
    setBusy('add'); setError('');
    const r = await dfetch('/api/operator/bookings/shop', { method: 'POST', body: JSON.stringify({ bookingId, shopItemId: itemId, quantity: qty }) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setPicking(false); setQty(1);
    await onChanged();
  }

  async function remove(lineId: string) {
    setBusy(lineId); setError('');
    const r = await dfetch('/api/operator/bookings/shop', { method: 'DELETE', body: JSON.stringify({ bookingId, lineId }) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    await onChanged();
  }

  if (lines.length === 0 && !(editable && canSell)) return null;
  const shopTotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);

  return (
    <div className="basis-full mt-1 border-t border-line pt-2 text-[13px]">
      {lines.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {lines.map(l => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span className="text-ink truncate">{l.name}{l.quantity > 1 ? ` × ${l.quantity}` : ''}</span>
              <span className="flex items-center gap-2 shrink-0">
                {showMoney && <span className="tabular-nums text-ink-soft">{usd(l.unitPriceCents * l.quantity)}</span>}
                {editable && canSell && (
                  <button type="button" onClick={e => { e.stopPropagation(); remove(l.id); }} disabled={busy !== null}
                    className="text-xs text-ink-soft hover:text-bad px-1 disabled:opacity-50">{busy === l.id ? '…' : 'Remove'}</button>
                )}
              </span>
            </li>
          ))}
          {showMoney && shopFeeCents > 0 && (
            <li className="flex items-center justify-between gap-2 text-ink-muted">
              <span>{SHOP_FEE_LABEL}</span><span className="tabular-nums">{usd(shopFeeCents)}</span>
            </li>
          )}
        </ul>
      )}
      {lines.length > 0 && !editable && <p className="text-[12px] text-ink-muted">Shop items {usd(shopTotal)} were part of this round&apos;s payment.</p>}

      {editable && canSell && !picking && (
        <button type="button" onClick={e => { e.stopPropagation(); openPicker(); }}
          className="text-xs font-medium text-ink-soft hover:text-ink py-0.5">Add shop item</button>
      )}

      {editable && canSell && picking && (
        <div className="mt-1 space-y-2" onClick={e => e.stopPropagation()}>
          {loadError && (
            <p className="text-xs text-bad">{loadError} <button type="button" onClick={() => { setCatalog(null); openPicker(); }} className="underline">Try again</button></p>
          )}
          {!loadError && !catalog && <p className="text-xs text-ink-muted">Loading the shop…</p>}
          {catalog && catalog.length === 0 && (
            <p className="text-xs text-ink-soft">Your shop has no items yet — add them in Settings → Pro shop.</p>
          )}
          {catalog && catalog.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`shop-item-${bookingId}`}>Item</label>
              <select id={`shop-item-${bookingId}`} value={itemId} onChange={e => setItemId(e.target.value)}
                className="min-w-0 flex-1 bg-paper border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:border-pine/40 focus:ring-2 focus:ring-pine/10 outline-none">
                {[...new Set(catalog.map(i => i.category || 'Other'))].map(c => (
                  <optgroup key={c} label={c}>
                    {catalog.filter(i => (i.category || 'Other') === c).map(i => <option key={i.id} value={i.id}>{i.name}{showMoney ? ` · ${usd(i.priceCents)}` : ''}</option>)}
                  </optgroup>
                ))}
              </select>
              <label className="sr-only" htmlFor={`shop-qty-${bookingId}`}>Quantity</label>
              <input id={`shop-qty-${bookingId}`} type="number" min={1} max={99} value={qty}
                onChange={e => setQty(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))}
                className="w-16 bg-paper border border-line rounded-md px-2 py-1.5 text-[13px] text-ink tabular-nums focus:border-pine/40 focus:ring-2 focus:ring-pine/10 outline-none" />
              <button type="button" onClick={add} disabled={busy !== null || !itemId}
                className="bg-pine hover:bg-pine-hover text-white text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy === 'add' ? 'Adding…' : 'Add'}</button>
              <button type="button" onClick={() => { setPicking(false); setError(''); }} className="text-xs text-ink-soft hover:text-ink px-1">Cancel</button>
            </div>
          )}
          {catalog && catalog.length > 0 && lines.length === 0 && (
            <p className="text-[12px] text-ink-muted">Charged with the round{SHOP_FEE_ON ? `, plus GreenReserve’s ${usd(SHOP_SALE_FEE_CENTS)} per sale, paid by the golfer` : ''}.</p>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

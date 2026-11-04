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
type CatalogItem = { id: string; name: string; category: string; priceCents: number; active: boolean; parentId?: string | null; stockCount?: number | null; sku?: string; photoUrl?: string | null };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

// Cam 2026-11-04 ("the whole add a pro shop item is poor"): the register's way — tap a tile to add
// one, − / + on each line, search or scan to find. Lines added one at a time show as one row per item.
type Group = { key: string; name: string; unitPriceCents: number; quantity: number; ids: string[]; lastQty: number };
function groupLines(lines: ShopLine[]): Group[] {
  const m = new Map<string, Group>();
  for (const l of lines) {
    const key = `${l.name}|${l.unitPriceCents}`;
    const g = m.get(key) ?? { key, name: l.name, unitPriceCents: l.unitPriceCents, quantity: 0, ids: [], lastQty: 0 };
    g.quantity += l.quantity; g.ids.push(l.id); g.lastQty = l.quantity; m.set(key, g);
  }
  return [...m.values()];
}

export default function ShopItemsForGroup({ bookingId, lines, shopFeeCents, shopTaxCents = 0, editable, canSell, showMoney, onChanged }: {
  bookingId: string;
  lines: ShopLine[];
  shopFeeCents: number;
  /** W2-7 B2: sales tax on the items (the course's Stripe Tax), charged with them. */
  shopTaxCents?: number;
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
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // W2-7 B2: the item saved but its sales tax couldn't be worked out yet.
  const [taxNote, setTaxNote] = useState('');

  async function openPicker() {
    setPicking(true); setError(''); setLoadError('');
    if (catalog) return;
    const r = await dfetch<{ items: CatalogItem[] }>('/api/operator/shop-items');
    if (!r.ok) { setLoadError(r.error); return; }
    // W2-7: sellable rows only — an item with sizes/colors is picked by its option ("Logo polo — M").
    const parents = new Set(r.data.items.map(i => i.parentId).filter(Boolean));
    const hidden = new Set(r.data.items.filter(i => !i.active).map(i => i.id));
    const active = r.data.items.filter(i => i.active && !parents.has(i.id) && !(i.parentId && hidden.has(i.parentId))).sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
    setCatalog(active);
  }

  async function add(itemId: string) {
    setBusy(`add:${itemId}`); setError('');
    const r = await dfetch<{ taxError?: string }>('/api/operator/bookings/shop', { method: 'POST', body: JSON.stringify({ bookingId, shopItemId: itemId, quantity: 1 }) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setTaxNote(r.data?.taxError || '');
    await onChanged();
  }

  async function remove(lineId: string) {
    setBusy(lineId); setError('');
    const r = await dfetch<{ taxError?: string }>('/api/operator/bookings/shop', { method: 'DELETE', body: JSON.stringify({ bookingId, lineId }) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setTaxNote(r.data?.taxError || '');
    await onChanged();
  }

  if (lines.length === 0 && !(editable && canSell)) return null;
  const shopTotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const groups = groupLines(lines);
  const term = q.trim().toLowerCase();
  const shown = (catalog ?? []).filter(i => !term || i.name.toLowerCase().includes(term) || (i.category || '').toLowerCase().includes(term) || (i.sku || '').toLowerCase() === term);
  const anyPhoto = shown.some(i => i.photoUrl);
  const canEdit = editable && canSell;
  const byNameAndPrice = (g: Group) => (catalog ?? []).find(i => i.name === g.name && i.priceCents === g.unitPriceCents);

  return (
    <div className="basis-full mt-1 border-t border-line pt-2 text-[13px]">
      {groups.length > 0 && (
        <ul className="space-y-1.5 mb-1.5">
          {groups.map(g => {
            const item = byNameAndPrice(g);
            const last = g.ids[g.ids.length - 1]!;
            return (
              <li key={g.key} className="flex items-center justify-between gap-2">
                <span className="text-ink truncate">{g.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {canEdit ? (
                    <span className="inline-flex items-center rounded-md border border-line bg-white">
                      <button type="button" onClick={e => { e.stopPropagation(); remove(last); }} disabled={busy !== null}
                        aria-label={`Less ${g.name}`}
                        className="w-8 h-8 text-ink-soft hover:text-bad disabled:opacity-50">−</button>
                      <span className="min-w-[1.5rem] text-center tabular-nums text-ink">{g.quantity}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); if (item) add(item.id); else openPicker(); }} disabled={busy !== null}
                        aria-label={`More ${g.name}`} className="w-8 h-8 text-ink-soft hover:text-ink disabled:opacity-50">+</button>
                    </span>
                  ) : g.quantity > 1 && <span className="tabular-nums text-ink-soft">× {g.quantity}</span>}
                  {showMoney && <span className="w-16 text-right tabular-nums text-ink-soft">{usd(g.unitPriceCents * g.quantity)}</span>}
                </span>
              </li>
            );
          })}
          {showMoney && shopFeeCents > 0 && (
            <li className="flex items-center justify-between gap-2 text-ink-muted">
              <span>{SHOP_FEE_LABEL}</span><span className="tabular-nums">{usd(shopFeeCents)}</span>
            </li>
          )}
          {showMoney && shopTaxCents > 0 && (
            <li className="flex items-center justify-between gap-2 text-ink-muted">
              <span>Sales tax</span><span className="tabular-nums">{usd(shopTaxCents)}</span>
            </li>
          )}
        </ul>
      )}
      {lines.length > 0 && !editable && <p className="text-[12px] text-ink-muted">{usd(shopTotal)} paid with the round.</p>}

      {canEdit && !picking && (
        <button type="button" onClick={e => { e.stopPropagation(); openPicker(); }}
          className="w-full min-h-[40px] rounded-[7px] border border-dashed border-line-strong text-[13px] font-medium text-ink-soft hover:text-ink hover:bg-paper transition-colors">
          {lines.length ? 'Add items' : 'Add shop items'}
        </button>
      )}

      {canEdit && picking && (
        <div className="mt-1 space-y-2" onClick={e => e.stopPropagation()}>
          {loadError && (
            <p className="text-xs text-bad">{loadError} <button type="button" onClick={() => { setCatalog(null); openPicker(); }} className="underline">Try again</button></p>
          )}
          {!loadError && !catalog && <p className="text-xs text-ink-muted">Loading…</p>}
          {catalog && catalog.length === 0 && (
            <p className="text-xs text-ink-soft">No items yet — add them in Settings → Pro shop.</p>
          )}
          {catalog && catalog.length > 0 && (<>
            <div className="flex items-center gap-2">
              <input id={`shop-find-${bookingId}`} aria-label="Find or scan" value={q} onChange={e => setQ(e.target.value)} placeholder="Find or scan"
                onKeyDown={e => { if (e.key === 'Enter' && shown.length === 1) { e.preventDefault(); add(shown[0]!.id); setQ(''); } }}
                className="flex-1 min-w-0 bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 outline-none" />
              <button type="button" onClick={() => { setPicking(false); setQ(''); setError(''); }} className="text-[13px] font-medium text-ink-soft hover:text-ink px-1">Done</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-[16rem] overflow-y-auto">
              {shown.map(i => {
                const out = i.stockCount != null && i.stockCount <= 0;
                return (
                  <button key={i.id} type="button" onClick={() => add(i.id)} disabled={busy !== null}
                    aria-label={`Add ${i.name}${showMoney ? `, ${usd(i.priceCents)}` : ''}${out ? ', sold out' : ''}`}
                    className="min-w-0 rounded-[7px] bg-white shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_2px_var(--color-pine)] text-left overflow-hidden disabled:opacity-60 transition-shadow">
                    {anyPhoto && (i.photoUrl
                      ? <img src={i.photoUrl} alt="" loading="lazy" className="w-full h-14 object-cover" />
                      : <span aria-hidden="true" className="w-full h-14 flex items-center justify-center bg-paper text-[13px] font-semibold text-ink-muted">{initials(i.name)}</span>)}
                    <span className="block px-2 py-1.5">
                      <span className="block text-[12.5px] leading-tight text-ink line-clamp-2">{busy === `add:${i.id}` ? 'Adding…' : i.name}</span>
                      <span className="block mt-0.5 text-[12px] tabular-nums text-ink-muted">
                        {showMoney ? usd(i.priceCents) : ''}{out && <span className="text-bad">{showMoney ? ' · ' : ''}sold out</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
              {shown.length === 0 && <p className="col-span-3 py-3 text-center text-[12.5px] text-ink-muted">No match</p>}
            </div>
            {lines.length === 0 && (
              <p className="text-[12px] text-ink-muted">Charged with the round{SHOP_FEE_ON ? `, plus GreenReserve’s ${usd(SHOP_SALE_FEE_CENTS)} per sale, paid by the golfer` : ''}.</p>
            )}
          </>)}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
      {taxNote && <p className="mt-1 text-xs text-warn">Saved, but {taxNote.charAt(0).toLowerCase() + taxNote.slice(1)}</p>}
    </div>
  );
}

'use client';
// POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): Settings → Pro shop. The
// items staff can add to a group's round from the tee sheet. Each change saves
// on its own. An item that was ever sold is hidden rather than deleted.
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { SHOP_SALE_FEE_CENTS, SHOP_FEE_ON } from '@/lib/booking-fees';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';

type Item = { id: string; name: string; category: string; priceCents: number; active: boolean; stockCount: number | null };

// POS-2 (Cam 2026-10-19): a new shop starts from the things nearly every pro
// shop sells — one tap each, edit the price after.
const STARTERS: { name: string; category: string; priceCents: number }[] = [
  { name: 'Sleeve of balls', category: 'Balls', priceCents: 1200 },
  { name: 'Dozen balls', category: 'Balls', priceCents: 4500 },
  { name: 'Glove', category: 'Accessories', priceCents: 2000 },
  { name: 'Tees (bag)', category: 'Accessories', priceCents: 500 },
  { name: 'Small bucket of range balls', category: 'Range', priceCents: 800 },
  { name: 'Large bucket of range balls', category: 'Range', priceCents: 1400 },
  { name: 'Water', category: 'Drinks', priceCents: 300 },
  { name: 'Sports drink', category: 'Drinks', priceCents: 400 },
];

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** "12.5" → 1250; '' or junk → NaN (the server says what is wrong). */
function toCents(v: string): number {
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function ItemForm({ initial, busy, submitLabel, onSubmit, onCancel }: {
  initial: { name: string; category: string; price: string; stock: string };
  busy: boolean; submitLabel: string;
  onSubmit: (v: { name: string; category: string; priceCents: number; stockCount: number | null | string }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [price, setPrice] = useState(initial.price);
  const [stock, setStock] = useState(initial.stock);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); onSubmit({ name, category, priceCents: toCents(price), stockCount: stock.trim() === '' ? null : stock.trim() }); }}>
      <label className="flex-1 min-w-[160px]">
        <span className="block text-[12.5px] text-ink-soft mb-1">Item</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Sleeve of balls" className={INPUT + ' w-full'} />
      </label>
      <label className="w-40">
        <span className="block text-[12.5px] text-ink-soft mb-1">Category (optional)</span>
        <input value={category} onChange={e => setCategory(e.target.value)} maxLength={40} placeholder="Balls" className={INPUT + ' w-full'} />
      </label>
      <label className="w-28">
        <span className="block text-[12.5px] text-ink-soft mb-1">Price</span>
        <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="12.00" className={INPUT + ' w-full tabular-nums'} />
      </label>
      <label className="w-24">
        <span className="block text-[12.5px] text-ink-soft mb-1">In stock</span>
        <input value={stock} onChange={e => setStock(e.target.value)} inputMode="numeric" placeholder="—" aria-describedby="stock-help" className={INPUT + ' w-full tabular-nums'} />
      </label>
      <button type="submit" disabled={busy} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm px-4 py-2 disabled:opacity-50">{busy ? 'Saving…' : submitLabel}</button>
      {onCancel && <button type="button" onClick={onCancel} className="text-sm text-ink-soft hover:text-ink px-2 py-2">Cancel</button>}
    </form>
  );
}

export function ShopCatalog() {
  const access = useDashboardAccess();
  const canEdit = access.can('shop.catalog');
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setLoadError('');
    const r = await dfetch<{ items: Item[] }>('/api/operator/shop-items');
    if (!r.ok) { setLoadError(r.error); return; }
    setItems(r.data.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function write(key: string, method: 'POST' | 'PATCH' | 'DELETE', body: object, done: string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<{ hidden?: boolean }>('/api/operator/shop-items', { method, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return false; }
    await load();
    setNote(method === 'DELETE' && r.data?.hidden ? 'That item has been sold before, so it was hidden instead of deleted.' : done);
    return true;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft -mt-1">
        Sell these on the Pro shop page (cash or a pay link), or add them to a group&apos;s round from the tee sheet, where they&apos;re charged with the round at check-in or on the golfer&apos;s pay link{SHOP_FEE_ON ? <>, plus GreenReserve&apos;s {usd(SHOP_SALE_FEE_CENTS)} per sale, paid by the golfer</> : null}. A price change never touches items already on a booking.
      </p>
      {loadError && (
        <div className="rounded-md bg-bad/5 border border-bad/20 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-bad">{loadError}</p>
          <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink">Retry</button>
        </div>
      )}
      {!loadError && !items && <p className="text-xs text-ink-muted">Loading your shop…</p>}

      {canEdit && items && (
        <>
          <ItemForm key={formKey} initial={{ name: '', category: '', price: '', stock: '' }} busy={busy === 'new'} submitLabel="Add item"
            onSubmit={async v => { if (await write('new', 'POST', v, `${v.name} added.`)) setFormKey(k => k + 1); }} />
          <p id="stock-help" className="text-[12.5px] text-ink-muted -mt-2">In stock is optional. Fill it in to count what’s on the shelf: every sale takes from it, and the Pro shop page shows what’s left. Leave it blank for things you don’t count.</p>
          {(() => {
            const have = new Set(items.map(i => i.name.toLowerCase()));
            const left = STARTERS.filter(st => !have.has(st.name.toLowerCase()));
            return left.length > 0 && (
              <div>
                <p className="text-[12.5px] text-ink-soft mb-1.5">Quick add — tap one, then fix its price:</p>
                <div className="flex flex-wrap gap-1.5">
                  {left.map(st => (
                    <button key={st.name} type="button" disabled={busy !== null} onClick={() => write(`q-${st.name}`, 'POST', st, `${st.name} added at ${usd(st.priceCents)} — edit it if your price differs.`)}
                      className="text-[12.5px] text-ink border border-line rounded-md px-2.5 py-1 hover:border-pine/40 disabled:opacity-50">
                      {st.name} · {usd(st.priceCents)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}
      {!canEdit && items && <p className="text-xs text-ink-muted">Ask the course owner to turn on “Edit the shop catalog” for you to change these.</p>}
      {error && <p className="text-xs text-bad">{error}</p>}
      {note && <p className="text-xs text-ok">{note}</p>}

      {items && items.length === 0 && <p className="text-sm text-ink-soft">No items yet.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map(i => (
            <li key={i.id} className="py-2.5">
              {editing === i.id ? (
                <ItemForm initial={{ name: i.name, category: i.category, price: (i.priceCents / 100).toFixed(2), stock: i.stockCount === null ? '' : String(i.stockCount) }} busy={busy === i.id} submitLabel="Save"
                  onSubmit={async v => { if (await write(i.id, 'PATCH', { id: i.id, ...v }, `${v.name} saved.`)) setEditing(null); }}
                  onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className={'text-sm ' + (i.active ? 'text-ink' : 'text-ink-muted')}>{i.name}</span>
                    {i.category && <span className="text-[12.5px] text-ink-muted"> · {i.category}</span>}
                    {!i.active && <span className="text-[12.5px] text-ink-muted"> · hidden</span>}
                    {i.stockCount !== null && <span className={'text-[12.5px] ' + (i.stockCount <= 0 ? 'text-bad' : 'text-ink-muted')}> · {i.stockCount <= 0 ? 'none left' : `${i.stockCount} in stock`}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums text-ink">{usd(i.priceCents)}</span>
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => { setEditing(i.id); setError(''); setNote(''); }} disabled={busy !== null} className="text-xs text-ink-soft hover:text-ink px-1.5 disabled:opacity-50">Edit</button>
                        <button type="button" onClick={() => write(i.id, 'PATCH', { id: i.id, active: !i.active }, i.active ? `${i.name} hidden.` : `${i.name} shown.`)} disabled={busy !== null} className="text-xs text-ink-soft hover:text-ink px-1.5 disabled:opacity-50">{i.active ? 'Hide' : 'Show'}</button>
                        <button type="button" onClick={() => { if (confirm(`Delete ${i.name}?`)) write(i.id, 'DELETE', { id: i.id }, `${i.name} deleted.`); }} disabled={busy !== null} className="text-xs text-bad hover:bg-bad/5 rounded-md px-1.5 disabled:opacity-50">{busy === i.id ? '…' : 'Delete'}</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

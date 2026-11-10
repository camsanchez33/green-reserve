'use client';
// POS-6/POS-8 (Cam 2026-11-09: "stock is where everything should be inputed"; "rethink that whole individual items
// tab … organized and efficient"; picked "Lean table + filter chips"). Pro shop → Stock is the ONE place items are
// added and changed. A lean list — photo, name (category and sizes under it), price, on hand, barcode — filtered by
// chips: All · Sold out · Low · Hidden, then each category. Tap a row and it opens in the panel on the right (a full
// sheet on a phone): ItemForm, the same form that adds one. "Add item" or "or add many" (UploadMany: upload what you
// have). Recent deliveries sit behind a link. The register only reads the same list, so a change here shows there.
// Writes: /api/operator/shop-items (shop.catalog), /api/operator/shop-stock (shop.catalog; cost the owner's alone).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { SHOP_SALE_FEE_CENTS, SHOP_FEE_ON } from '@/lib/booking-fees';
import { shopTree, matches, stockOf, type FlatItem, type TreeItem } from '@/lib/shop-tree';
import type { StockRow } from '@/lib/shop-stock';
import { ItemForm } from '@/components/dashboard/ItemForm';
import { UploadMany } from '@/components/dashboard/UploadMany';

type StockData = { rows: StockRow[]; receipts: { id: string; name: string; quantity: number; unitCostCents?: number | null; receivedBy: string; createdAt: string; note: string }[]; canEdit: boolean; canCost: boolean };
type Panel = { kind: 'item'; id: string } | { kind: 'new' } | { kind: 'many' } | null;
type Show = 'all' | 'out' | 'low' | 'hidden' | `cat:${string}`;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function StockTab({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const access = useDashboardAccess();
  const [flat, setFlat] = useState<FlatItem[] | null>(null);
  const [stock, setStock] = useState<StockData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [find, setFind] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [deliveries, setDeliveries] = useState(false);

  const load = useCallback(async () => {
    const [i, s] = await Promise.all([
      dfetch<{ items: FlatItem[] }>('/api/operator/shop-items'),
      dfetch<StockData>('/api/operator/shop-stock'),
    ]);
    if (!i.ok) { setLoadError(i.error); return false; }
    if (!s.ok) { setLoadError(s.error); return false; }
    setLoadError(''); setFlat(i.data.items); setStock(s.data);
    return true;
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const tree = useMemo(() => shopTree(flat ?? []), [flat]);
  const categories = useMemo(() => [...new Set(tree.map(i => i.category).filter(Boolean))].sort(), [tree]);
  const rowOf = useMemo(() => new Map((stock?.rows ?? []).map(r => [r.id, r])), [stock]);

  const canEdit = access.can('shop.catalog');
  const canCost = !!stock?.canCost;
  const canOpen = canEdit || canCost;
  if (loadError && !flat) return <LoadError message={`Couldn't load your items — ${loadError}`} onRetry={load} />;
  if (!flat || !stock) return <Card className="p-5"><p className="text-[13px] text-ink-muted">Loading your items…</p></Card>;

  /** The item's sellable rows: itself, or each of its active options. */
  const sellable = (i: TreeItem) => (i.options.length ? i.options.filter(o => o.active) : [i]);
  const isOut = (i: TreeItem) => sellable(i).some(s => s.stockCount !== null && s.stockCount <= 0);
  const isLow = (i: TreeItem) => !isOut(i) && sellable(i).some(s => rowOf.get(s.id)?.low);
  const live = tree.filter(i => i.active);
  const counts = { all: live.length, out: live.filter(isOut).length, low: live.filter(isLow).length, hidden: tree.length - live.length };
  const inShow = (i: TreeItem) => show === 'all' ? i.active : show === 'out' ? i.active && isOut(i) : show === 'low' ? i.active && isLow(i) : show === 'hidden' ? !i.active : i.active && i.category === show.slice(4);
  const shown = tree.filter(i => inShow(i) && matches(i, find)).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  const open = panel?.kind === 'item' ? tree.find(i => i.id === panel.id) ?? null : null;
  const pick = (p: Panel) => { setPanel(p); setError(''); setNote(''); };
  // A failed reload shows the load error with Retry, never "saved" over old rows.
  const done = async (msg: string, failed?: string) => { setError(failed ?? ''); onChanged?.(); const ok = await load(); setNote(ok ? msg : ''); };

  const chip = (k: Show, label: string, n?: number) => (
    <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
      className={'text-[13px] rounded-[7px] px-3 min-h-[32px] tabular-nums ' + (show === k ? 'bg-ink text-white font-medium' : 'bg-page text-ink-soft hover:text-ink')}>{label}{n !== undefined ? ` ${n}` : ''}</button>
  );

  return (
    // IMPORT-2: "add many" is a wide table — it takes the page's width above the list instead of the 440px side card.
    <div className={'grid gap-4 lg:items-start ' + (panel && panel.kind !== 'many' ? 'lg:grid-cols-[minmax(0,1fr)_440px]' : '')}>
      <Card className="p-5 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Items <span className="font-normal text-ink-muted tabular-nums">{counts.all}</span></h2>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find an item or barcode" aria-label="Find an item" className={INPUT + ' w-56'} />
            {canEdit && <button type="button" onClick={() => pick({ kind: 'new' })} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-[7px] px-3.5 py-2">Add item</button>}
            {canEdit && <button type="button" onClick={() => pick({ kind: 'many' })} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">or add many</button>}
          </div>
        </div>
        {SHOP_FEE_ON && <p className="mt-2 text-[12.5px] text-ink-muted">GreenReserve adds {usd(SHOP_SALE_FEE_CENTS)} a sale, paid by the golfer.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
          {chip('all', 'All', counts.all)}
          {counts.out > 0 && chip('out', 'Sold out', counts.out)}
          {counts.low > 0 && chip('low', 'Low', counts.low)}
          {counts.hidden > 0 && chip('hidden', 'Hidden', counts.hidden)}
          {categories.length > 1 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />}
          {categories.length > 1 && categories.map(c => chip(`cat:${c}`, c))}
        </div>
        {loadError && <div className="mt-3"><LoadError message={`Couldn't load your items — ${loadError}`} onRetry={load} /></div>}
        {(error || note) && !panel && (
          <div className="mt-3" aria-live="polite">
            {error && <p role="alert" className="text-[12.5px] text-bad">{error}</p>}
            {note && <p className="text-[12.5px] text-ok">{note}</p>}
          </div>
        )}
        {tree.length === 0 ? <p className="mt-4 text-[13px] text-ink-muted">No items yet.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13.5px] tabular-nums">
              <thead>
                <tr className="text-left text-[12.5px] text-ink-muted border-b border-line-soft">
                  <th className="py-2 pr-3 font-medium w-12"><span className="sr-only">Photo</span></th>
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium text-right">Price</th>
                  <th className="py-2 pr-3 font-medium text-right">On hand</th>
                  <th className="py-2 font-medium">Barcode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {shown.map(i => {
                  const n = stockOf(i);
                  const opts = i.options.filter(o => o.active);
                  const out = isOut(i), low = isLow(i);
                  return (
                    <tr key={i.id} onClick={canOpen ? () => pick({ kind: 'item', id: i.id }) : undefined} aria-current={open?.id === i.id ? 'true' : undefined}
                      className={(canOpen ? 'cursor-pointer hover:bg-page/60 ' : '') + (open?.id === i.id ? 'bg-page/80' : '')}>
                      <td className="py-2 pr-3">
                        {i.photoUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={i.photoUrl} alt="" loading="lazy" className="w-9 h-9 rounded-[5px] object-cover bg-paper" />
                          : <span aria-hidden="true" className="flex w-9 h-9 rounded-[5px] bg-paper items-center justify-center text-[11px] font-semibold text-ink-faint">{initials(i.name)}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {canOpen ? <button type="button" className="text-left text-ink font-medium hover:underline underline-offset-4" onClick={e => { e.stopPropagation(); pick({ kind: 'item', id: i.id }); }}>{i.name}</button> : <span className="text-ink font-medium">{i.name}</span>}
                        <span className="block text-[12px] text-ink-muted">{[i.category, opts.map(o => o.optionLabel).join(' ')].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="py-2 pr-3 text-right text-ink">{usd(i.priceCents)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {out ? <StatusDot status="bad" label="Sold out" /> : low ? <StatusDot status="warn" label={`Low ${n}`} /> : <span className="text-ink">{n === null ? '—' : n.toLocaleString()}</span>}
                      </td>
                      <td className="py-2 text-ink-muted">{i.sku || (opts.some(o => o.sku) ? 'Each size' : '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="text-[13px] text-ink-muted py-3">Nothing here.</p>}
          </div>
        )}
        {stock.receipts.length > 0 && (
          <div className="mt-4">
            <button type="button" onClick={() => setDeliveries(d => !d)} aria-expanded={deliveries} className="text-[13px] font-medium text-pine hover:underline">Recent deliveries {deliveries ? '▾' : '›'}</button>
            {deliveries && (
              <ul className="mt-2 divide-y divide-line-soft text-[13px]">
                {stock.receipts.slice(0, 20).map(x => (
                  <li key={x.id} className="flex flex-wrap gap-x-3 py-1.5">
                    <span className="text-ink-muted w-20">{new Date(x.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-ink">{x.name}</span>
                    <span className="tabular-nums">+{x.quantity}</span>
                    {x.unitCostCents != null && <span className="text-ink-muted tabular-nums">{usd(x.unitCostCents)} each</span>}
                    <span className="ml-auto text-ink-muted">{x.receivedBy}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {panel && (
        // A card beside the list on a laptop; a full sheet on a phone.
        <div className={'fixed inset-0 z-40 bg-page overflow-y-auto p-4 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 ' + (panel.kind === 'many' ? 'lg:order-first' : 'lg:sticky lg:top-6')}>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-[15px] font-semibold text-ink truncate">{panel.kind === 'new' ? 'Add an item' : panel.kind === 'many' ? 'Add many items' : open?.name ?? 'Item'}</h2>
              <button type="button" onClick={() => pick(null)} aria-label="Close" className="p-1 text-ink-soft hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            {note && <p className="mb-3 text-[12.5px] text-ok" aria-live="polite">{note}</p>}
            {error && panel.kind !== 'many' && <p role="alert" className="mb-3 text-[12.5px] text-bad">{error}</p>}
            {panel.kind === 'new' && (
              <ItemForm key={`new-${counts.all}`} rows={rowOf} categories={categories} canCost={canCost} onCancel={() => pick(null)} onSaved={done} />
            )}
            {panel.kind === 'many' && (
              <UploadMany canCost={canCost} onAdd={async rows => {
                const r = await dfetch<{ created?: number }>('/api/operator/shop-items', { method: 'POST', body: JSON.stringify({ items: rows }) });
                if (!r.ok) { setError(r.error); setNote(''); return false; }
                await done(`${rows.length} item${rows.length === 1 ? '' : 's'} added.`);
                return true;
              }} />
            )}
            {panel.kind === 'many' && error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
            {panel.kind === 'item' && !open && <p className="text-[13px] text-ink-muted">That item is gone.</p>}
            {open && (canEdit
              // keyed on what's stored, so a reload after a save (or a sale) shows the new numbers, never stale ones
              ? <ItemForm key={`${open.id}:${open.stockCount}:${open.priceCents}:${open.options.map(o => `${o.id}=${o.stockCount}`).join(',')}:${sellable(open).map(s => `${rowOf.get(s.id)?.reorderAt}/${rowOf.get(s.id)?.costCents}`).join(',')}`}
                  item={open} rows={rowOf} categories={categories} canCost={canCost} onCancel={() => pick(null)}
                  onSaved={done} onRemoved={async msg => { await done(msg); setPanel(null); }} />
              : <p className="text-[13px] text-ink-muted">Changing items needs “Edit the shop catalog” from the owner.</p>)}
          </Card>
        </div>
      )}
    </div>
  );
}

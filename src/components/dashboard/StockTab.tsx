'use client';
// POS-6/POS-8 (Cam 2026-11-09: "stock is where everything should be inputed"; "rethink that whole individual items
// tab … organized and efficient"; picked "Lean table + filter chips"). Pro shop → Stock is the ONE place items are
// added and changed. A lean list — photo, name (category and sizes under it), price, on hand, barcode — filtered by
// chips: All · Sold out · Low · Hidden, then each category. Tap a row and it opens in the panel on the right (a full
// sheet on a phone): ItemForm, the same form that adds one. "Add item" or "or add many" (UploadMany: upload what you
// have). Recent deliveries sit behind a link. The register only reads the same list, so a change here shows there.
// Writes: /api/operator/shop-items (shop.catalog), /api/operator/shop-stock (shop.catalog; cost the owner's alone).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { SHOP_SALE_FEE_CENTS, SHOP_FEE_ON } from '@/lib/booking-fees';
import { shopTree, matches, stockOf, type FlatItem, type TreeItem } from '@/lib/shop-tree';
import type { StockRow } from '@/lib/shop-stock';
import { ItemForm } from '@/components/dashboard/ItemForm';
import { UploadMany } from '@/components/dashboard/UploadMany';
import { ShopMenu } from '@/components/dashboard/shop/ShopMenu';

type StockData = { rows: StockRow[]; receipts: { id: string; name: string; quantity: number; unitCostCents?: number | null; receivedBy: string; createdAt: string; note: string }[]; canEdit: boolean; canCost: boolean };
type Panel = { kind: 'item'; id: string; mode: 'view' | 'edit' | 'receive' } | { kind: 'new' } | { kind: 'many' } | null;
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
  const [hiding, setHiding] = useState(false);

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

  const picked = open ?? (panel === null ? shown[0] ?? null : null);
  const showLabel = show === 'all' ? 'Filter' : show === 'out' ? 'Filter: Sold out' : show === 'low' ? 'Filter: Low' : show === 'hidden' ? 'Filter: Hidden' : `Filter: ${show.slice(4)}`;
  /** Stock's line for an item (Cam 2026-11-12 mockup): each size, not counted, sold out, or how many. */
  const onHand = (i: TreeItem) => {
    if (i.options.some(o => o.active)) return { text: 'Each size', tone: isOut(i) ? 'bad' : isLow(i) ? 'warn' : '' };
    if (i.stockCount === null) return { text: 'Not counted', tone: '' };
    if (i.stockCount <= 0) return { text: 'Sold out', tone: 'bad' };
    return { text: `${i.stockCount.toLocaleString()} in stock`, tone: isLow(i) ? 'warn' : '' };
  };
  const counted = (i: TreeItem) => i.stockCount !== null || sellable(i).some(o => o.stockCount !== null);
  async function hide(i: TreeItem) {
    setHiding(true); setError(''); setNote('');
    const r = await dfetch('/api/operator/shop-items', { method: 'PATCH', body: JSON.stringify({ id: i.id, active: !i.active }) });
    if (!r.ok) { setHiding(false); setError(r.error); return; }
    // Held until the list reloads, so a second tap can't land on the next item.
    await done(i.active ? `${i.name} hidden from the register.` : `${i.name} back on the register.`);
    setHiding(false);
  }
  const thumb = (i: TreeItem, big = false) => i.photoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={i.photoUrl} alt="" loading="lazy" className={big ? 'block w-full aspect-[4/3] rounded-[12px] object-contain bg-page mb-3' : 'w-10 h-10 rounded-[8px] object-cover bg-page'} />
    : <span aria-hidden="true" className={big ? 'flex w-full aspect-[4/3] rounded-[12px] bg-page items-center justify-center text-[28px] font-bold text-ink-soft mb-3' : 'flex w-10 h-10 rounded-[8px] bg-page items-center justify-center text-[12px] font-bold text-ink-soft'}>{initials(i.name)}</span>;

  return (
    // IMPORT-2: "add many" is a wide table — it takes the page's width above the list instead of the side card.
    <div className={'grid gap-4 lg:items-start ' + (panel?.kind === 'many' ? '' : 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
      <Card className="p-4 min-w-0 relative z-10">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex-1 min-w-0 flex items-center gap-2 bg-page border border-line rounded-[10px] px-3 min-h-[38px] text-ink-muted">
            <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <input value={find} onChange={e => setFind(e.target.value)} aria-label="Find an item or barcode" className="flex-1 min-w-0 bg-transparent text-[13.5px] text-ink outline-none" />
          </label>
          <ShopMenu label={showLabel} ariaLabel="Filter items" onPick={k => setShow(k as Show)} sections={[
            [{ key: 'all', label: 'All', count: counts.all, on: show === 'all' },
              ...(counts.out ? [{ key: 'out', label: 'Sold out', count: counts.out, on: show === 'out' }] : []),
              ...(counts.low ? [{ key: 'low', label: 'Low', count: counts.low, on: show === 'low' }] : []),
              ...(counts.hidden ? [{ key: 'hidden', label: 'Hidden', count: counts.hidden, on: show === 'hidden' }] : [])],
            categories.length > 1 ? categories.map(c => ({ key: `cat:${c}`, label: c, on: show === `cat:${c}` })) : [],
          ]} />
          {canEdit && <ShopMenu label="+ Add" primary align="right" onPick={k => pick(k === 'many' ? { kind: 'many' } : { kind: 'new' })} sections={[[
            { key: 'one', label: 'One item', sub: 'Name, price, photo, stock' },
            { key: 'many', label: 'Many at once', sub: 'Paste or upload a list' },
          ]]} />}
        </div>
        {SHOP_FEE_ON && <p className="mt-2 text-[12.5px] text-ink-muted">GreenReserve adds {usd(SHOP_SALE_FEE_CENTS)} a sale, paid by the golfer.</p>}
        {loadError && <div className="mt-3"><LoadError message={`Couldn't load your items — ${loadError}`} onRetry={load} /></div>}
        {(error || note) && !panel && (
          <div className="mt-3" aria-live="polite">
            {error && <p role="alert" className="text-[12.5px] text-bad">{error}</p>}
            {note && <p className="text-[12.5px] text-ok">{note}</p>}
          </div>
        )}
        {tree.length === 0 ? <p className="mt-4 text-[13px] text-ink-muted">No items yet.</p> : (
          <ul className="mt-2">
            {shown.map(i => {
              const oh = onHand(i);
              // Tapped = highlighted everywhere; the first item shown beside the list on a laptop only there.
              const on = open?.id === i.id ? 'bg-page ring-1 ring-inset ring-line' : !panel && picked?.id === i.id ? 'lg:bg-page lg:ring-1 lg:ring-inset lg:ring-line' : '';
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => pick({ kind: 'item', id: i.id, mode: 'view' })} aria-current={open?.id === i.id ? 'true' : undefined}
                    className={'w-full text-left grid grid-cols-[40px_minmax(0,1fr)_auto_72px] items-center gap-3 px-2.5 py-2.5 rounded-[10px] hover:bg-page ' + on}>
                    {thumb(i)}
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink">{i.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">{[i.category, i.active ? '' : 'Hidden'].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={'text-[13px] whitespace-nowrap ' + (oh.tone === 'bad' ? 'text-bad' : 'text-ink-muted')}>
                      {oh.tone === 'warn' ? <StatusDot status="warn" label={`Low · ${oh.text}`} /> : oh.text}
                    </span>
                    <span className="text-right text-[14px] font-semibold text-ink tabular-nums">{usd(i.priceCents)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tree.length > 0 && shown.length === 0 && <p className="text-[13px] text-ink-muted py-3">Nothing here.</p>}
        {stock.receipts.length > 0 && (
          <div className="mt-4">
            <button type="button" onClick={() => setDeliveries(d => !d)} aria-expanded={deliveries} className="text-[13px] font-medium text-ink-soft hover:text-ink underline underline-offset-4">Recent deliveries</button>
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

      {(panel || picked) && (
        // The picked item beside the list on a laptop (the first one until one is tapped); a full sheet on a phone, only
        // once something is tapped.
        <div className={(panel ? 'fixed inset-0 z-40 bg-page overflow-y-auto p-4 ' : 'hidden ') + 'lg:block lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-visible ' + (panel?.kind === 'many' ? 'lg:order-first' : 'lg:sticky lg:top-6')}>
          <Card className="p-4">
            {/* Review 2026-11-12: what saved and what didn't, in the panel itself — on a phone it covers the list. */}
            {panel && (note || (error && panel.kind !== 'many')) && (
              <div className="mb-3" aria-live="polite">
                {note && <p className="text-[12.5px] text-ok">{note}</p>}
                {error && panel.kind !== 'many' && <p role="alert" className="text-[12.5px] text-bad">{error}</p>}
              </div>
            )}
            {panel && (
              <div className="flex justify-end -mt-1 -mr-1 lg:hidden">
                <button type="button" onClick={() => pick(null)} aria-label="Close" className="p-1 text-ink-soft hover:text-ink"><X className="w-4 h-4" /></button>
              </div>
            )}
            {(panel?.kind === 'new' || panel?.kind === 'many' || (panel?.kind === 'item' && panel.mode !== 'view' && open)) && (
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-[15px] font-semibold text-ink truncate">{panel.kind === 'new' ? 'Add an item' : panel.kind === 'many' ? 'Add many items' : panel.mode === 'receive' ? `Receive ${open?.name}` : open?.name}</h2>
                <button type="button" onClick={() => pick(panel.kind === 'item' ? { kind: 'item', id: panel.id, mode: 'view' } : null)} aria-label="Close" className="p-1 text-ink-soft hover:text-ink hidden lg:block"><X className="w-4 h-4" /></button>
              </div>
            )}
            {panel?.kind === 'new' && (
              <ItemForm key={`new-${counts.all}`} rows={rowOf} categories={categories} canCost={canCost} onCancel={() => pick(null)} onSaved={done} />
            )}
            {panel?.kind === 'many' && (
              <UploadMany canCost={canCost} onAdd={async rows => {
                const r = await dfetch<{ created?: number }>('/api/operator/shop-items', { method: 'POST', body: JSON.stringify({ items: rows }) });
                if (!r.ok) { setError(r.error); setNote(''); return false; }
                await done(`${rows.length} item${rows.length === 1 ? '' : 's'} added.`);
                return true;
              }} />
            )}
            {panel?.kind === 'many' && error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
            {panel?.kind === 'item' && !open && <p className="text-[13px] text-ink-muted">That item is gone.</p>}
            {panel?.kind === 'item' && panel.mode !== 'view' && open && (canEdit
              // keyed on what's stored, so a reload after a save (or a sale) shows the new numbers, never stale ones
              ? <ItemForm key={`${panel.mode}:${open.id}:${open.stockCount}:${open.priceCents}:${open.options.map(o => `${o.id}=${o.stockCount}`).join(',')}:${sellable(open).map(s => `${rowOf.get(s.id)?.reorderAt}/${rowOf.get(s.id)?.costCents}`).join(',')}`}
                  item={open} rows={rowOf} categories={categories} canCost={canCost} receive={panel.mode === 'receive'} onCancel={() => pick({ kind: 'item', id: open.id, mode: 'view' })}
                  onSaved={async (m, f) => { await done(m, f); setPanel({ kind: 'item', id: open.id, mode: 'view' }); }} onRemoved={async msg => { await done(msg); setPanel(null); }} />
              : <p className="text-[13px] text-ink-muted">Changing items needs “Edit the shop catalog” from the owner.</p>)}
            {picked && (!panel || (panel.kind === 'item' && panel.mode === 'view')) && (
              <div>
                {thumb(picked, true)}
                <h2 className="text-[20px] font-semibold text-ink leading-tight">{picked.name}</h2>
                <p className="text-[13px] text-ink-muted mt-1 mb-3">{[picked.category, picked.active ? '' : 'Hidden from the register'].filter(Boolean).join(' · ') || ' '}</p>
                <dl className="text-[13.5px]">
                  <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="text-ink-soft">Price</dt><dd className="font-semibold text-ink tabular-nums">{usd(picked.priceCents)}</dd></div>
                  <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="text-ink-soft">In stock</dt>
                    <dd className={'font-semibold tabular-nums text-right ' + (isOut(picked) ? 'text-bad' : 'text-ink')}>
                      {picked.options.some(o => o.active)
                        ? picked.options.filter(o => o.active).map(o => `${o.optionLabel} ${o.stockCount === null ? '—' : Math.max(0, o.stockCount)}`).join(' · ')
                        : picked.stockCount === null ? 'Not counted' : picked.stockCount <= 0 ? 'Sold out' : picked.stockCount.toLocaleString()}
                    </dd></div>
                  <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="text-ink-soft">Barcode</dt><dd className="font-semibold text-ink tabular-nums">{picked.sku || (picked.options.some(o => o.sku) ? 'Each size' : '—')}</dd></div>
                </dl>
                {canEdit && (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button type="button" onClick={() => pick({ kind: 'item', id: picked.id, mode: 'edit' })} className={'min-h-[40px] rounded-[10px] bg-pine hover:bg-pine-hover text-white text-[13.5px] font-semibold ' + (counted(picked) ? '' : 'col-span-2')}>Edit</button>
                      {counted(picked) && <button type="button" onClick={() => pick({ kind: 'item', id: picked.id, mode: 'receive' })} className="min-h-[40px] rounded-[10px] border border-line text-ink text-[13.5px] font-semibold hover:bg-page">Receive stock</button>}
                    </div>
                    <button type="button" onClick={() => hide(picked)} disabled={hiding} className="block mx-auto mt-3 text-[12.5px] text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-50">{hiding ? 'Saving…' : picked.active ? 'Hide from the register' : 'Show on the register'}</button>
                  </>
                )}
                {!canEdit && canCost && <p className="mt-3 text-[12.5px] text-ink-muted">Changing items needs “Edit the shop catalog” from the owner.</p>}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';
// POS-6 (Cam 2026-11-09: "stock is where everything should be inputed so picture quantity price barcode etc etc
// and then it should automatically go to the other tab — stuff shouldnt be inputed to the register tab"; picked
// "One table + side editor"): Pro shop → Stock is the ONE place items are added and changed. A row per item —
// photo, item, price, on hand, reorder at, cost (the owner), barcode; tap a row and it opens in a panel on the
// right (a full sheet on a phone) with the item's details, its stock (deliveries, reorder point, cost) and
// Hide / Delete. The register only reads the same list (/api/operator/shop-items), so a change here shows there.
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
import { shopTree, matches, stockOf, stockWords, type FlatItem, type TreeItem } from '@/lib/shop-tree';
import type { StockRow } from '@/lib/shop-stock';
import { ItemEditor, ItemPhoto, BulkAdd, STARTERS, emptyDraft, draftOf } from '@/components/dashboard/ShopCatalog';

type StockData = { rows: StockRow[]; receipts: { id: string; name: string; quantity: number; unitCostCents?: number | null; receivedBy: string; createdAt: string; note: string }[]; canEdit: boolean; canCost: boolean };
type Panel = { kind: 'item'; id: string } | { kind: 'new' } | { kind: 'many' } | null;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const dollars = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));
const toCents = (s: string) => { const t = s.trim(); if (!t) return ''; const n = Math.round(Number(t) * 100); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const LBL = 'block text-[12.5px] text-ink-soft mb-1';

/** One sellable row's stock: a delivery (adds and logs), its reorder point, its cost (the owner). */
function StockFields({ row, label, canEdit, canCost, onSaved }: { row: StockRow; label: string; canEdit: boolean; canCost: boolean; onSaved: (msg: string) => void }) {
  const [came, setCame] = useState('');
  const [unit, setUnit] = useState('');
  const [reorder, setReorder] = useState(row.reorderAt == null ? '' : String(row.reorderAt));
  const [cost, setCost] = useState(dollars(row.costCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function post(body: Record<string, unknown>) {
    const r = await dfetch('/api/operator/shop-stock', { method: 'POST', body: JSON.stringify({ itemId: row.id, ...body }) });
    if (!r.ok) { setError(r.error); return false; }
    return true;
  }
  async function save() {
    setBusy(true); setError('');
    let ok = true;
    if (unit.trim() && !came.trim()) { setError('Enter how many came in.'); setBusy(false); return; }
    if (came.trim()) {
      const u = canCost ? toCents(unit) : '';
      if (Number.isNaN(u)) { setError('Enter the cost of one as an amount.'); setBusy(false); return; }
      ok = await post({ action: 'receive', quantity: Number(came), ...(u !== '' ? { unitCostCents: u } : {}) });
    }
    const ro = reorder.trim() === '' ? null : Number(reorder);
    if (ok && canEdit && ro !== row.reorderAt) ok = await post({ action: 'reorder', reorderAt: ro });
    if (ok && canCost && !unit.trim()) {
      const c = toCents(cost);
      if (Number.isNaN(c)) { setError('Enter the cost as an amount, or leave it blank.'); setBusy(false); return; }
      if ((c === '' ? null : c) !== (row.costCents ?? null)) ok = await post({ action: 'cost', costCents: c === '' ? null : c });
    }
    setBusy(false);
    if (ok) { setCame(''); setUnit(''); onSaved(`${label} saved.`); }
  }
  const out = row.stockCount !== null && row.stockCount <= 0;
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="font-medium text-ink">{label}</span>
        <span className={'tabular-nums ' + (out ? 'text-bad font-semibold' : row.low ? 'text-warn font-semibold' : 'text-ink-muted')}>{row.stockCount === null ? 'Not counted' : out ? stockWords(row.stockCount) : `${row.stockCount} on hand`}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {canEdit && <label className="text-[12.5px] text-ink-soft">Came in<input value={came} onChange={e => setCame(e.target.value)} inputMode="numeric" placeholder="0" className={INPUT + ' block mt-1 w-20 tabular-nums'} /></label>}
        {canEdit && canCost && <label className="text-[12.5px] text-ink-soft">Cost of one<input value={unit} onChange={e => setUnit(e.target.value)} inputMode="decimal" placeholder={dollars(row.costCents)} className={INPUT + ' block mt-1 w-24 tabular-nums'} /></label>}
        {canEdit && <label className="text-[12.5px] text-ink-soft">Reorder at<input value={reorder} onChange={e => setReorder(e.target.value)} inputMode="numeric" placeholder="—" className={INPUT + ' block mt-1 w-20 tabular-nums'} /></label>}
        {canCost && !unit.trim() && <label className="text-[12.5px] text-ink-soft">Cost<input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="—" className={INPUT + ' block mt-1 w-24 tabular-nums'} /></label>}
        <button type="button" onClick={save} disabled={busy} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

export function StockTab({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const access = useDashboardAccess();
  const [flat, setFlat] = useState<FlatItem[] | null>(null);
  const [stock, setStock] = useState<StockData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [find, setFind] = useState('');
  const [cat, setCat] = useState('');
  const [formKey, setFormKey] = useState(0);

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
  const shown = useMemo(() => tree
    .filter(i => matches(i, find) && (!cat || i.category === cat))
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name)), [tree, find, cat]);

  const canEdit = access.can('shop.catalog');
  const canCost = !!stock?.canCost;
  const canOpen = canEdit || canCost;
  if (loadError && !flat) return <LoadError message={`Couldn't load your items — ${loadError}`} onRetry={load} />;
  if (!flat || !stock) return <Card className="p-5"><p className="text-[13px] text-ink-muted">Loading your items…</p></Card>;

  /** The item's sellable rows: itself, or each of its active options. */
  const sellable = (i: TreeItem) => (i.options.length ? i.options.filter(o => o.active).map(o => ({ row: rowOf.get(o.id), label: o.optionLabel })) : [{ row: rowOf.get(i.id), label: i.name }]);
  const outOf = (i: TreeItem) => sellable(i).some(s => s.row && s.row.stockCount !== null && s.row.stockCount <= 0);
  const lowOf = (i: TreeItem) => !outOf(i) && sellable(i).some(s => s.row?.low);
  const out = tree.filter(i => i.active && outOf(i));
  const low = tree.filter(i => i.active && lowOf(i));
  const names = (rs: TreeItem[]) => rs.slice(0, 3).map(r => r.name).join(', ') + (rs.length > 3 ? '…' : '');
  const open = panel?.kind === 'item' ? tree.find(i => i.id === panel.id) ?? null : null;
  // Review: a reload that fails after a save says so (the list would otherwise show the old rows under "saved").
  const done = async (msg: string) => { setError(''); onChanged?.(); setNote((await load()) ? msg : ''); }; // a failed reload shows the load error with Retry, never "saved" over old rows

  async function write(key: string, method: 'POST' | 'PATCH' | 'DELETE', body: object, msg: string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<{ hidden?: boolean; created?: number }>('/api/operator/shop-items', { method, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return false; }
    await done(method === 'DELETE' && r.data?.hidden ? 'That item has been sold before, so it was hidden instead of deleted.' : msg);
    return true;
  }
  const pick = (p: Panel) => { setPanel(p); setError(''); setNote(''); };
  const startersLeft = STARTERS.filter(st => !tree.some(i => i.name.toLowerCase() === st.name.toLowerCase()));

  return (
    <div className={'grid gap-4 lg:items-start ' + (panel ? 'lg:grid-cols-[minmax(0,1fr)_420px]' : '')}>
      <Card className="p-5 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Items</h2>
          {out.length > 0 && <StatusDot status="bad" label={`${out.length} sold out: ${names(out)}`} />}
          {low.length > 0 && <StatusDot status="warn" label={`${low.length} low: ${names(low)}`} />}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find an item, size or barcode" aria-label="Find an item" className={INPUT + ' w-56'} />
            {canEdit && <button type="button" onClick={() => pick({ kind: 'new' })} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-2">Add item</button>}
            {canEdit && <button type="button" onClick={() => pick({ kind: 'many' })} className="text-[13px] text-ink border border-line rounded-md px-3 py-2 hover:border-pine/40">Add many</button>}
          </div>
        </div>
        {loadError && <div className="mt-3"><LoadError message={`Couldn't load your items — ${loadError}`} onRetry={load} /></div>}
        {SHOP_FEE_ON && <p className="mt-2 text-[12.5px] text-ink-muted">GreenReserve adds {usd(SHOP_SALE_FEE_CENTS)} a sale, paid by the golfer.</p>}
        {categories.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Category">
            {['', ...categories].map(c => (
              <button key={c || 'all'} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                className={'text-[13px] rounded-[7px] px-3 min-h-[32px] ' + (cat === c ? 'bg-ink text-white font-medium' : 'bg-page text-ink-soft hover:text-ink')}>{c || 'All'}</button>
            ))}
          </div>
        )}
        {(error || note) && !panel && (
          <div className="mt-3" aria-live="polite">
            {error && <p role="alert" className="text-[12.5px] text-bad">{error}</p>}
            {note && <p className="text-[12.5px] text-ok">{note}</p>}
          </div>
        )}
        {canEdit && startersLeft.length > 0 && tree.length < 10 && (
          <div className="mt-4">
            <p className="text-[12.5px] text-ink-soft mb-1.5">Quick add — tap one, then fix its price:</p>
            <div className="flex flex-wrap gap-1.5">
              {startersLeft.map(st => (
                <button key={st.name} type="button" disabled={busy !== null} onClick={() => write(`q-${st.name}`, 'POST', st, `${st.name} added at ${usd(st.priceCents)} — edit it if your price differs.`)}
                  className="text-[12.5px] text-ink border border-line rounded-md px-2.5 py-1 hover:border-pine/40 disabled:opacity-50">{st.name} · {usd(st.priceCents)}</button>
              ))}
            </div>
          </div>
        )}
        {tree.length === 0 ? <p className="mt-4 text-[13px] text-ink-muted">No items yet.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-[12.5px] text-ink-muted border-b border-line-soft">
                  <th className="py-2 pr-3 font-medium w-12"><span className="sr-only">Photo</span></th>
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium text-right">Price</th>
                  <th className="py-2 pr-3 font-medium text-right">On hand</th>
                  <th className="py-2 pr-3 font-medium text-right">Reorder at</th>
                  {canCost && <th className="py-2 pr-3 font-medium text-right">Cost</th>}
                  <th className="py-2 font-medium">Barcode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {shown.map(i => {
                  const n = stockOf(i);
                  const own = i.options.length ? null : rowOf.get(i.id);
                  const opts = i.options.filter(o => o.active);
                  const isOut = outOf(i), isLow = lowOf(i);
                  return (
                    <tr key={i.id} onClick={canOpen ? () => pick({ kind: 'item', id: i.id }) : undefined} aria-selected={open?.id === i.id}
                      className={(canOpen ? 'cursor-pointer hover:bg-page/60 ' : '') + (open?.id === i.id ? 'bg-page/80' : '') + (i.active ? '' : ' text-ink-muted')}>
                      <td className="py-2 pr-3">
                        {i.photoUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={i.photoUrl} alt="" loading="lazy" className="w-9 h-9 rounded-[5px] object-cover bg-paper" />
                          : <span aria-hidden="true" className="flex w-9 h-9 rounded-[5px] bg-paper items-center justify-center text-[11px] font-semibold text-ink-faint">{i.name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {canOpen ? <button type="button" className="text-left text-ink font-medium hover:underline underline-offset-4" onClick={e => { e.stopPropagation(); pick({ kind: 'item', id: i.id }); }}>{i.name}</button> : <span className="text-ink font-medium">{i.name}</span>}
                        <span className="block text-[12px] text-ink-muted">{[i.category, opts.length ? opts.map(o => o.optionLabel).join(' · ') : '', i.active ? '' : 'hidden'].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="py-2 pr-3 text-right text-ink">{usd(i.priceCents)}</td>
                      <td className={'py-2 pr-3 text-right ' + (isOut ? 'text-bad font-semibold' : isLow ? 'text-warn font-semibold' : 'text-ink')}>
                        {isOut && <StatusDot status="bad" label="" />}{isLow && <StatusDot status="warn" label="" />} {n === null ? '—' : n <= 0 ? stockWords(n) : n}
                      </td>
                      <td className="py-2 pr-3 text-right text-ink-muted">{own ? own.reorderAt ?? '—' : opts.length ? 'Each size' : '—'}</td>
                      {canCost && <td className="py-2 pr-3 text-right text-ink-muted">{own ? (own.costCents == null ? '—' : usd(own.costCents)) : opts.length ? 'Each size' : '—'}</td>}
                      <td className="py-2 text-ink-muted">{i.sku || (opts.some(o => o.sku) ? 'Each size' : '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="text-[13px] text-ink-muted py-2">Nothing matches.</p>}
          </div>
        )}
        {stock.receipts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[13.5px] font-semibold text-ink mb-1">Deliveries</h3>
            <ul className="divide-y divide-line-soft text-[13px]">
              {stock.receipts.slice(0, 10).map(x => (
                <li key={x.id} className="flex flex-wrap gap-x-3 py-1.5">
                  <span className="text-ink-muted w-24">{new Date(x.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="text-ink">{x.name}</span>
                  <span className="tabular-nums">+{x.quantity}</span>
                  {x.unitCostCents != null && <span className="text-ink-muted tabular-nums">{usd(x.unitCostCents)} each</span>}
                  <span className="ml-auto text-ink-muted">{x.receivedBy}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {panel && (
        // A card beside the table on a laptop; a full sheet on a phone.
        <div className="fixed inset-0 z-40 bg-page overflow-y-auto p-4 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 lg:sticky lg:top-6">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink truncate">{panel.kind === 'new' ? 'Add an item' : panel.kind === 'many' ? 'Add many at once' : open?.name ?? 'Item'}</h2>
              <button type="button" onClick={() => pick(null)} aria-label="Close" className="p-1 text-ink-soft hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            {(error || note) && (
              <div className="mt-2" aria-live="polite">
                {error && <p role="alert" className="text-[12.5px] text-bad">{error}</p>}
                {note && <p className="text-[12.5px] text-ok">{note}</p>}
              </div>
            )}
            {panel.kind === 'new' && (
              <div className="mt-3">
                <ItemEditor key={formKey} initial={emptyDraft()} categories={categories} busy={busy === 'new'} submitLabel="Add item"
                  onSubmit={async b => { if (await write('new', 'POST', b, `${b.name} added — add its photo and stock from its row.`)) setFormKey(k => k + 1); }} onCancel={() => pick(null)} />
              </div>
            )}
            {panel.kind === 'many' && (
              <div className="mt-3">
                <BulkAdd busy={busy === 'bulk'} onAdd={rows => write('bulk', 'POST', { items: rows.map(({ note: _n, key: _k, priceText: _p, ...r }) => r) }, `${rows.length} item${rows.length === 1 ? '' : 's'} added.`)} />
              </div>
            )}
            {panel.kind === 'item' && !open && <p className="mt-3 text-[13px] text-ink-muted">That item is gone.</p>}
            {open && (
              <div className="mt-3 divide-y divide-line-soft">
                <div className="pb-4 flex items-center gap-3">
                  {canEdit ? <ItemPhoto item={open} onChanged={() => done(`${open.name}'s photo saved.`)} onError={m => { setNote(''); setError(m); }} /> : null}
                  <span className="text-[12.5px] text-ink-muted">{canEdit ? 'Photo on the register tile' : `${usd(open.priceCents)}${open.category ? ` · ${open.category}` : ''}`}</span>
                </div>
                {canEdit && (
                  <div className="py-4">
                    <ItemEditor key={open.id} initial={draftOf(open)} categories={categories} busy={busy === open.id} submitLabel="Save"
                      onSubmit={b => write(open.id, 'PATCH', { id: open.id, ...b }, `${b.name} saved.`)} />
                  </div>
                )}
                {(canEdit || canCost) && (
                  <div className="py-2">
                    <h3 className="pt-2 text-[13.5px] font-semibold text-ink">Stock</h3>
                    {sellable(open).map(s => s.row
                      ? <StockFields key={`${s.row.id}-${s.row.stockCount}-${s.row.reorderAt}-${s.row.costCents}`} row={s.row} label={s.label} canEdit={canEdit && stock.canEdit} canCost={canCost} onSaved={done} />
                      : <p key={s.label} className="py-3 text-[13px] text-ink-muted">{open.active ? `${s.label}: no stock yet.` : 'Show it on the register to count its stock.'}</p>)}
                  </div>
                )}
                {canEdit && (
                  <div className="pt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => write(open.id, 'PATCH', { id: open.id, active: !open.active }, open.active ? `${open.name} hidden from the register.` : `${open.name} back on the register.`)}
                      className="text-[13px] text-ink border border-line rounded-md px-3 py-1.5 hover:border-pine/40 disabled:opacity-50">{open.active ? 'Hide from the register' : 'Show on the register'}</button>
                    <button type="button" disabled={busy !== null} onClick={async () => { if (confirm(`Delete ${open.name}${open.options.length ? ' and all its sizes' : ''}?`) && await write(open.id, 'DELETE', { id: open.id }, `${open.name} deleted.`)) setPanel(null); }}
                      className="text-[13px] text-bad hover:bg-bad/5 rounded-md px-3 py-1.5 disabled:opacity-50">Delete</button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

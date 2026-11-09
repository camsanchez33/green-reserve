'use client';
// POS-8 (Cam 2026-11-09: Add item and the item panel "need to look and operate so much better … more organized and
// direct"; picked "Top-to-bottom form"). ONE form adds an item and edits one, in the order it's filled in: photo →
// name and price → category → stock (on hand · reorder at · cost, "+ Log a delivery") → barcode → sizes → More (tax
// type). One Save writes everything: the item (/api/operator/shop-items), then its photo, delivery, reorder point and
// cost (/api/operator/shop-stock — cost is the owner's; the route enforces it). Each write that fails says which part
// didn't save; the parts before it stay saved.
import { useEffect, useMemo, useRef, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { parsePriceCents } from '@/lib/shop-import';
import { TAX_CATEGORIES } from '@/lib/tax-categories';
import { downscaleImage } from '@/lib/image-resize';
import type { TreeItem } from '@/lib/shop-tree';
import type { StockRow } from '@/lib/shop-stock';

const TAX_OPTIONS = Object.entries(TAX_CATEGORIES) as [string, { label: string; hint: string }][];
const LBL = 'block text-[12.5px] text-ink-soft mb-1';
const SECTION = 'pt-4 mt-4 border-t border-line-soft';
const dollars = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));
const whole = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) && n >= 0 ? n : NaN; };
const money = (s: string) => { const t = s.trim(); if (!t) return null; const c = parsePriceCents(t); return c === null || Number.isNaN(c) ? NaN : c; };

type Opt = { id?: string; label: string; price: string; onHand: string; sku: string; reorder: string; cost: string; touched?: boolean };

/** Upload a photo onto an item (shrunk first — Vercel refuses a body over 4.5 MB). */
async function uploadPhoto(itemId: string, file: File): Promise<string> {
  const fd = new FormData(); fd.append('itemId', itemId);
  try {
    fd.append('file', await downscaleImage(file));
    const r = await fetch('/api/operator/shop-items/photo', { method: 'POST', body: fd });
    const d = await r.json().catch(() => ({}));
    return r.ok ? '' : (d.error || 'The photo didn’t upload — try again.');
  } catch { return 'The photo didn’t upload — try again.'; }
}

export function ItemForm({ item, rows, categories, canCost, onSaved, onCancel, onRemoved }: {
  /** The item to edit; absent = a new item. */
  item?: TreeItem;
  /** Its stock rows (reorder point, cost), by item or option id. */
  rows: Map<string, StockRow>;
  categories: string[];
  canCost: boolean;
  /** After a save: what to say, and what didn't save (shown by the page, so a reload can't wipe it). */
  onSaved: (msg: string, failed?: string) => Promise<void> | void;
  onCancel: () => void;
  onRemoved?: (msg: string) => void;
}) {
  const own = item && !item.options.length ? rows.get(item.id) : undefined;
  const activeOpts = useMemo(() => (item?.options ?? []).filter(o => o.active), [item]);
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(dollars(item?.priceCents));
  const [category, setCategory] = useState(item?.category ?? '');
  const [newCat, setNewCat] = useState(false);
  const [onHand, setOnHand] = useState(item && !activeOpts.length && item.stockCount !== null ? String(Math.max(0, item.stockCount)) : '');
  const [reorder, setReorder] = useState(own?.reorderAt == null ? '' : String(own.reorderAt));
  const [cost, setCost] = useState(dollars(own?.costCents));
  const [sku, setSku] = useState(item?.sku ?? '');
  const [tax, setTax] = useState(item?.taxCategory ?? 'general');
  const [more, setMore] = useState(false);
  const [sized, setSized] = useState(activeOpts.length > 0);
  const [opts, setOpts] = useState<Opt[]>(activeOpts.map(o => {
    const r = rows.get(o.id);
    return { id: o.id, label: o.optionLabel, price: o.priceCents === item!.priceCents ? '' : dollars(o.priceCents), onHand: o.stockCount === null ? '' : String(Math.max(0, o.stockCount)), sku: o.sku, reorder: r?.reorderAt == null ? '' : String(r.reorderAt), cost: dollars(r?.costCents) };
  }));
  const [sizesText, setSizesText] = useState('');
  const [delivery, setDelivery] = useState<{ optId: string; came: string; unit: string } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!photo) { setPreview(''); return; } const u = URL.createObjectURL(photo); setPreview(u); return () => URL.revokeObjectURL(u); }, [photo]);

  const setOpt = (i: number, k: keyof Opt, v: string) => setOpts(os => os.map((o, j) => (j === i ? { ...o, [k]: v, ...(k === 'onHand' ? { touched: true } : {}) } : o)));
  // A delivery on a size: that size's On hand goes back to what's stored (the delivery adds to it).
  const deliverTo = (optId: string) => {
    const was = item?.options.find(o => o.id === optId)?.stockCount;
    setOpts(os => os.map(o => (o.id === optId ? { ...o, onHand: was == null ? '' : String(Math.max(0, was)), touched: false } : o)));
    setDelivery(d => ({ optId, came: d?.came ?? '', unit: d?.unit ?? '' }));
  };
  // A count is written only when staff edited it (typing 0 on an item sold past 0 is a real recount); untouched = kept.
  const [onHandTouched, setOnHandTouched] = useState(false);
  function addSizes() {
    const labels = sizesText.split(/\s*[,/|]\s*/).map(s => s.trim()).filter(Boolean);
    setOpts(os => [...os, ...labels.filter(l => !os.some(o => o.label.toLowerCase() === l.toLowerCase())).map(label => ({ label, price: '', onHand: '', sku: '', reorder: '', cost: '' }))]);
    setSizesText('');
  }

  async function save() {
    setError('');
    const priceCents = money(price);
    if (!name.trim()) { setError('Give the item a name.'); return; }
    if (priceCents === null || Number.isNaN(priceCents) || priceCents <= 0) { setError('Enter the price.'); return; }
    if (sized && !opts.length) { setError('Add at least one size or color, or untick "Comes in sizes or colors".'); return; }
    const count = whole(onHand), ro = whole(reorder), c = canCost ? money(cost) : null;
    if (Number.isNaN(count)) { setError('On hand is a whole number.'); return; }
    if (Number.isNaN(ro)) { setError('Reorder at is a whole number.'); return; }
    if (Number.isNaN(c)) { setError('Enter the cost as an amount, or leave it blank.'); return; }
    for (const o of opts) if ([whole(o.onHand), whole(o.reorder)].some(Number.isNaN) || [money(o.price), canCost ? money(o.cost) : null].some(Number.isNaN)) { setError(`Check the numbers for ${o.label}.`); return; }
    const came = delivery ? whole(delivery.came) : null, unit = delivery && canCost ? money(delivery.unit) : null;
    if (delivery && (came === null || Number.isNaN(came) || came <= 0)) { setError('Enter how many came in.'); return; }
    if (Number.isNaN(unit)) { setError('Enter the cost of one as an amount, or leave it blank.'); return; }

    setBusy(true);
    // A delivery adds to the count, so the count itself isn't also changed in the same save.
    // An On hand left as shown — or one a delivery is being logged on — is KEPT: the server leaves the stored count alone
    // (keepStock), so an oversold item still saves, and a sale made while the form is open isn't written over.
    const kept = (id: string, touched: boolean) => !!id && ((!!delivery && delivery.optId === id) || !touched);
    const body = {
      name: name.trim(), category: category.trim(), priceCents, sku: sized ? '' : sku.trim(), taxCategory: tax,
      stockCount: sized ? null : count, ...(!sized && kept(item?.id ?? '', onHandTouched) ? { keepStock: true } : {}),
      options: sized ? opts.map(o => ({ id: o.id, label: o.label, priceCents: o.price.trim() ? money(o.price) : null, stockCount: whole(o.onHand), sku: o.sku.trim(), ...(o.id && kept(o.id, !!o.touched) ? { keepStock: true } : {}) })) : [],
    };
    const r = item
      ? await dfetch('/api/operator/shop-items', { method: 'PATCH', body: JSON.stringify({ id: item.id, ...body }) })
      : await dfetch<{ ids: string[] }>('/api/operator/shop-items', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    const id = item?.id ?? (r.data as { ids?: string[] }).ids?.[0];
    const fails: string[] = [];
    const stock = async (b: Record<string, unknown>, what: string) => { const x = await dfetch('/api/operator/shop-stock', { method: 'POST', body: JSON.stringify(b) }); if (!x.ok) fails.push(`${what}: ${x.error}`); };
    if (id) {
      if (photo) { const e = await uploadPhoto(id, photo); if (e) fails.push(`Photo: ${e}`); }
      if (!sized) {
        if (delivery && came) await stock({ action: 'receive', itemId: id, quantity: came, ...(unit !== null ? { unitCostCents: unit } : {}) }, 'Delivery');
        if (ro !== (own?.reorderAt ?? null)) await stock({ action: 'reorder', itemId: id, reorderAt: ro }, 'Reorder at');
        if (canCost && !(delivery && unit !== null) && c !== (own?.costCents ?? null)) await stock({ action: 'cost', itemId: id, costCents: c }, 'Cost');
      } else if (item) {
        // Sizes: reorder point and cost per size; a delivery for the size picked. New sizes get theirs after a reload.
        for (const o of opts) {
          if (!o.id) continue;
          const was = rows.get(o.id);
          if (delivery?.optId === o.id && came) await stock({ action: 'receive', itemId: o.id, quantity: came, ...(unit !== null ? { unitCostCents: unit } : {}) }, `${o.label} delivery`);
          const oro = whole(o.reorder) as number | null;
          if (oro !== (was?.reorderAt ?? null)) await stock({ action: 'reorder', itemId: o.id, reorderAt: oro }, `${o.label} reorder at`);
          const oc = canCost ? money(o.cost) as number | null : null;
          if (canCost && !(delivery?.optId === o.id && unit !== null) && oc !== (was?.costCents ?? null)) await stock({ action: 'cost', itemId: o.id, costCents: oc }, `${o.label} cost`);
        }
      }
    }
    setBusy(false);
    if (fails.length) { await onSaved('', `${name.trim()} saved, but not all of it: ${fails.join(' · ')}`); return; }
    setDelivery(null); setPhoto(null);
    await onSaved(item ? `${name.trim()} saved.` : `${name.trim()} added.`);
  }

  async function removePhoto() {
    if (photo) { setPhoto(null); return; }
    if (!item) return;
    setBusy(true); setError('');
    const r = await dfetch(`/api/operator/shop-items/photo?itemId=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await onSaved(`${item.name}'s photo removed.`);
  }

  async function remove(kind: 'hide' | 'delete') {
    if (!item) return;
    if (kind === 'delete' && !confirm(`Delete ${item.name}${item.options.length ? ' and all its sizes' : ''}?`)) return;
    setBusy(true); setError('');
    const r = kind === 'hide'
      ? await dfetch('/api/operator/shop-items', { method: 'PATCH', body: JSON.stringify({ id: item.id, active: !item.active }) })
      : await dfetch<{ hidden?: boolean }>('/api/operator/shop-items', { method: 'DELETE', body: JSON.stringify({ id: item.id }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onRemoved?.(kind === 'hide' ? (item.active ? `${item.name} hidden from the register.` : `${item.name} back on the register.`) : (r.data as { hidden?: boolean })?.hidden ? 'That item has been sold before, so it was hidden instead of deleted.' : `${item.name} deleted.`);
  }

  const photoUrl = preview || item?.photoUrl || '';
  const stockWord = (n: number | null | undefined) => (n == null ? '' : n < 0 ? `the count says 0 (sold ${-n} past it)` : '');
  const ownPast = !sized ? stockWord(item?.stockCount) : '';
  return (
    <form onSubmit={e => { e.preventDefault(); save(); }}>
      {/* Photo */}
      <div className="flex items-center gap-3">
        <button type="button" aria-label={photoUrl ? 'Change photo' : 'Add a photo'} onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setPhoto(f); }}
          className={'relative w-20 h-20 shrink-0 rounded-[10px] overflow-hidden ' + (photoUrl ? '' : 'border border-dashed border-line-strong bg-paper text-[12px] text-ink-muted')}>
          {photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            : <span>+ Photo</span>}
        </button>
        <span className="flex gap-3 text-[12.5px] text-ink-muted">{photoUrl ? <>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-pine font-medium hover:underline">Replace photo</button>
          <button type="button" disabled={busy} onClick={removePhoto} className="text-ink-soft hover:text-ink disabled:opacity-50">Remove</button>
        </> : 'Drop a photo or tap the box'}</span>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Item photo" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto(f); }} />
      </div>

      {/* Name and price */}
      <div className="mt-4 grid grid-cols-[1fr_7rem] gap-2">
        <label><span className={LBL}>Name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={80} className={INPUT + ' w-full'} autoFocus={!item} /></label>
        <label><span className={LBL}>Price</span>
          <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className={INPUT + ' w-full pl-6 tabular-nums'} /></div></label>
      </div>

      {/* Category */}
      <div className="mt-3">
        <span className={LBL}>Category</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {categories.map(c => (
            <button key={c} type="button" aria-pressed={category === c && !newCat} onClick={() => { setCategory(category === c ? '' : c); setNewCat(false); }}
              className={'text-[13px] rounded-[7px] px-3 min-h-[32px] ' + (category === c && !newCat ? 'bg-ink text-white font-medium' : 'bg-page text-ink-soft hover:text-ink')}>{c}</button>
          ))}
          {newCat
            ? <input value={category} onChange={e => setCategory(e.target.value)} maxLength={40} placeholder="New category" aria-label="New category" className={INPUT + ' w-40'} autoFocus />
            : <button type="button" onClick={() => { setNewCat(true); setCategory(''); }} className="text-[13px] rounded-[7px] px-3 min-h-[32px] text-pine font-medium hover:bg-page">+ New</button>}
        </div>
      </div>

      {/* Stock */}
      {!sized && (
        <div className={SECTION}>
          <h3 className="text-[13.5px] font-semibold text-ink">Stock</h3>
          <div className={'mt-2 grid gap-2 ' + (canCost ? 'grid-cols-3' : 'grid-cols-2')}>
            <label><span className={LBL}>On hand</span><input value={delivery ? String(Math.max(0, item?.stockCount ?? 0)) : onHand} disabled={!!delivery} onChange={e => { setOnHand(e.target.value); setOnHandTouched(true); }} inputMode="numeric" placeholder="Not counted" className={INPUT + ' w-full tabular-nums disabled:opacity-60'} /></label>
            <label><span className={LBL}>Reorder at</span><input value={reorder} onChange={e => setReorder(e.target.value)} inputMode="numeric" placeholder="—" className={INPUT + ' w-full tabular-nums'} /></label>
            {canCost && <label><span className={LBL}>Cost</span>
              <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                <input value={delivery?.unit.trim() ? delivery.unit : cost} disabled={!!delivery?.unit.trim()} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="—" className={INPUT + ' w-full pl-6 tabular-nums disabled:opacity-60'} /></div></label>}
          </div>
          {ownPast && <p className="mt-1.5 text-[12.5px] text-warn">{ownPast} — type what is on the shelf.</p>}
          {item && (delivery ? (
            <div className="mt-2 flex flex-wrap items-end gap-2 bg-paper/70 rounded-[7px] p-2.5">
              <label><span className={LBL}>Came in</span><input value={delivery.came} onChange={e => setDelivery({ ...delivery, came: e.target.value })} inputMode="numeric" className={INPUT + ' w-20 tabular-nums'} autoFocus /></label>
              {canCost && <label><span className={LBL}>Cost of one</span><input value={delivery.unit} onChange={e => setDelivery({ ...delivery, unit: e.target.value })} inputMode="decimal" placeholder={dollars(own?.costCents)} className={INPUT + ' w-24 tabular-nums'} /></label>}
              <button type="button" onClick={() => setDelivery(null)} className="text-[13px] text-ink-soft hover:text-ink px-1 py-1.5">Cancel</button>
            </div>
          ) : <button type="button" onClick={() => { if (onHandTouched) { setOnHand(String(Math.max(0, item.stockCount ?? 0))); setOnHandTouched(false); } setDelivery({ optId: item.id, came: '', unit: '' }); }} className="mt-2 text-[13px] font-medium text-pine hover:underline">+ Log a delivery</button>)}
          {delivery && <p className="mt-1 text-[12px] text-ink-muted">A delivery adds to the count; On hand stays as it is.</p>}
        </div>
      )}

      {/* Barcode */}
      {!sized && (
        <div className={SECTION}>
          <label><span className={LBL}>Barcode</span>
            <input value={sku} onChange={e => setSku(e.target.value)} maxLength={64} placeholder="Scan it or type it" className={INPUT + ' w-full'} /></label>
        </div>
      )}

      {/* Sizes */}
      <div className={SECTION}>
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input type="checkbox" checked={sized} onChange={e => setSized(e.target.checked)} className="w-4 h-4 accent-pine" />
          Comes in sizes or colors
        </label>
        {sized && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input value={sizesText} onChange={e => setSizesText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSizes(); } }} placeholder="S, M, L, XL" aria-label="Sizes or colors, separated by commas" className={INPUT + ' flex-1'} />
              <button type="button" onClick={addSizes} disabled={!sizesText.trim()} className="text-[13px] font-medium text-pine px-2 disabled:opacity-40">Add</button>
            </div>
            {opts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[12px] text-ink-soft"><th className="py-1 pr-2 font-medium">Size</th><th className="py-1 pr-2 font-medium">Price</th><th className="py-1 pr-2 font-medium">On hand</th>{item && <th className="py-1 pr-2 font-medium">Reorder</th>}{item && canCost && <th className="py-1 pr-2 font-medium">Cost</th>}<th className="py-1 pr-2 font-medium">Barcode</th><th /></tr></thead>
                  <tbody>
                    {opts.map((o, i) => (
                      <tr key={o.id ?? `n${i}`}>
                        <td className="py-1 pr-2"><input value={o.label} onChange={e => setOpt(i, 'label', e.target.value)} maxLength={30} aria-label="Size" className={INPUT + ' w-full min-w-[3.5rem]'} /></td>
                        <td className="py-1 pr-2 w-20"><input value={o.price} onChange={e => setOpt(i, 'price', e.target.value)} inputMode="decimal" placeholder={price || 'Same'} aria-label={`${o.label} price`} className={INPUT + ' w-full tabular-nums'} /></td>
                        <td className="py-1 pr-2 w-16"><input value={delivery?.optId === o.id ? (o.onHand || '0') : o.onHand} disabled={delivery?.optId === o.id} onChange={e => setOpt(i, 'onHand', e.target.value)} inputMode="numeric" placeholder="—" aria-label={`${o.label} on hand`} className={INPUT + ' w-full tabular-nums disabled:opacity-60'} /></td>
                        {item && <td className="py-1 pr-2 w-16"><input value={o.reorder} onChange={e => setOpt(i, 'reorder', e.target.value)} inputMode="numeric" placeholder="—" disabled={!o.id} aria-label={`${o.label} reorder at`} className={INPUT + ' w-full tabular-nums disabled:opacity-40'} /></td>}
                        {item && canCost && <td className="py-1 pr-2 w-20"><input value={o.cost} onChange={e => setOpt(i, 'cost', e.target.value)} inputMode="decimal" placeholder="—" disabled={!o.id} aria-label={`${o.label} cost`} className={INPUT + ' w-full tabular-nums disabled:opacity-40'} /></td>}
                        <td className="py-1 pr-2"><input value={o.sku} onChange={e => setOpt(i, 'sku', e.target.value)} maxLength={64} aria-label={`${o.label} barcode`} className={INPUT + ' w-full min-w-[5rem]'} /></td>
                        <td className="py-1 text-right"><button type="button" onClick={() => setOpts(os => os.filter((_, j) => j !== i))} aria-label={`Remove ${o.label}`} className="text-[12.5px] text-ink-soft hover:text-ink px-1">Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {item && opts.some(o => o.id) && (delivery
              ? (
                <div className="flex flex-wrap items-end gap-2 bg-paper/70 rounded-[7px] p-2.5">
                  <label><span className={LBL}>Size</span>
                    <select value={delivery.optId} onChange={e => deliverTo(e.target.value)} className={INPUT}>{opts.filter(o => o.id).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
                  <label><span className={LBL}>Came in</span><input value={delivery.came} onChange={e => setDelivery({ ...delivery, came: e.target.value })} inputMode="numeric" className={INPUT + ' w-20 tabular-nums'} /></label>
                  {canCost && <label><span className={LBL}>Cost of one</span><input value={delivery.unit} onChange={e => setDelivery({ ...delivery, unit: e.target.value })} inputMode="decimal" className={INPUT + ' w-24 tabular-nums'} /></label>}
                  <button type="button" onClick={() => setDelivery(null)} className="text-[13px] text-ink-soft hover:text-ink px-1 py-1.5">Cancel</button>
                </div>
              )
              : <button type="button" onClick={() => deliverTo(opts.find(o => o.id)!.id!)} className="text-[13px] font-medium text-pine hover:underline">+ Log a delivery</button>)}
            {delivery && item && opts.some(o => o.id) && <p className="text-[12px] text-ink-muted">A delivery adds to the count; On hand stays as it is.</p>}
          </div>
        )}
      </div>

      {/* More */}
      <div className={SECTION}>
        <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more} className="text-[13px] text-ink-soft hover:text-ink">More {more ? '▾' : '▸'} <span className="text-ink-muted">· tax type: {TAX_CATEGORIES[tax as keyof typeof TAX_CATEGORIES]?.label ?? tax}</span></button>
        {more && (
          <label className="mt-2 block max-w-xs"><span className={LBL}>Sales tax type</span>
            <select value={tax} onChange={e => setTax(e.target.value)} className={INPUT + ' w-full'}>
              {TAX_OPTIONS.map(([k, c]) => <option key={k} value={k}>{c.label} ({c.hint})</option>)}
            </select></label>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-[12.5px] text-bad">{error}</p>}
      <button type="submit" disabled={busy} className="mt-4 w-full min-h-[44px] bg-pine hover:bg-pine-hover text-white font-medium rounded-[7px] text-[14px] disabled:opacity-50">{busy ? 'Saving…' : item ? 'Save' : 'Add item'}</button>
      <div className="mt-3 flex items-center gap-4 text-[13px]">
        <button type="button" onClick={onCancel} className="text-ink-soft hover:text-ink">Cancel</button>
        {item && <>
          <button type="button" disabled={busy} onClick={() => remove('hide')} className="ml-auto text-ink-soft hover:text-ink disabled:opacity-50">{item.active ? 'Hide from the register' : 'Show on the register'}</button>
          <button type="button" disabled={busy} onClick={() => remove('delete')} className="text-bad hover:underline disabled:opacity-50">Delete</button>
        </>}
      </div>
    </form>
  );
}

'use client';
// POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): the pieces of the shop catalog — the item editor, the
// photo, adding many at once. POS-6 (Cam 2026-11-09, "stock is where everything should be inputed"): they are
// used on Pro shop → Stock (StockTab.tsx), the one place items are added and changed; Settings no longer lists them.
// Each change saves on its own. An item that was ever sold is hidden rather than deleted.
// W2-7 (Cam 2026-10-20: "they need to add a ton of stuff … really think this
// out"): sizes and colors are options of one item; many items go in at once by
// pasting rows, uploading a CSV, or having the AI read a list or invoice — all
// three land in one preview to check before anything is added.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { parseImport, parsePriceCents, type ImportItem } from '@/lib/shop-import';
import type { FlatItem, TreeItem } from '@/lib/shop-tree';
import { TAX_CATEGORIES } from '@/lib/tax-categories';
import { downscaleImage } from '@/lib/image-resize';

/** DASH-D (Cam 2026-11-01, "photo tiles"): an item's register photo — a 40px thumbnail that opens the file picker. */
export function ItemPhoto({ item, onChanged, onError }: { item: FlatItem; onChanged: () => Promise<void> | void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    // Vercel refuses a request over 4.5 MB before the route runs — shrink a phone photo first, as the logo upload does.
    const fd = new FormData(); fd.append('itemId', item.id);
    try {
      fd.append('file', await downscaleImage(file));
      const r = await fetch('/api/operator/shop-items/photo', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { onError(d.error || 'Upload failed — try again.'); return; }
      await onChanged();
    } catch { onError('Upload failed — try again.'); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    const r = await dfetch(`/api/operator/shop-items/photo?itemId=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { onError(r.error); return; }
    await onChanged();
  }
  return (
    <span className="flex items-center gap-1.5">
      <label className={'relative w-10 h-10 shrink-0 rounded-[5px] overflow-hidden cursor-pointer ' + (item.photoUrl ? '' : 'border border-dashed border-line-strong')}>
        {item.photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.photoUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center text-[16px] text-ink-faint" aria-hidden="true">+</span>}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} aria-label={`Photo for ${item.name}`}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
        {busy && <span className="absolute inset-0 bg-white/70 text-[11px] flex items-center justify-center">…</span>}
      </label>
      {item.photoUrl && !busy && <button type="button" onClick={remove} className="text-xs text-ink-soft hover:text-ink px-1">Remove</button>}
    </span>
  );
}

const TAX_OPTIONS = Object.entries(TAX_CATEGORIES) as [string, { label: string; hint: string }][];

// POS-2 (Cam 2026-10-19): a new shop starts from the things nearly every pro
// shop sells — one tap each, edit the price after.
export const STARTERS: { name: string; category: string; priceCents: number }[] = [
  { name: 'Sleeve of balls', category: 'Balls', priceCents: 1200 },
  { name: 'Dozen balls', category: 'Balls', priceCents: 4500 },
  { name: 'Glove', category: 'Accessories', priceCents: 2000 },
  { name: 'Tees (bag)', category: 'Accessories', priceCents: 500 },
  { name: 'Small bucket of range balls', category: 'Range', priceCents: 800 },
  { name: 'Large bucket of range balls', category: 'Range', priceCents: 1400 },
  { name: 'Water', category: 'Drinks', priceCents: 300 },
  { name: 'Sports drink', category: 'Drinks', priceCents: 400 },
];

const dollars = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
const LBL = 'block text-[12.5px] text-ink-soft mb-1';

type OptRow = { id?: string; label: string; price: string; stock: string; sku: string };
type Draft = { name: string; category: string; price: string; stock: string; sku: string; taxCategory: string; sized: boolean; options: OptRow[] };
export const emptyDraft = (): Draft => ({ name: '', category: '', price: '', stock: '', sku: '', taxCategory: 'general', sized: false, options: [] });
export const draftOf = (i: TreeItem): Draft => ({
  name: i.name, category: i.category, price: dollars(i.priceCents), stock: i.stockCount === null ? '' : String(i.stockCount), sku: i.sku, taxCategory: i.taxCategory ?? 'general',
  sized: i.options.some(o => o.active),
  options: i.options.filter(o => o.active).map(o => ({ id: o.id, label: o.optionLabel, price: o.priceCents === i.priceCents ? '' : dollars(o.priceCents), stock: o.stockCount === null ? '' : String(o.stockCount), sku: o.sku })),
});

/** The body the route reads (lib/shop-catalog readItem). */
function bodyOf(d: Draft) {
  const toStock = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    name: d.name, category: d.category, priceCents: parsePriceCents(d.price) ?? NaN, sku: d.sku, taxCategory: d.taxCategory,
    stockCount: d.sized ? null : toStock(d.stock),
    options: d.sized ? d.options.map(o => ({ id: o.id, label: o.label, priceCents: o.price.trim() ? parsePriceCents(o.price) : null, stockCount: toStock(o.stock), sku: o.sku })) : [],
  };
}

export function ItemEditor({ initial, categories, busy, submitLabel, onSubmit, onCancel }: {
  initial: Draft; categories: string[]; busy: boolean; submitLabel: string;
  onSubmit: (body: ReturnType<typeof bodyOf>) => void; onCancel?: () => void;
}) {
  const [d, setD] = useState(initial);
  const set = (k: keyof Draft, v: unknown) => setD(x => ({ ...x, [k]: v }));
  const setOpt = (i: number, k: keyof OptRow, v: string) => setD(x => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)) }));
  const [sizesText, setSizesText] = useState('');
  function addSizes() {
    const labels = sizesText.split(/\s*[,\/|]\s*/).map(s => s.trim()).filter(Boolean);
    setD(x => ({ ...x, options: [...x.options, ...labels.filter(l => !x.options.some(o => o.label.toLowerCase() === l.toLowerCase())).map(label => ({ label, price: '', stock: '', sku: '' }))] }));
    setSizesText('');
  }
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); onSubmit(bodyOf(d)); }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[180px]"><span className={LBL}>Item</span>
          <input value={d.name} onChange={e => set('name', e.target.value)} maxLength={80} placeholder="Logo polo" className={INPUT + ' w-full'} /></label>
        <label className="w-40"><span className={LBL}>Category</span>
          <input value={d.category} onChange={e => set('category', e.target.value)} maxLength={40} list="shop-categories" placeholder="Apparel" className={INPUT + ' w-full'} /></label>
        <label className="w-28"><span className={LBL}>Price</span>
          <input value={d.price} onChange={e => set('price', e.target.value)} inputMode="decimal" placeholder="45.00" className={INPUT + ' w-full tabular-nums'} /></label>
        {!d.sized && <>
          <label className="w-24"><span className={LBL}>On hand</span>
            <input value={d.stock} onChange={e => set('stock', e.target.value)} inputMode="numeric" placeholder="—" className={INPUT + ' w-full tabular-nums'} /></label>
          <label className="w-36"><span className={LBL}>SKU or barcode</span>
            <input value={d.sku} onChange={e => set('sku', e.target.value)} maxLength={64} placeholder="Optional" className={INPUT + ' w-full'} /></label>
        </>}
      </div>
      <label className="block max-w-xs"><span className={LBL}>Sales tax type</span>
        <select value={d.taxCategory} onChange={e => set('taxCategory', e.target.value)} className={INPUT + ' w-full'}>
          {TAX_OPTIONS.map(([k, c]) => <option key={k} value={k}>{c.label} ({c.hint})</option>)}
        </select></label>
      <datalist id="shop-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
      <label className="flex items-center gap-2 text-[13.5px] text-ink">
        <input type="checkbox" checked={d.sized} onChange={e => set('sized', e.target.checked)} className="w-4 h-4 accent-pine" />
        Comes in sizes or colors
      </label>
      {d.sized && (
        <div className="bg-paper/70 rounded-md p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[200px]"><span className={LBL}>Add sizes or colors, separated by commas</span>
              <input value={sizesText} onChange={e => setSizesText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSizes(); } }} placeholder="S, M, L, XL" className={INPUT + ' w-full'} /></label>
            <button type="button" onClick={addSizes} className="text-sm text-ink border border-line rounded-md px-3 py-1.5 hover:border-pine/40">Add</button>
          </div>
          {d.options.length > 0 && (
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[12px] text-ink-soft"><th className="py-1 pr-2 font-medium">Option</th><th className="py-1 pr-2 font-medium">Price</th><th className="py-1 pr-2 font-medium">In stock</th><th className="py-1 pr-2 font-medium">SKU or barcode</th><th /></tr></thead>
              <tbody>
                {d.options.map((o, i) => (
                  <tr key={o.id ?? `n${i}`}>
                    <td className="py-1 pr-2"><input value={o.label} onChange={e => setOpt(i, 'label', e.target.value)} maxLength={30} aria-label="Option" className={INPUT + ' w-full'} /></td>
                    <td className="py-1 pr-2 w-28"><input value={o.price} onChange={e => setOpt(i, 'price', e.target.value)} inputMode="decimal" placeholder={d.price || 'Same'} aria-label={`${o.label} price`} className={INPUT + ' w-full tabular-nums'} /></td>
                    <td className="py-1 pr-2 w-24"><input value={o.stock} onChange={e => setOpt(i, 'stock', e.target.value)} inputMode="numeric" placeholder="—" aria-label={`${o.label} stock`} className={INPUT + ' w-full tabular-nums'} /></td>
                    <td className="py-1 pr-2"><input value={o.sku} onChange={e => setOpt(i, 'sku', e.target.value)} maxLength={64} aria-label={`${o.label} SKU`} className={INPUT + ' w-full'} /></td>
                    <td className="py-1 text-right"><button type="button" onClick={() => setD(x => ({ ...x, options: x.options.filter((_, j) => j !== i) }))} className="text-[12.5px] text-ink-soft hover:text-ink">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[12.5px] text-ink-muted">Leave an option&apos;s price blank to use the item&apos;s price. Count stock per option, or leave it blank.</p>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm px-4 py-2 disabled:opacity-50">{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-ink-soft hover:text-ink px-2 py-2">Cancel</button>}
      </div>
    </form>
  );
}

// Each preview row gets a stable key and its own price text, so removing a row
// never leaves another row's input showing the wrong price.
export type PreviewRow = ImportItem & { note?: string; key: string; priceText: string };
let rowSeq = 0;
const toPreview = (items: (ImportItem & { note?: string })[]): PreviewRow[] => items.map(r => ({ ...r, key: `r${++rowSeq}`, priceText: r.priceCents ? dollars(r.priceCents) : '' }));

/** Many at once: paste, CSV or AI → one preview → Add. */
export function BulkAdd({ busy, onAdd }: { busy: boolean; onAdd: (rows: PreviewRow[]) => Promise<boolean> }) {
  const [mode, setMode] = useState<'paste' | 'ai'>('paste');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  function preview(t: string) {
    setError('');
    const r = parseImport(t);
    setRows(toPreview(r.items));
    setProblems(r.rows.filter(x => x.error).map(x => `Row ${x.line}: ${x.error}`));
  }
  async function readWithAi() {
    setReading(true); setError(''); setProblems([]);
    const r = await dfetch<{ rows: (ImportItem & { note?: string })[] }>('/api/operator/shop-items/read', { method: 'POST', body: JSON.stringify({ text }) });
    setReading(false);
    if (!r.ok) { setError(r.error); return; }
    setRows(toPreview(r.data.rows));
    if (!r.data.rows.length) setError('No products found in that text.');
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) { setError('That file is over 2 MB — export just the product list.'); return; }
    const t = await f.text();
    setText(t); setMode('paste'); preview(t);
  }
  const edit = (i: number, patch: Partial<PreviewRow>) => setRows(rs => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ready = (rows ?? []).filter(r => r.name.trim() && r.priceCents > 0);

  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b border-line" role="tablist" aria-label="How to add">
        {([['paste', 'Paste rows or upload a CSV'], ['ai', 'Have AI read a list']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setRows(null); setProblems([]); setError(''); }}
            className={'pb-1.5 -mb-px text-[13px] font-semibold border-b-2 ' + (mode === k ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{l}</button>
        ))}
      </div>
      {mode === 'paste' ? (
        <p className="text-[12.5px] text-ink-soft">From Excel, Google Sheets or an old register: item, category, price, stock, sizes, SKU. Sizes in one cell (&ldquo;S/M/L&rdquo;) or a row each.</p>
      ) : (
        <p className="text-[12.5px] text-ink-soft">An invoice, price sheet or notes. You check every row before it&apos;s added.</p>
      )}
      <textarea value={text} onChange={e => { setText(e.target.value); setRows(null); }} rows={6}
        placeholder={mode === 'paste' ? 'Item\tCategory\tPrice\tStock\tSizes\nLogo polo\tApparel\t45\t\tS/M/L/XL\nPro V1 dozen\tBalls\t54.99\t24' : 'Paste the list or invoice here'}
        className={INPUT + ' w-full font-mono text-[12.5px]'} />
      <div className="flex flex-wrap items-center gap-3">
        {mode === 'paste' ? <>
          <button type="button" onClick={() => preview(text)} disabled={!text.trim()} className="text-sm text-ink border border-line rounded-md px-3 py-1.5 hover:border-pine/40 disabled:opacity-50">Check rows</button>
          <label className="text-[13px] text-pine font-medium cursor-pointer hover:underline">Upload a CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={e => onFile(e.target.files?.[0])} /></label>
        </> : (
          <button type="button" onClick={readWithAi} disabled={!text.trim() || reading} className="text-sm text-ink border border-line rounded-md px-3 py-1.5 hover:border-pine/40 disabled:opacity-50">{reading ? 'Reading…' : 'Read it'}</button>
        )}
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
      {problems.length > 0 && (
        <div className="rounded-md bg-warn/5 border border-warn/20 px-3 py-2 text-[12.5px] text-ink">
          <p className="font-medium">{problems.length} row{problems.length === 1 ? '' : 's'} left out:</p>
          <ul className="mt-1 space-y-0.5">{problems.slice(0, 8).map(p => <li key={p}>{p}</li>)}</ul>
          {problems.length > 8 && <p className="mt-1 text-ink-muted">and {problems.length - 8} more.</p>}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[12px] text-ink-soft border-b border-line"><th className="py-1.5 pr-2 font-medium">Item</th><th className="py-1.5 pr-2 font-medium">Category</th><th className="py-1.5 pr-2 font-medium">Price</th><th className="py-1.5 pr-2 font-medium">Sizes or colors</th><th className="py-1.5 pr-2 font-medium">Stock</th><th className="py-1.5 pr-2 font-medium">SKU</th><th className="py-1.5 pr-2 font-medium">Tax type</th><th /></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r, i) => (
                  <tr key={r.key} className="align-top">
                    <td className="py-1.5 pr-2 min-w-[160px]"><input value={r.name} onChange={e => edit(i, { name: e.target.value })} aria-label="Item" className={INPUT + ' w-full'} />{r.note && <span className="block text-[12px] text-warn mt-0.5">{r.note}</span>}</td>
                    <td className="py-1.5 pr-2 w-32"><input value={r.category} onChange={e => edit(i, { category: e.target.value })} aria-label="Category" className={INPUT + ' w-full'} /></td>
                    <td className="py-1.5 pr-2 w-24"><input value={r.priceText} onChange={e => { const c = parsePriceCents(e.target.value); edit(i, { priceText: e.target.value, priceCents: c && !Number.isNaN(c) ? c : 0, note: '' }); }} inputMode="decimal" aria-label="Price" className={INPUT + ' w-full tabular-nums' + (r.priceCents > 0 ? '' : ' border-bad/40')} /></td>
                    <td className="py-1.5 pr-2 text-ink-soft">{r.options.length ? r.options.map(o => o.label).join(' · ') : '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-ink-soft">{r.options.length ? (r.options.some(o => o.stockCount !== null) ? r.options.reduce((s, o) => s + (o.stockCount ?? 0), 0) : '—') : (r.stockCount ?? '—')}</td>
                    <td className="py-1.5 pr-2 text-ink-soft">{r.sku || '—'}</td>
                    <td className="py-1.5 pr-2 w-36"><select value={r.taxCategory ?? 'general'} onChange={e => edit(i, { taxCategory: e.target.value })} aria-label="Tax type" className={INPUT + ' w-full'}>{TAX_OPTIONS.map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></td>
                    <td className="py-1.5 text-right"><button type="button" onClick={() => setRows(rs => rs && rs.filter((_, j) => j !== i))} className="text-[12.5px] text-ink-soft hover:text-ink">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || !ready.length} onClick={async () => { if (await onAdd(ready)) { setRows(null); setText(''); setProblems([]); } }}
              className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm px-4 py-2 disabled:opacity-50">{busy ? 'Adding…' : `Add ${ready.length} item${ready.length === 1 ? '' : 's'}`}</button>
            {ready.length < rows.length && <span className="text-[12.5px] text-ink-muted">{rows.length - ready.length} without a price won&apos;t be added until you give them one.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

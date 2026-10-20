'use client';
// POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): Settings → Pro shop. The
// items staff sell on the Pro shop page or add to a group's round. Each change
// saves on its own. An item that was ever sold is hidden rather than deleted.
// W2-7 (Cam 2026-10-20: "they need to add a ton of stuff … really think this
// out"): sizes and colors are options of one item; many items go in at once by
// pasting rows, uploading a CSV, or having the AI read a list or invoice — all
// three land in one preview to check before anything is added.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { SHOP_SALE_FEE_CENTS, SHOP_FEE_ON } from '@/lib/booking-fees';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { parseImport, parsePriceCents, type ImportItem } from '@/lib/shop-import';
import { shopTree, matches, stockOf, type FlatItem, type TreeItem } from '@/lib/shop-tree';
import { TAX_CATEGORIES } from '@/lib/tax-categories';

const TAX_OPTIONS = Object.entries(TAX_CATEGORIES) as [string, { label: string; hint: string }][];

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
const dollars = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
const LBL = 'block text-[12.5px] text-ink-soft mb-1';

type OptRow = { id?: string; label: string; price: string; stock: string; sku: string };
type Draft = { name: string; category: string; price: string; stock: string; sku: string; taxCategory: string; sized: boolean; options: OptRow[] };
const emptyDraft = (): Draft => ({ name: '', category: '', price: '', stock: '', sku: '', taxCategory: 'general', sized: false, options: [] });
const draftOf = (i: TreeItem): Draft => ({
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

function ItemEditor({ initial, categories, busy, submitLabel, onSubmit, onCancel }: {
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
          <label className="w-24"><span className={LBL}>In stock</span>
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
type PreviewRow = ImportItem & { note?: string; key: string; priceText: string };
let rowSeq = 0;
const toPreview = (items: (ImportItem & { note?: string })[]): PreviewRow[] => items.map(r => ({ ...r, key: `r${++rowSeq}`, priceText: r.priceCents ? dollars(r.priceCents) : '' }));

/** Many at once: paste, CSV or AI → one preview → Add. */
function BulkAdd({ busy, onAdd }: { busy: boolean; onAdd: (rows: PreviewRow[]) => Promise<boolean> }) {
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
        <p className="text-[12.5px] text-ink-soft">Copy rows from Excel or Google Sheets, or your old register&apos;s export. Columns: item, category, price, stock, sizes, SKU — a header row in any order works. Sizes go in one cell (&ldquo;S/M/L&rdquo;) or one row per size.</p>
      ) : (
        <p className="text-[12.5px] text-ink-soft">Paste anything: a supplier invoice, a price sheet, your own notes. The AI picks out each product, its price and sizes. You check every row before it&apos;s added.</p>
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

export function ShopCatalog() {
  const access = useDashboardAccess();
  const canEdit = access.can('shop.catalog');
  const [flat, setFlat] = useState<FlatItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<'' | 'one' | 'many'>('');
  const [formKey, setFormKey] = useState(0);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const r = await dfetch<{ items: FlatItem[] }>('/api/operator/shop-items');
    if (!r.ok) { setLoadError(r.error); return; }
    setFlat(r.data.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => shopTree(flat ?? []), [flat]);
  const categories = useMemo(() => [...new Set(tree.map(i => i.category).filter(Boolean))].sort(), [tree]);
  const shown = tree.filter(i => matches(i, q) && (!cat || i.category === cat));

  async function write(key: string, method: 'POST' | 'PATCH' | 'DELETE', body: object, done: string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<{ hidden?: boolean; created?: number }>('/api/operator/shop-items', { method, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) { setError(r.error); return false; }
    await load();
    setNote(method === 'DELETE' && r.data?.hidden ? 'That item has been sold before, so it was hidden instead of deleted.' : done);
    return true;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft -mt-1">
        Sell these on the Pro shop page (cash or a pay link), or add them to a group&apos;s round from the tee sheet, where they&apos;re charged with the round at check-in or on the golfer&apos;s pay link{SHOP_FEE_ON ? <>, plus GreenReserve&apos;s {usd(SHOP_SALE_FEE_CENTS)} per sale, paid by the golfer</> : null}. A price change never touches items already sold.
      </p>
      {loadError && (
        <div className="rounded-md bg-bad/5 border border-bad/20 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-bad">{loadError}</p>
          <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink">Retry</button>
        </div>
      )}
      {!loadError && !flat && <p className="text-xs text-ink-muted">Loading your shop…</p>}

      {canEdit && flat && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAdding(a => (a === 'one' ? '' : 'one'))} className={'text-sm rounded-md px-3 py-1.5 border ' + (adding === 'one' ? 'border-pine/40 text-ink' : 'border-line text-ink hover:border-pine/40')}>Add an item</button>
            <button type="button" onClick={() => setAdding(a => (a === 'many' ? '' : 'many'))} className={'text-sm rounded-md px-3 py-1.5 border ' + (adding === 'many' ? 'border-pine/40 text-ink' : 'border-line text-ink hover:border-pine/40')}>Add many at once</button>
          </div>
          {adding === 'one' && (
            <ItemEditor key={formKey} initial={emptyDraft()} categories={categories} busy={busy === 'new'} submitLabel="Add item"
              onSubmit={async b => { if (await write('new', 'POST', b, `${b.name} added.`)) setFormKey(k => k + 1); }} onCancel={() => setAdding('')} />
          )}
          {adding === 'many' && (
            <BulkAdd busy={busy === 'bulk'} onAdd={rows => write('bulk', 'POST', { items: rows.map(({ note: _n, key: _k, priceText: _p, ...r }) => r) }, `${rows.length} item${rows.length === 1 ? '' : 's'} added.`)} />
          )}
          {(() => {
            const have = new Set(tree.map(i => i.name.toLowerCase()));
            const left = STARTERS.filter(st => !have.has(st.name.toLowerCase()));
            return left.length > 0 && tree.length < 10 && (
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
        </div>
      )}
      {!canEdit && flat && <p className="text-xs text-ink-muted">Ask the course owner to turn on “Edit the shop catalog” for you to change these.</p>}
      {error && <p className="text-xs text-bad">{error}</p>}
      {note && <p className="text-xs text-ok">{note}</p>}

      {flat && tree.length === 0 && <p className="text-sm text-ink-soft">No items yet.</p>}
      {tree.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an item, size or SKU" aria-label="Find an item" className={INPUT + ' w-56'} />
            <div className="flex flex-wrap gap-1">
              {['', ...categories].map(c => (
                <button key={c || 'all'} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                  className={'text-[12.5px] rounded-md px-2.5 py-1 border ' + (cat === c ? 'border-pine/40 text-ink font-medium' : 'border-line text-ink-soft hover:text-ink')}>{c || 'All'}</button>
              ))}
            </div>
            <span className="text-[12.5px] text-ink-muted ml-auto">{shown.length} of {tree.length}</span>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {shown.map(i => {
              const stock = stockOf(i);
              const opts = i.options.filter(o => o.active);
              return (
                <li key={i.id} className="py-2.5">
                  {editing === i.id ? (
                    <ItemEditor initial={draftOf(i)} categories={categories} busy={busy === i.id} submitLabel="Save"
                      onSubmit={async b => { if (await write(i.id, 'PATCH', { id: i.id, ...b }, `${b.name} saved.`)) setEditing(null); }}
                      onCancel={() => setEditing(null)} />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className={'text-sm ' + (i.active ? 'text-ink' : 'text-ink-muted')}>{i.name}</span>
                        {i.category && <span className="text-[12.5px] text-ink-muted"> · {i.category}</span>}
                        {!i.active && <span className="text-[12.5px] text-ink-muted"> · hidden</span>}
                        {stock !== null && <span className={'text-[12.5px] ' + (stock <= 0 ? 'text-bad' : 'text-ink-muted')}> · {stock <= 0 ? 'none left' : `${stock} in stock`}</span>}
                        {i.sku && <span className="text-[12.5px] text-ink-muted"> · {i.sku}</span>}
                        {opts.length > 0 && (
                          <div className="text-[12.5px] text-ink-soft mt-0.5">
                            {opts.map(o => <span key={o.id} className="mr-3 whitespace-nowrap">{o.optionLabel}{o.priceCents !== i.priceCents ? ` ${usd(o.priceCents)}` : ''}{o.stockCount !== null ? <span className={o.stockCount <= 0 ? 'text-bad' : 'text-ink-muted'}> ({o.stockCount})</span> : null}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm tabular-nums text-ink">{usd(i.priceCents)}</span>
                        {canEdit && (
                          <>
                            <button type="button" onClick={() => { setEditing(i.id); setError(''); setNote(''); }} disabled={busy !== null} className="text-xs text-ink-soft hover:text-ink px-1.5 disabled:opacity-50">Edit</button>
                            <button type="button" onClick={() => write(i.id, 'PATCH', { id: i.id, active: !i.active }, i.active ? `${i.name} hidden.` : `${i.name} shown.`)} disabled={busy !== null} className="text-xs text-ink-soft hover:text-ink px-1.5 disabled:opacity-50">{i.active ? 'Hide' : 'Show'}</button>
                            <button type="button" onClick={() => { if (confirm(`Delete ${i.name}${opts.length ? ' and all its options' : ''}?`)) write(i.id, 'DELETE', { id: i.id }, `${i.name} deleted.`); }} disabled={busy !== null} className="text-xs text-bad hover:bg-bad/5 rounded-md px-1.5 disabled:opacity-50">{busy === i.id ? '…' : 'Delete'}</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className="text-sm text-ink-soft">Nothing matches.</p>}
        </div>
      )}
    </div>
  );
}

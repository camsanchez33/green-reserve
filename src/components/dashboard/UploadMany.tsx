'use client';
// POS-8 (Cam 2026-11-09: "the only option should be have ai read it … they can just upload what they have"). ONE way
// to add many items: upload what the shop already has. A spreadsheet saved as CSV is read exactly here (lib/shop-import
// — fast, no model, never misreads a price); a PDF invoice or a photo of a price sheet goes to the AI reader
// (/api/operator/shop-items/read). Either way the rows land in one table to check and fix; nothing is added until
// "Add N items".
// IMPORT-2 (pro shop stress test 2026-11-10): every row left out is listed; what looks wrong (a barcode on two rows, a
// price far off its category, a barcode Excel mangled, two spellings of a category) is flagged on its row, with
// "Rows to check" to see only those; barcodes and costs show and can be fixed here; Add waits while a barcode is on
// two rows (the save would refuse it).
import { useMemo, useRef, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { parseImport, parsePriceCents, checkList, clearRepeatedSkus, categoryMerges, cleanSku, LIST_WARN, type ImportItem, type HeaderGuess, type HeaderClash } from '@/lib/shop-import';
import { TAX_CATEGORIES } from '@/lib/tax-categories';
import { downscaleImage } from '@/lib/image-resize';

const TAX_OPTIONS = Object.entries(TAX_CATEGORIES) as [string, { label: string; hint: string }][];
const MAX_FILE = 3_000_000; // the read route's limit (lib/shop-ai-import MAX_READ_FILE_BYTES)
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

type Row = ImportItem & { note?: string; key: string; priceText: string };
type Sent = Omit<Row, 'note' | 'key' | 'priceText' | 'warn'>;
let seq = 0;
const toRows = (items: (ImportItem & { note?: string })[]): Row[] => items.map(r => ({ ...r, key: `u${++seq}`, priceText: r.priceCents ? (r.priceCents / 100).toFixed(2) : '' }));

async function toBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function UploadMany({ onAdd, canCost = false }: { onAdd: (rows: Sent[]) => Promise<boolean>; canCost?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [costColumn, setCostColumn] = useState(false);
  const [unread, setUnread] = useState<string[]>([]);
  const [guessed, setGuessed] = useState<HeaderGuess[]>([]);
  const [unclear, setUnclear] = useState<HeaderClash[]>([]);
  // The rows to check, frozen when the filter is turned on — a row fixed while typing stays on screen (final review:
  // re-filtering each keystroke dropped a half-typed price out of view, ready to be added).
  const [checkKeys, setCheckKeys] = useState<Set<string> | null>(null);
  const [reading, setReading] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function start(items: (ImportItem & { note?: string })[], left: string[] = [], cost = false, notRead: string[] = [], guesses: HeaderGuess[] = [], clashes: HeaderClash[] = []) {
    setUnread(notRead); setGuessed(guesses); setUnclear(clashes);
    // The AI reader's barcodes get the same clean-up as a file's (spaces out, Excel numbers flagged).
    const clean = items.map(it => { if (it.options.length || !it.sku) return it; const c = cleanSku(it.sku); return { ...it, sku: c.sku, warn: [...(it.warn ?? []), ...(c.warn && !it.warn?.includes(c.warn) ? [c.warn] : [])] }; });
    setRows(toRows(clean)); setProblems(left); setCostColumn(cost); setCheckKeys(null);
  }

  async function aiRead(body: Record<string, unknown>, what: string) {
    setReading(what); setError(''); setProblems([]);
    const r = await dfetch<{ rows: (ImportItem & { note?: string })[] }>('/api/operator/shop-items/read', { method: 'POST', body: JSON.stringify(body) });
    setReading('');
    if (!r.ok) { setError(r.error); return; }
    if (!r.data.rows.length) { setError('No products found in that file.'); return; }
    start(r.data.rows);
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setError(''); setProblems([]);
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xls|numbers)$/.test(name)) { setError('Save the spreadsheet as CSV first (File → Save As → CSV), then upload that.'); return; }
    if (file.type === 'text/csv' || /\.(csv|tsv|txt)$/.test(name)) {
      if (file.size > 2_000_000) { setError('That file is over 2 MB — upload just the product list.'); return; }
      const r = parseImport(await file.text());
      // Two columns that could be the price (or the item): say so — never hand the choice to the AI reader.
      if (!r.items.length && r.unclear.length) { start([], r.rows.filter(x => x.error).map(x => `Row ${x.line}: ${x.error}`), r.costColumn, r.unread, r.guessed, r.unclear); return; }
      if (!r.items.length) { await aiRead({ text: (await file.text()).slice(0, 20000) }, 'Reading your file…'); return; }
      start(r.items, r.rows.filter(x => x.error).map(x => `Row ${x.line}: ${x.error}`), r.costColumn, r.unread, r.guessed, r.unclear);
      return;
    }
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      if (file.size > MAX_FILE) { setError('That PDF is over 3 MB — send fewer pages.'); return; }
      await aiRead({ file: { type: 'application/pdf', data: await toBase64(file) } }, 'Reading your invoice…');
      return;
    }
    if (file.type.startsWith('image/')) {
      const small = await downscaleImage(file).catch(() => file);
      if (small.size > MAX_FILE) { setError('That photo is too large — try a smaller one.'); return; }
      await aiRead({ file: { type: small.type || 'image/jpeg', data: await toBase64(small) } }, 'Reading your photo…');
      return;
    }
    setError('Upload a CSV, a PDF or a photo.');
  }

  const edit = (key: string, patch: Partial<Row>) => setRows(rs => rs && rs.map(r => (r.key === key ? { ...r, ...patch } : r)));

  // The whole-list checks re-run on what is on screen now (an edited barcode or price clears its flag).
  const checked = useMemo(() => {
    if (!rows) return null;
    const copy = rows.map(r => ({ ...r, options: r.options.map(o => ({ ...o })), warn: [...(r.warn ?? [])] }));
    const { skuClashes } = checkList(copy);
    return { rows: copy, skuClashes, merges: categoryMerges(copy) };
  }, [rows]);

  if (!rows || !checked) return (
    <div>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={!!reading} onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); take(e.dataTransfer.files?.[0]); }}
        className="w-full rounded-[10px] border border-dashed border-line-strong bg-paper px-4 py-8 text-center hover:border-pine/40 disabled:opacity-60">
        <span className="block text-[14px] font-semibold text-ink">{reading || 'Upload what you have'}</span>
        <span className="block mt-1 text-[12.5px] text-ink-muted">A spreadsheet (CSV), an invoice (PDF) or a photo of a price sheet</span>
      </button>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload a file" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; take(f); }} />
      {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
    </div>
  );

  const ready = checked.rows.filter(r => r.name.trim() && r.priceCents > 0);
  const flagged = checked.rows.filter(r => r.warn.length || r.note || !(r.priceCents > 0));
  const shown = checkKeys ? checked.rows.filter(r => checkKeys.has(r.key)) : checked.rows;
  const showCost = costColumn && canCost;
  const blocked = checked.skuClashes > 0;
  const send = (): Sent[] => ready.map(({ note: _n, key: _k, priceText: _p, warn: _w, costCents, options, ...r }) => ({
    ...r, ...(canCost ? { costCents } : {}), options: options.map(({ costCents: oc, ...o }) => ({ ...o, ...(canCost ? { costCents: oc } : {}) })),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink">
        <span><b className="tabular-nums">{ready.length}</b> ready</span>
        {rows.length > ready.length && <span className="text-warn">{rows.length - ready.length} need a price</span>}
        {(flagged.length > 0 || checkKeys) && <button type="button" onClick={() => setCheckKeys(k => (k ? null : new Set(flagged.map(r => r.key))))} aria-pressed={!!checkKeys} className="text-pine font-medium hover:underline underline-offset-4">{checkKeys ? 'Show all rows' : `${flagged.length} to check`}</button>}
        <button type="button" onClick={() => { setRows(null); setProblems([]); setError(''); }} className="ml-auto text-ink-soft hover:text-ink">Start over</button>
      </div>
      {problems.length > 0 && (
        <details className="mt-1.5 text-[12.5px]">
          <summary className="cursor-pointer text-warn">{problems.length} row{problems.length === 1 ? '' : 's'} left out</summary>
          <ul className="mt-1 max-h-40 overflow-y-auto pl-4 text-ink-soft">{problems.map(p => <li key={p}>{p}</li>)}</ul>
        </details>
      )}
      {checked.merges.map(m => (
        <p key={`${m.from}>${m.to}`} className="mt-1.5 text-[12.5px] text-ink">
          <span className="text-warn">“{m.from}”</span> ({m.fromCount}) looks like “{m.to}” ({m.toCount}).{' '}
          <button type="button" onClick={() => setRows(rs => rs && rs.map(r => (r.category === m.from ? { ...r, category: m.to } : r)))} className="font-medium text-pine hover:underline underline-offset-4">Use “{m.to}”</button>
        </p>
      ))}
      {unclear.map(u => <p key={u.kind} className="mt-1.5 text-[12.5px] text-warn">No {u.kind} read — it could be {u.headers.map(h => `“${h}”`).join(' or ')}. Rename the right column “{u.kind === 'price' ? 'Price' : u.kind === 'stock count' ? 'Stock' : u.kind}” and upload again.</p>)}
      {guessed.length > 0 && <p className="mt-1.5 text-[12.5px] text-ink">{guessed.map(g => `${g.kind[0].toUpperCase() + g.kind.slice(1)} from “${g.header}”`).join(' · ')} — check it’s right.</p>}
      {unread.length > 0 && <p className="mt-1.5 text-[12.5px] text-ink-muted">Columns not read: {unread.join(', ')}</p>}
      {costColumn && !canCost && <p className="mt-1.5 text-[12.5px] text-ink-muted">The cost column isn’t saved — only the owner sets costs.</p>}
      {blocked && (
        <p className="mt-1.5 text-[12.5px] text-bad">
          {checked.skuClashes} barcode{checked.skuClashes === 1 ? ' is' : 's are'} on two rows — fix them below, or{' '}
          <button type="button" onClick={() => setRows(rs => { if (!rs) return rs; const c = rs.map(r => ({ ...r, options: r.options.map(o => ({ ...o })) })); clearRepeatedSkus(c); return c; })} className="font-medium text-pine hover:underline underline-offset-4">clear the repeats</button>{' '}
          (the first row keeps each).
        </p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[880px] text-[13px]">
          <thead><tr className="text-left text-[12px] text-ink-soft border-b border-line">
            <th className="py-1.5 pr-2 font-medium">Item</th><th className="py-1.5 pr-2 font-medium">Category</th><th className="py-1.5 pr-2 font-medium">Price</th>
            <th className="py-1.5 pr-2 font-medium">Stock</th><th className="py-1.5 pr-2 font-medium">Barcode</th>{showCost && <th className="py-1.5 pr-2 font-medium">Cost</th>}
            <th className="py-1.5 pr-2 font-medium">Tax</th><th />
          </tr></thead>
          <tbody className="divide-y divide-line-soft">
            {shown.map(r => (
              <tr key={r.key} className="align-top">
                <td className="py-1.5 pr-2 min-w-[220px]"><input value={r.name} onChange={e => edit(r.key, { name: e.target.value })} aria-label="Item" className={INPUT + ' w-full'} />
                  {r.options.length > 0 && <span className="block text-[12px] mt-0.5 text-ink-muted">{r.options.map(o => o.label).join(' · ')}</span>}
                  {(r.warn.length > 0 || r.note) && <span className="block text-[12px] mt-0.5 text-warn">{[...r.warn, r.note].filter(Boolean).join(' ')}</span>}</td>
                <td className="py-1.5 pr-2 w-36"><input value={r.category} onChange={e => edit(r.key, { category: e.target.value })} aria-label="Category" className={INPUT + ' w-full'} /></td>
                <td className="py-1.5 pr-2 w-24"><input value={r.priceText} onChange={e => { const c = parsePriceCents(e.target.value); edit(r.key, { priceText: e.target.value, priceCents: c && !Number.isNaN(c) ? c : 0, note: '', warn: r.warn.filter(w => !LIST_WARN.test(w)) }); }} inputMode="decimal" aria-label="Price" className={INPUT + ' w-full tabular-nums' + (r.priceCents > 0 ? '' : ' border-warn/50')} /></td>
                <td className="pt-3 pb-1.5 pr-2 tabular-nums text-ink-soft">{r.options.length ? (r.options.some(o => o.stockCount !== null) ? r.options.reduce((s, o) => s + (o.stockCount ?? 0), 0) : '—') : (r.stockCount ?? '—')}</td>
                <td className="py-1.5 pr-2 w-40">{r.options.length
                  ? <span className="text-[12px] text-ink-muted">{r.options.filter(o => o.sku).length} of {r.options.length} sizes</span>
                  : <input value={r.sku} onChange={e => edit(r.key, { sku: e.target.value, warn: r.warn.filter(w => !/^Barcode/.test(w)) })} onBlur={e => { const c = cleanSku(e.target.value); edit(r.key, { sku: c.sku, warn: [...r.warn.filter(w => !/^Barcode/.test(w)), ...(c.warn ? [c.warn] : [])] }); }} aria-label="Barcode" className={INPUT + ' w-full tabular-nums'} />}</td>
                {showCost && <td className="pt-3 pb-1.5 pr-2 tabular-nums text-ink-soft">{r.costCents != null ? usd(r.costCents) : r.options.some(o => o.costCents != null) ? 'by size' : '—'}</td>}
                <td className="py-1.5 pr-2 w-44"><select value={r.taxCategory ?? 'general'} onChange={e => edit(r.key, { taxCategory: e.target.value })} aria-label="Tax type" className={INPUT + ' w-full'}>{TAX_OPTIONS.map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></td>
                <td className="pt-3 pb-1.5 text-right"><button type="button" onClick={() => setRows(rs => rs && rs.filter(x => x.key !== r.key))} aria-label={`Remove ${r.name}`} className="text-[12.5px] text-ink-soft hover:text-ink">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
      <button type="button" disabled={adding || !ready.length || blocked} onClick={async () => { setAdding(true); setError(''); const ok = await onAdd(send()); setAdding(false); if (ok) setRows(null); }}
        className="mt-3 w-full min-h-[44px] bg-pine hover:bg-pine-hover text-white font-medium rounded-[7px] text-[14px] disabled:opacity-50">{adding ? 'Adding…' : blocked ? 'Fix the repeated barcodes first' : `Add ${ready.length} item${ready.length === 1 ? '' : 's'}`}</button>
    </div>
  );
}

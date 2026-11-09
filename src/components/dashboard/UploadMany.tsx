'use client';
// POS-8 (Cam 2026-11-09: "the only option should be have ai read it … they can just upload what they have"). ONE way
// to add many items: upload what the shop already has. A spreadsheet saved as CSV is read exactly here (lib/shop-import
// — fast, no model, never misreads a price); a PDF invoice or a photo of a price sheet goes to the AI reader
// (/api/operator/shop-items/read). Either way the rows land in one table to check and fix; nothing is added until
// "Add N items".
import { useRef, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { parseImport, parsePriceCents, type ImportItem } from '@/lib/shop-import';
import { TAX_CATEGORIES } from '@/lib/tax-categories';
import { downscaleImage } from '@/lib/image-resize';

const TAX_OPTIONS = Object.entries(TAX_CATEGORIES) as [string, { label: string; hint: string }][];
const MAX_FILE = 3_000_000; // the read route's limit (lib/shop-ai-import MAX_READ_FILE_BYTES)

type Row = ImportItem & { note?: string; key: string; priceText: string };
let seq = 0;
const toRows = (items: (ImportItem & { note?: string })[]): Row[] => items.map(r => ({ ...r, key: `u${++seq}`, priceText: r.priceCents ? (r.priceCents / 100).toFixed(2) : '' }));

async function toBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function UploadMany({ onAdd }: { onAdd: (rows: Omit<Row, 'note' | 'key' | 'priceText'>[]) => Promise<boolean> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function aiRead(body: Record<string, unknown>, what: string) {
    setReading(what); setError(''); setProblems([]);
    const r = await dfetch<{ rows: (ImportItem & { note?: string })[] }>('/api/operator/shop-items/read', { method: 'POST', body: JSON.stringify(body) });
    setReading('');
    if (!r.ok) { setError(r.error); return; }
    if (!r.data.rows.length) { setError('No products found in that file.'); return; }
    setRows(toRows(r.data.rows));
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setError(''); setProblems([]);
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xls|numbers)$/.test(name)) { setError('Save the spreadsheet as CSV first (File → Save As → CSV), then upload that.'); return; }
    if (file.type === 'text/csv' || /\.(csv|tsv|txt)$/.test(name)) {
      if (file.size > 2_000_000) { setError('That file is over 2 MB — upload just the product list.'); return; }
      const r = parseImport(await file.text());
      if (!r.items.length) { await aiRead({ text: (await file.text()).slice(0, 20000) }, 'Reading your file…'); return; }
      setRows(toRows(r.items));
      setProblems(r.rows.filter(x => x.error).map(x => `Row ${x.line}: ${x.error}`));
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

  const edit = (i: number, patch: Partial<Row>) => setRows(rs => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ready = (rows ?? []).filter(r => r.name.trim() && r.priceCents > 0);

  if (!rows) return (
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

  return (
    <div>
      <p className="text-[13px] text-ink"><b className="tabular-nums">{ready.length}</b> ready{rows.length > ready.length ? <> · <span className="text-warn">{rows.length - ready.length} need a price</span></> : null}
        <button type="button" onClick={() => { setRows(null); setProblems([]); setError(''); }} className="ml-3 text-ink-soft hover:text-ink">Start over</button></p>
      {problems.length > 0 && <p className="mt-1 text-[12.5px] text-warn">{problems.length} row{problems.length === 1 ? '' : 's'} left out: {problems.slice(0, 3).join(' · ')}{problems.length > 3 ? '…' : ''}</p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px] text-ink-soft border-b border-line"><th className="py-1.5 pr-2 font-medium">Item</th><th className="py-1.5 pr-2 font-medium">Category</th><th className="py-1.5 pr-2 font-medium">Price</th><th className="py-1.5 pr-2 font-medium">Stock</th><th className="py-1.5 pr-2 font-medium">Tax</th><th /></tr></thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="py-1.5 pr-2 min-w-[150px]"><input value={r.name} onChange={e => edit(i, { name: e.target.value })} aria-label="Item" className={INPUT + ' w-full'} />
                  {(r.options.length > 0 || r.note) && <span className="block text-[12px] mt-0.5"><span className="text-ink-muted">{r.options.map(o => o.label).join(' · ')}</span>{r.note && <span className="text-warn"> {r.note}</span>}</span>}</td>
                <td className="py-1.5 pr-2 w-28"><input value={r.category} onChange={e => edit(i, { category: e.target.value })} aria-label="Category" className={INPUT + ' w-full'} /></td>
                <td className="py-1.5 pr-2 w-24"><input value={r.priceText} onChange={e => { const c = parsePriceCents(e.target.value); edit(i, { priceText: e.target.value, priceCents: c && !Number.isNaN(c) ? c : 0, note: '' }); }} inputMode="decimal" aria-label="Price" className={INPUT + ' w-full tabular-nums' + (r.priceCents > 0 ? '' : ' border-warn/50')} /></td>
                <td className="py-1.5 pr-2 tabular-nums text-ink-soft">{r.options.length ? (r.options.some(o => o.stockCount !== null) ? r.options.reduce((s, o) => s + (o.stockCount ?? 0), 0) : '—') : (r.stockCount ?? '—')}</td>
                <td className="py-1.5 pr-2 w-32"><select value={r.taxCategory ?? 'general'} onChange={e => edit(i, { taxCategory: e.target.value })} aria-label="Tax type" className={INPUT + ' w-full'}>{TAX_OPTIONS.map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></td>
                <td className="py-1.5 text-right"><button type="button" onClick={() => setRows(rs => rs && rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`} className="text-[12.5px] text-ink-soft hover:text-ink">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
      <button type="button" disabled={adding || !ready.length} onClick={async () => { setAdding(true); setError(''); const ok = await onAdd(ready.map(({ note: _n, key: _k, priceText: _p, ...r }) => r)); setAdding(false); if (ok) setRows(null); }}
        className="mt-3 w-full min-h-[44px] bg-pine hover:bg-pine-hover text-white font-medium rounded-[7px] text-[14px] disabled:opacity-50">{adding ? 'Adding…' : `Add ${ready.length} item${ready.length === 1 ? '' : 's'}`}</button>
    </div>
  );
}

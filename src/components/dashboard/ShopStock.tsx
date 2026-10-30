'use client';
// SHOP-4 (Cam 2026-10-30: "Low stock + receiving"; cost "only the owner sees"): the
// Pro shop page's stock. One line when items are low; open it for every counted item —
// on hand, reorder at, cost (the owner) — and Receive to add a delivery. Data:
// /api/operator/shop-stock (lib/shop-stock.ts).
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import type { StockRow } from '@/lib/shop-stock';

type Data = { rows: StockRow[]; receipts: { id: string; name: string; quantity: number; unitCostCents?: number | null; receivedBy: string; createdAt: string; note: string }[]; canEdit: boolean; canCost: boolean };
type Edit = { id: string; qty: string; cost: string; reorder: string; unitCost: string };

const usd = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));
const toCents = (s: string) => { const t = s.trim(); if (!t) return ''; const n = Math.round(Number(t) * 100); return Number.isFinite(n) && n >= 0 ? n : NaN; };

export function ShopStock({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');

  const load = useCallback(async () => {
    const r = await dfetch<Data>('/api/operator/shop-stock');
    if (r.ok) { setData(r.data); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (error && !data) return <LoadError message={`Couldn't load stock — ${error}`} onRetry={load} />;
  if (!data) return null;
  const counted = data.rows.filter(r => r.stockCount !== null || r.reorderAt !== null || (data.canCost && r.costCents != null));
  const low = data.rows.filter(r => r.low);

  const start = (r: StockRow) => { setRowError(''); setEdit({ id: r.id, qty: '', unitCost: '', reorder: r.reorderAt == null ? '' : String(r.reorderAt), cost: usd(r.costCents) }); };
  async function post(body: Record<string, unknown>) {
    const r = await dfetch('/api/operator/shop-stock', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setRowError(r.error); return false; }
    return true;
  }
  async function save(row: StockRow) {
    if (!edit) return;
    setBusy(true); setRowError('');
    let ok = true;
    if (edit.unitCost.trim() && !edit.qty.trim()) { setRowError('Enter how many came in.'); setBusy(false); return; }
    if (edit.qty.trim()) {
      const unit = data!.canCost ? toCents(edit.unitCost) : '';
      if (Number.isNaN(unit)) { setRowError('Enter the cost of one as an amount.'); setBusy(false); return; }
      ok = await post({ action: 'receive', itemId: row.id, quantity: Number(edit.qty), ...(unit !== '' ? { unitCostCents: unit } : {}) });
    }
    const reorder = edit.reorder.trim() === '' ? null : Number(edit.reorder);
    if (ok && data!.canEdit && reorder !== row.reorderAt) ok = await post({ action: 'reorder', itemId: row.id, reorderAt: reorder });
    if (ok && data!.canCost && !edit.unitCost.trim()) {
      const c = toCents(edit.cost);
      if (Number.isNaN(c)) { setRowError('Enter the cost as an amount, or leave it blank.'); setBusy(false); return; }
      if ((c === '' ? null : c) !== (row.costCents ?? null)) ok = await post({ action: 'cost', itemId: row.id, costCents: c === '' ? null : c });
    }
    setBusy(false);
    if (ok) { setEdit(null); load(); }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Stock</h2>
        {low.length > 0 ? <StatusDot status="warn" label={`${low.length} low: ${low.slice(0, 3).map(r => r.name).join(', ')}${low.length > 3 ? '…' : ''}`} /> : <span className="text-[13px] text-ink-muted">{counted.length ? 'Nothing low' : 'No items counted'}</span>}
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="ml-auto text-[13px] font-medium text-pine hover:underline underline-offset-4">{open ? 'Hide' : data.canEdit ? 'Receive stock' : 'Open'}</button>
      </div>
      {error && <p role="alert" className="text-[12.5px] text-bad mt-2">{error}</p>}
      {open && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[12.5px] text-ink-muted border-b border-line-soft">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium text-right">On hand</th>
                <th className="py-2 pr-3 font-medium text-right">Reorder at</th>
                {data.canCost && <th className="py-2 pr-3 font-medium text-right">Cost</th>}
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data.rows.map(r => edit?.id === r.id ? (
                <tr key={r.id} className="bg-paper/70">
                  <td className="py-2 pr-3 text-ink" colSpan={data.canCost ? 5 : 4}>
                    <div className="flex flex-wrap items-end gap-2">
                      <span className="w-full font-medium">{r.name} · {r.stockCount ?? 'not counted'} on hand</span>
                      {data.canEdit && <label className="text-[12.5px] text-ink-soft">Came in<input value={edit.qty} onChange={e => setEdit({ ...edit, qty: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>}
                      {data.canEdit && data.canCost && <label className="text-[12.5px] text-ink-soft">Cost of one<input value={edit.unitCost} onChange={e => setEdit({ ...edit, unitCost: e.target.value })} inputMode="decimal" placeholder={usd(r.costCents)} className={INPUT + ' block mt-1 w-24'} /></label>}
                      {data.canEdit && <label className="text-[12.5px] text-ink-soft">Reorder at<input value={edit.reorder} onChange={e => setEdit({ ...edit, reorder: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>}
                      {data.canCost && !edit.unitCost.trim() && <label className="text-[12.5px] text-ink-soft">Cost<input value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} inputMode="decimal" className={INPUT + ' block mt-1 w-24'} /></label>}
                      <button onClick={() => save(r)} disabled={busy} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                      <button onClick={() => setEdit(null)} className="text-[13px] text-ink-soft hover:text-ink px-1 py-1.5">Cancel</button>
                      {rowError && <p role="alert" className="w-full text-[12.5px] text-bad">{rowError}</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="py-2 pr-3 text-ink">{r.low && <StatusDot status="warn" label="" />} {r.name}</td>
                  <td className={'py-2 pr-3 text-right ' + (r.low ? 'text-warn font-semibold' : 'text-ink')}>{r.stockCount ?? '—'}</td>
                  <td className="py-2 pr-3 text-right text-ink-muted">{r.reorderAt ?? '—'}</td>
                  {data.canCost && <td className="py-2 pr-3 text-right text-ink-muted">{r.costCents == null ? '—' : `$${usd(r.costCents)}`}</td>}
                  <td className="py-2 text-right">{(data.canEdit || data.canCost) && <button onClick={() => start(r)} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.rows.length && <p className="text-[13px] text-ink-muted py-2">No items in the shop yet.</p>}
          {data.receipts.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[13.5px] font-semibold text-ink mb-1">Deliveries</h3>
              <ul className="divide-y divide-line-soft text-[13px]">
                {data.receipts.slice(0, 10).map(x => (
                  <li key={x.id} className="flex flex-wrap gap-x-3 py-1.5">
                    <span className="text-ink-muted w-24">{new Date(x.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-ink">{x.name}</span>
                    <span className="tabular-nums">+{x.quantity}</span>
                    {x.unitCostCents != null && <span className="text-ink-muted tabular-nums">${usd(x.unitCostCents)} each</span>}
                    <span className="ml-auto text-ink-muted">{x.receivedBy}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

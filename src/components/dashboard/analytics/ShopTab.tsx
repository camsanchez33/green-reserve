'use client';
// SHOP-4 (Cam 2026-10-30: "Shop sales report"): Analytics → Pro shop. What sold for
// the dates picked, by item and category, best sellers first; cost and margin for the
// owner only. Its own load: /api/operator/analytics/shop (lib/shop-report.ts).
import { useCallback, useEffect, useState } from 'react';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { TERMS } from '@/lib/analytics-terms';
import type { ShopReport } from '@/lib/shop-report';

const usd = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (m: number | null | undefined, s: number) => (m == null || !s ? '' : ` · ${Math.round((m / s) * 100)}%`);

function csv(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => { const t = v == null ? '' : String(v); const safe = /^[=+\-@]/.test(t) && typeof v === 'string' ? `'${t}` : t; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

function Fig({ label, value, sub, def }: { label: string; value: string; sub?: string; def?: string }) {
  return (
    <div>
      <div className={'text-[13px] font-semibold text-ink ' + (def ? 'underline decoration-dotted decoration-line-strong underline-offset-4 cursor-help' : '')} title={def}>{label}</div>
      <div className="text-[24px] font-semibold tabular-nums mt-1 text-ink">{value}</div>
      {sub && <div className="text-[12.5px] text-ink-muted mt-1 tabular-nums">{sub}</div>}
    </div>
  );
}

export function ShopTab({ range }: { range: { from: string; to: string } }) {
  const [r, setR] = useState<ShopReport | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    const res = await dfetch<ShopReport>(`/api/operator/analytics/shop?from=${range.from}&to=${range.to}`);
    if (res.ok) setR(res.data); else setError(res.error);
  }, [range.from, range.to]);
  useEffect(() => { setR(null); load(); }, [load]);
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!r) return <p className="text-[13px] text-ink-muted py-6">Loading…</p>;
  const t = r.totals;
  const top = Math.max(1, r.categories[0]?.salesCents ?? 1);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Fig label="Sold" def={TERMS.shopSold} value={usd(t.salesCents)} sub={`${t.qty.toLocaleString()} items`} />
        <Fig label="Walk-up" value={usd(t.walkUpCents)} />
        <Fig label="On rounds" value={usd(t.onRoundsCents)} />
        {r.cost ? <Fig label="Margin" def={TERMS.shopMargin} value={usd(t.marginCents)} sub={t.costedSalesCents ? `${usd(t.costedSalesCents)} costed${pct(t.marginCents, t.costedSalesCents)}` : 'no costs'} />
          : <Fig label="Discounts" value={usd(t.discountsCents)} />}
      </div>
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-ink">By item</h3>
          {r.items.length > 0 && <button onClick={() => csv(`shop-items-${r.range.from}-${r.range.to}`, [['Item', 'Category', 'Sold', 'Sales', ...(r.cost ? ['Cost', 'Margin'] : [])], ...r.items.map(i => [i.name, i.category, i.qty, i.salesCents / 100, ...(r.cost ? [i.costCents == null ? null : i.costCents / 100, i.marginCents == null ? null : i.marginCents / 100] : [])])])}
            className="text-[12.5px] font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line-strong">CSV</button>}
        </div>
        {r.items.length === 0 ? <p className="text-[13px] text-ink-muted">Nothing sold.</p> : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-[12.5px] font-semibold text-ink border-b border-line">
                <th className="py-2 pr-4">Item</th><th className="py-2 pr-4 text-right">Sold</th><th className="py-2 pr-4 text-right">Sales</th>{r.cost && <th className="py-2 text-right">Margin</th>}
              </tr></thead>
              <tbody className="divide-y divide-line-soft">
                {r.items.map(i => (
                  <tr key={i.key}>
                    <td className="py-2 pr-4 text-ink">{i.name}<span className="ml-2 text-ink-muted">{i.category}</span></td>
                    <td className="py-2 pr-4 text-right">{i.qty}</td>
                    <td className="py-2 pr-4 text-right">{usd(i.salesCents)}</td>
                    {r.cost && <td className="py-2 text-right">{i.marginCents == null ? '—' : `${usd(i.marginCents)}${pct(i.marginCents, i.salesCents)}`}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {r.categories.length > 0 && (
        <section>
          <h3 className="text-[15px] font-semibold text-ink mb-3">By category</h3>
          <div className="space-y-2">
            {r.categories.map(c => (
              <div key={c.category} className="flex items-center gap-3 text-[13px]">
                <span className="w-36 shrink-0 text-ink truncate">{c.category}</span>
                <div className="flex-1 h-2.5 bg-line-soft rounded-full overflow-hidden"><div className="h-full rounded-full bg-pine" style={{ width: `${(c.salesCents / top) * 100}%` }} /></div>
                <span className="w-24 shrink-0 text-right tabular-nums font-semibold text-ink">{usd(c.salesCents)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

'use client';
// ANALYTICS-5 (Cam 2026-11-17, approved mockup): Analytics → Pro shop. Transactions and items kept apart; shop revenue
// is the ledger's (the report's ledgerSalesCents, Build; money.payments only); what sold by category and item
// comes from the shop report (SHOP-4, lib/shop-report.ts), with cost and margin for the owner only. Transactions, the
// month before and stock value are Build's: each part stays hidden until the report sends it.
import { useCallback, useEffect, useState } from 'react';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { Block, Figures, Note, Pair, Table } from './parts';
import { type Range, type Shop, change, dayShort, num, pct, usd } from './data';

const marginPct = (m: number | null | undefined, sales: number) => (m == null || !sales ? null : (m / sales) * 100);

export function ShopTab({ range, money, onLoad }: { range: Range; money: boolean; onLoad?: (r: Shop | null) => void }) {
  const [r, setR] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    const res = await dfetch<Shop>(`/api/operator/analytics/shop?from=${range.from}&to=${range.to}`);
    if (res.ok) { setR(res.data); onLoad?.(res.data); } else { setError(res.error); onLoad?.(null); }
  }, [range.from, range.to, onLoad]);
  useEffect(() => { setR(null); load(); }, [load]);
  if (error) return <LoadError message={`Couldn’t load the pro shop — ${error}`} onRetry={load} />;
  if (!r) return <Note>Loading…</Note>;

  const t = r.totals;
  const shopCents = money && r.ledgerSalesCents != null ? r.ledgerSalesCents : null;
  const all = r.categories.reduce((s, c) => s + c.salesCents, 0);
  const hasBefore = r.categories.some(c => c.beforeSalesCents != null);
  const S = r.stock;
  return (<>
    <Figures items={[
      t.transactions != null && { label: 'Transactions', value: num(t.transactions) },
      { label: 'Items sold', value: num(t.qty) },
      shopCents != null && { label: 'Shop revenue', value: usd(shopCents) },
      r.cost && t.costedSalesCents ? { label: 'Margin', value: pct(marginPct(t.marginCents, t.costedSalesCents)) } : null,
      shopCents != null && t.transactions ? { label: 'Average transaction', value: `$${(shopCents / t.transactions / 100).toFixed(2)}` } : null,
    ]} />
    <Block title="By category">
      <Table label="Pro shop sales by category" empty="Nothing sold in these dates."
        head={['Category', 'Items sold', 'Sales', 'Share of sales', ...(r.cost ? ['Margin'] : []), ...(hasBefore ? ['On the period before'] : [])]}
        rows={r.categories.map(c => {
          const ch = c.beforeSalesCents != null ? change(c.salesCents, c.beforeSalesCents, 'pct') : null;
          return [c.category, `${num(c.qty)} item${c.qty === 1 ? '' : 's'}`, usd(c.salesCents), pct(all ? (c.salesCents / all) * 100 : null),
            ...(r.cost ? [pct(marginPct(c.marginCents, c.salesCents))] : []), ...(hasBefore ? [ch ? ch.text : '—'] : [])];
        })} />
    </Block>
    <Pair>
      <Block title="Best sellers">
        <Table label="Best-selling items" empty="Nothing sold in these dates." head={['Item', 'Sold', 'Sales', ...(r.cost ? ['Margin'] : [])]}
          rows={r.items.slice(0, 5).map(i => [i.name, num(i.qty), usd(i.salesCents), ...(r.cost ? [pct(marginPct(i.marginCents, i.salesCents))] : [])])} />
      </Block>
      {S && (
        <Block title="Not selling">
          <Table label={`Items that haven't sold in over ${S.staleDays} days`} empty={`Everything in stock sold in the last ${S.staleDays} days.`} head={['Item', 'In stock', ...(money ? ['Stock value'] : []), 'Last sold']}
            rows={S.notSelling.map(x => [x.name, num(x.inStock), ...(money ? [usd(x.retailValueCents)] : []), x.lastSoldAt ? dayShort(x.lastSoldAt) : 'Never'])} />
          {money && S.notSellingRetailCents > 0 && <Note>{usd(S.notSellingRetailCents)} of stock, at shelf price, has not sold in over {S.staleDays} days.</Note>}
        </Block>
      )}
    </Pair>
  </>);
}

export function shopCsv(r: Shop): (string | number | null)[][] {
  return [['Item', 'Category', 'Sold', 'Sales', ...(r.cost ? ['Cost', 'Margin'] : [])],
    ...r.items.map(i => [i.name, i.category, i.qty, i.salesCents / 100, ...(r.cost ? [i.costCents == null ? null : i.costCents / 100, i.marginCents == null ? null : i.marginCents / 100] : [])])];
}

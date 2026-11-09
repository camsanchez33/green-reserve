// RECEIPT-3: a pro shop sale's receipt — the same body for staff (Pro shop → Sales) and the customer (/receipt/shop/[id]).
// Pure: no hooks, no client code, so the customer's page ships no JavaScript for it.
import type { ShopReceipt } from '@/lib/shop-receipt';

const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;

export function ShopReceiptBody({ r }: { r: ShopReceipt }) {
  const subtotal = r.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const change = r.cashTenderedCents != null && r.cashTenderedCents > r.totalCents ? r.cashTenderedCents - r.totalCents : null;
  return (
    <div className="text-[14px] text-ink">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[13px]">
        <dt className="text-ink-muted">Paid</dt><dd className="text-right">{r.paidAt}</dd>
        <dt className="text-ink-muted">By</dt><dd className="text-right">{r.paidWith}</dd>
        <dt className="text-ink-muted">Receipt</dt><dd className="text-right tabular-nums">{r.ref}</dd>
        {r.customerName && <><dt className="text-ink-muted">Customer</dt><dd className="text-right">{r.customerName}</dd></>}
      </dl>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {r.lines.map((l, i) => (
          <li key={i} className="flex items-baseline gap-3 py-2">
            <span className="flex-1 min-w-0">{l.name}{l.quantity > 1 && <span className="text-ink-muted"> × {l.quantity}</span>}</span>
            {l.quantity > 1 && <span className="text-[12.5px] text-ink-muted tabular-nums">{usd(l.unitPriceCents)} each</span>}
            <span className="w-20 text-right tabular-nums">{usd(l.unitPriceCents * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[13.5px]">
        {(r.discountCents > 0 || r.taxCents > 0) && <><dt className="text-ink-muted">Subtotal</dt><dd className="text-right tabular-nums">{usd(subtotal)}</dd></>}
        {r.discountCents > 0 && <><dt className="text-ink-muted">Discount{r.discountNote ? ` (${r.discountNote})` : ''}</dt><dd className="text-right tabular-nums">{usd(-r.discountCents)}</dd></>}
        {r.taxCents > 0 && <><dt className="text-ink-muted">Sales tax</dt><dd className="text-right tabular-nums">{usd(r.taxCents)}</dd></>}
        <dt className="pt-1 font-semibold">Total</dt><dd className="pt-1 text-right text-[18px] font-semibold tabular-nums">{usd(r.totalCents)}</dd>
        {r.cashTenderedCents != null && <><dt className="text-ink-muted">Cash given</dt><dd className="text-right tabular-nums">{usd(r.cashTenderedCents)}</dd></>}
        {change != null && <><dt className="text-ink-muted">Change</dt><dd className="text-right tabular-nums">{usd(change)}</dd></>}
        {r.refundedCents > 0 && <><dt className="text-ink-muted">Refunded</dt><dd className="text-right tabular-nums">{usd(-r.refundedCents)}</dd></>}
      </dl>
    </div>
  );
}

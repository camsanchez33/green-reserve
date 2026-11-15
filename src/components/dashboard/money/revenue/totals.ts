// REVENUE-1: the Revenue page's totals as pure functions, so one test can hold the four places that show a total for
// the same dates to ONE number (scripts/revenue-page-test.ts). With Build's sales.all — the ledger by payment day, the
// course's part, GreenReserve's fee out, dues in — the chart's headline, What was sold, How it was paid and the Ledger's
// Revenue are all grossCents. Before it is sent, the older fields stand in.
import type { Sales, RevenueLedgerDay } from './data';

export type Row = { key: string; label: string; note?: string; cents: number };

const segRows = (g: { teeCents: number; cartCents: number; shopCents: number; eventCents: number; fnbCents?: number; duesCents?: number; otherCents?: number }): Row[] => [
  { key: 'tee', label: 'Tee times', note: 'green fees', cents: g.teeCents },
  { key: 'cart', label: 'Carts', cents: g.cartCents },
  { key: 'shop', label: 'Pro shop', cents: g.shopCents },
  { key: 'event', label: 'Events', cents: g.eventCents },
  ...(g.fnbCents !== undefined ? [{ key: 'fnb', label: 'Food & beverage', cents: g.fnbCents }] : []),
  // Only when there are some: the mockup draws neither row.
  ...(g.duesCents ? [{ key: 'dues', label: 'Membership dues', cents: g.duesCents }] : []),
  ...(g.otherCents ? [{ key: 'other', label: 'Other', cents: g.otherCents }] : []),
];

/** What was sold: sales.all's segments, else Build's tee-day segments, else Money's summary. */
export function soldRows(s: Sales): Row[] {
  if (s.all) return segRows(s.all.segments);
  if (s.segments) return segRows(s.segments);
  const sm = s.summary;
  return segRows({ teeCents: sm.greenCents + sm.lateFeesKeptCents, cartCents: sm.cartCents, shopCents: sm.rangeCents + sm.shopOnRoundsCents + sm.walkUpCents, eventCents: sm.eventCents ?? 0 });
}
export const soldTotal = (s: Sales) => s.all ? s.all.grossCents : s.segments ? s.segments.totalCents : soldRows(s).reduce((n, r) => n + r.cents, 0);

/** How it was paid, on the same basis as What was sold when sales.all is sent. */
export function paidRows(s: Sales): { rows: Row[]; total: number } {
  const q = s.all ? s.all.paid : s.howPaid;
  if (q) {
    const rows: Row[] = [{ key: 'online', label: 'Card online', cents: q.onlineCents }, { key: 'reader', label: 'Card at the counter', note: 'card reader', cents: q.readerCents }, { key: 'cash', label: 'Cash', cents: q.cashCents },
      ...(q.otherCents ? [{ key: 'other', label: 'Check or other', cents: q.otherCents }] : [])];
    return { rows, total: s.all ? s.all.grossCents : s.howPaid!.totalCents };
  }
  const p = s.paid;
  const rows: Row[] = [{ key: 'card', label: 'Card', cents: p.cardCents }, { key: 'counter', label: 'At the counter', cents: p.counterCents }, ...(p.accountCents ? [{ key: 'account', label: 'On accounts', cents: p.accountCents }] : [])];
  return { rows, total: rows.reduce((n, r) => n + r.cents, 0) };
}

// The Ledger, on the same basis (Build 2026-11-15): Revenue takes out GreenReserve's fees on money IN, and a fee given
// back on a refund comes off Refunds. Net is the same either way. Before Build sends the split, platformCents.
export const dayCard = (d: RevenueLedgerDay) => d.cardInCents + d.otherInCents - (d.feesInCents ?? d.platformCents);
export const dayRefunds = (d: RevenueLedgerDay) => d.outCents - (d.feesBackCents ?? 0);
export const dayNet = (d: RevenueLedgerDay) => d.netCents - d.platformCents;
export function ledgerTotals(days: RevenueLedgerDay[]) {
  const sum = (f: (d: RevenueLedgerDay) => number) => days.reduce((n, d) => n + f(d), 0);
  const t = { card: sum(dayCard), cash: sum(d => d.cashInCents), refunds: sum(dayRefunds), net: sum(dayNet), gr: sum(d => d.platformCents) };
  return { ...t, revenue: t.card + t.cash };
}

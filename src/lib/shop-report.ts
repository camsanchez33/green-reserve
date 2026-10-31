// SHOP-4 (Cam 2026-10-30: "Shop sales report"; cost "only the owner sees"): what the
// pro shop sold in a range, by item and by category, best sellers first. Analytics →
// Pro shop. Read-only, one course.
//
//  • Sold = walk-up sales paid in the range (less what came back as a return) plus
//    items added to rounds that were paid in the range. Before discounts and tax.
//  • Margin = sold − cost, at the item's cost today (no cost entered → no margin for
//    that item). The owner only.
//  • Green fees rung up at the register are not shop sales and are left out.
import { prisma } from './prisma';
import { teeTimeInstant } from './booking-events';
import { addDaysStr } from './course-time';

export type ShopReportItem = { key: string; name: string; category: string; qty: number; salesCents: number; costCents?: number | null; marginCents?: number | null };
export type ShopReport = {
  range: { from: string; to: string };
  items: ShopReportItem[];
  categories: { category: string; qty: number; salesCents: number; marginCents?: number | null }[];
  totals: { qty: number; salesCents: number; walkUpCents: number; onRoundsCents: number; discountsCents: number; costedSalesCents?: number; marginCents?: number };
  cost: boolean;
};

type Line = { shopItemId: string | null; name: string; unitPriceCents: number; qty: number; via: 'walkup' | 'round'; pack?: boolean };

/** Pure: lines into items, categories and totals. `costOf` is the item's cost today, or null. */
export function summarize(lines: Line[], meta: Map<string, { category: string; costCents: number | null }>, opts: { cost: boolean; discountsCents: number }): Omit<ShopReport, 'range' | 'cost'> {
  const by = new Map<string, ShopReportItem & { costKnown: boolean; costTotal: number }>();
  let walkUp = 0, onRounds = 0;
  for (const l of lines) {
    if (l.qty <= 0) continue;
    const key = l.shopItemId ?? `${l.pack ? 'pack' : 'custom'}:${l.name}`;
    const m = l.shopItemId ? meta.get(l.shopItemId) : undefined;
    const row = by.get(key) ?? { key, name: l.name, category: m?.category || (l.shopItemId ? 'Other' : l.pack ? 'Round packs' : 'Custom amounts'), qty: 0, salesCents: 0, costKnown: m?.costCents != null, costTotal: 0 };
    const sold = l.unitPriceCents * l.qty;
    row.qty += l.qty; row.salesCents += sold;
    if (m?.costCents != null) row.costTotal += m.costCents * l.qty;
    by.set(key, row);
    if (l.via === 'walkup') walkUp += sold; else onRounds += sold;
  }
  const items = [...by.values()].sort((a, b) => b.salesCents - a.salesCents).map(({ costKnown, costTotal, ...r }) => ({
    ...r, ...(opts.cost ? { costCents: costKnown ? costTotal : null, marginCents: costKnown ? r.salesCents - costTotal : null } : {}),
  }));
  const cats = new Map<string, { category: string; qty: number; salesCents: number; marginCents: number | null }>();
  for (const i of items) {
    const c = cats.get(i.category) ?? { category: i.category, qty: 0, salesCents: 0, marginCents: null };
    c.qty += i.qty; c.salesCents += i.salesCents;
    if (opts.cost && i.marginCents != null) c.marginCents = (c.marginCents ?? 0) + i.marginCents;
    cats.set(i.category, c);
  }
  const categories = [...cats.values()].sort((a, b) => b.salesCents - a.salesCents).map(c => (opts.cost ? c : { category: c.category, qty: c.qty, salesCents: c.salesCents }));
  const costed = items.filter(i => i.marginCents != null);
  return {
    items, categories,
    totals: {
      qty: items.reduce((n, i) => n + i.qty, 0), salesCents: walkUp + onRounds, walkUpCents: walkUp, onRoundsCents: onRounds, discountsCents: opts.discountsCents,
      ...(opts.cost ? { costedSalesCents: costed.reduce((n, i) => n + i.salesCents, 0), marginCents: costed.reduce((n, i) => n + (i.marginCents ?? 0), 0) } : {}),
    },
  };
}

export async function shopReport(courseId: string, range: { from: string; to: string }, opts: { cost: boolean }): Promise<ShopReport | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) return null;
  const start = teeTimeInstant(course.timezone, range.from, '00:00');
  const end = teeTimeInstant(course.timezone, addDaysStr(range.to, 1), '00:00');
  if (!start || !end) return null;
  const inRange = { gte: start, lt: end };
  const [saleLines, sales, roundLines] = await Promise.all([
    prisma.shopSaleLine.findMany({
      where: { bookingId: null, sale: { courseId, status: { in: ['paid_cash', 'paid_card', 'paid_account'] }, paidAt: inRange } },
      select: { shopItemId: true, name: true, unitPriceCents: true, quantity: true, returnedQty: true, roundPackId: true }, take: 50_000,
    }),
    prisma.shopSale.findMany({ where: { courseId, status: { in: ['paid_cash', 'paid_card', 'paid_account'] }, paidAt: inRange, discountCents: { gt: 0 } }, select: { discountCents: true } }),
    prisma.bookingShopItem.findMany({
      where: { booking: { courseId, paymentStatus: { in: ['paid', 'paid_offline', 'on_account'] }, paidAt: inRange } },
      select: { shopItemId: true, name: true, unitPriceCents: true, quantity: true }, take: 50_000,
    }),
  ]);
  const lines: Line[] = [
    ...saleLines.map(l => ({ shopItemId: l.shopItemId, name: l.name, unitPriceCents: l.unitPriceCents, qty: l.quantity - l.returnedQty, via: 'walkup' as const, pack: !!l.roundPackId })),
    ...roundLines.map(l => ({ shopItemId: l.shopItemId, name: l.name, unitPriceCents: l.unitPriceCents, qty: l.quantity, via: 'round' as const })),
  ];
  const ids = [...new Set(lines.map(l => l.shopItemId).filter((x): x is string => !!x))];
  const items = ids.length ? await prisma.shopItem.findMany({ where: { courseId, id: { in: ids } }, select: { id: true, category: true, costCents: true, parent: { select: { category: true } } } }) : [];
  const meta = new Map(items.map(i => [i.id, { category: i.category || i.parent?.category || '', costCents: i.costCents }]));
  return { range, cost: opts.cost, ...summarize(lines, meta, { cost: opts.cost, discountsCents: sales.reduce((n, s) => n + s.discountCents, 0) }) };
}

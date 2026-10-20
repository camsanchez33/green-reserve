// W2-7: the flat item list from /api/operator/shop-items as the shop reads it —
// each item with its options (sizes/colors) under it. Pure, browser-safe.
export type FlatItem = {
  id: string; name: string; category: string; priceCents: number; active: boolean; stockCount: number | null;
  sku: string; parentId: string | null; optionLabel: string; sortOrder?: number; taxCategory?: string;
};
export type TreeItem = FlatItem & { options: FlatItem[] };

export function shopTree(items: FlatItem[]): TreeItem[] {
  const kids = new Map<string, FlatItem[]>();
  for (const i of items) if (i.parentId) kids.set(i.parentId, [...(kids.get(i.parentId) ?? []), i]);
  // Options in the order the course entered them (S, M, L, XL — not alphabetical).
  return items.filter(i => !i.parentId).map(i => ({ ...i, options: (kids.get(i.id) ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) }));
}

/** Search by name, category, option or SKU/barcode. */
export function matches(i: TreeItem, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [i.name, i.category, i.sku, ...i.options.flatMap(o => [o.optionLabel, o.sku])].some(v => v.toLowerCase().includes(s));
}

/** An item's shelf count: its own, or the sum over options that are counted (null when nothing is counted). */
export function stockOf(i: TreeItem): number | null {
  if (!i.options.length) return i.stockCount;
  const counted = i.options.filter(o => o.active && o.stockCount !== null);
  return counted.length ? counted.reduce((s, o) => s + (o.stockCount ?? 0), 0) : null;
}

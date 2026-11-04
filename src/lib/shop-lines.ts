// Cam 2026-11-04: a group's shop items shown the register's way — one row per item with a count,
// though they are saved one line per tap. Pure, client-safe; the group card and its test use it.
export type ShopLineIn = { id: string; name: string; unitPriceCents: number; quantity: number };
export type ShopLineGroup = { key: string; name: string; unitPriceCents: number; quantity: number; ids: string[]; lastId: string; lastQty: number };

/** Lines with the same name AND price become one row (a repriced item stays its own row); oldest first in, newest last. */
export function groupLines(lines: ShopLineIn[]): ShopLineGroup[] {
  const m = new Map<string, ShopLineGroup>();
  for (const l of lines) {
    const key = `${l.name}|${l.unitPriceCents}`;
    const g = m.get(key) ?? { key, name: l.name, unitPriceCents: l.unitPriceCents, quantity: 0, ids: [], lastId: l.id, lastQty: 0 };
    g.quantity += l.quantity; g.ids.push(l.id); g.lastId = l.id; g.lastQty = l.quantity; m.set(key, g);
  }
  return [...m.values()];
}

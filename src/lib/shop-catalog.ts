// W2-7 (Cam 2026-10-20): the pro-shop catalog with OPTIONS (sizes, colors) and
// bulk adds. An item with options is a parent row plus one sellable row per
// option (lib/shop.ts and lib/shop-sales.ts sell rows, never a parent with
// options). An option's name is "<item> — <option>", so every receipt, sale
// line and booking line that copies a name reads right without knowing about
// options. Server only; the route (api/operator/shop-items) does the auth.
import { prisma } from './prisma';
import { validItemInput, MAX_ITEM_PRICE_CENTS } from './shop';
import { MAX_IMPORT_ITEMS, MAX_OPTIONS, type ImportItem } from './shop-import';
import { isTaxCategory } from './tax-categories';

export const ITEM_SELECT = { id: true, name: true, category: true, priceCents: true, active: true, sortOrder: true, stockCount: true, sku: true, parentId: true, optionLabel: true, taxCategory: true, photoUrl: true } as const;

export const optionName = (item: string, option: string) => `${item} — ${option}`;

type OptionIn = { id?: string; label: string; priceCents: number | null; stockCount: number | null; sku: string; costCents?: number | null };
export type ItemIn = { name: string; category: string; priceCents: number; stockCount: number | null; sku: string; taxCategory: string; options: OptionIn[]; costCents?: number | null };
const MAX_COST = 10_000_000; // $100,000 — lib/shop-stock's limit

const fail = (error: string) => ({ ok: false as const, error });

/** IMPORT-2: what one costs the shop — owner only (opts.cost); anything else is ignored, never refused. */
function costOf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_COST ? n : null;
}

function stockOf(v: unknown): number | null | 'bad' {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 'bad';
}

/** Validate one item (with its options) from a browser body. */
export function readItem(body: Record<string, unknown>, keepOpt: Set<string> = new Set(), opts: { cost?: boolean } = {}): { ok: true; item: ItemIn } | { ok: false; error: string } {
  const v = validItemInput(body);
  if (typeof v === 'string') return fail(v);
  const stock = stockOf(body.stockCount);
  if (stock === 'bad') return fail(`${v.name}: stock must be a whole number from 0 to 100,000, or blank.`);
  const sku = typeof body.sku === 'string' ? body.sku.trim().slice(0, 64) : '';
  const raw = Array.isArray(body.options) ? body.options as Record<string, unknown>[] : [];
  if (raw.length > MAX_OPTIONS) return fail(`${v.name}: up to ${MAX_OPTIONS} options.`);
  const options: OptionIn[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    if (!o || typeof o !== 'object') return fail(`${v.name}: an option is missing.`);
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, 30) : '';
    if (!label) return fail(`${v.name}: every option needs a name, like M or Navy.`);
    if (seen.has(label.toLowerCase())) return fail(`${v.name}: "${label}" is listed twice.`);
    seen.add(label.toLowerCase());
    const p = o.priceCents === null || o.priceCents === undefined || o.priceCents === '' ? null : Number(o.priceCents);
    if (p !== null && (!Number.isInteger(p) || p <= 0 || p > MAX_ITEM_PRICE_CENTS)) return fail(`${v.name} — ${label}: enter a price above $0, or leave it blank to use the item's price.`);
    const s = typeof o.id === 'string' && keepOpt.has(o.id) ? null : stockOf(o.stockCount);
    if (s === 'bad') return fail(`${v.name} — ${label}: stock must be a whole number, or blank.`);
    options.push({ id: typeof o.id === 'string' ? o.id : undefined, label, priceCents: p, stockCount: s, sku: typeof o.sku === 'string' ? o.sku.trim().slice(0, 64) : '', ...(opts.cost ? { costCents: costOf(o.costCents) } : {}) });
  }
  if (options.length === 1) return fail(`${v.name}: one option is just the item — add a second option, or remove it.`);
  // W2-7 part B: how it's taxed; options are taxed like their item.
  const taxCategory = isTaxCategory(body.taxCategory) ? body.taxCategory : 'general';
  return { ok: true, item: { ...v, stockCount: options.length ? null : stock, sku: options.length ? '' : sku, taxCategory, options, ...(opts.cost && !options.length ? { costCents: costOf(body.costCents) } : {}) } };
}

/**
 * Revamp 3 audit (fix 9): a barcode is one item's. A SKU already on another of the
 * course's items, or used twice in what's being saved, is refused by name — a
 * re-import used to make a second item with the same code, and scanning it then
 * added nothing.
 */
const listOf = (xs: string[]) => xs.length > 5 ? `${xs.slice(0, 5).join(', ')} and ${xs.length - 5} more` : xs.join(', ');

async function skuClash(courseId: string, items: ItemIn[], exceptIds: string[] = []): Promise<string | null> {
  const codes: string[] = [];
  for (const it of items) { if (it.sku) codes.push(it.sku); for (const o of it.options) if (o.sku) codes.push(o.sku); }
  // IMPORT-2 (stress test 2026-11-10: "it took 3 tries"): every clash at once, not the first one.
  const seen = new Set<string>(), twice = new Map<string, string>();
  for (const c of codes) { const k = c.toLowerCase(); if (seen.has(k) && !twice.has(k)) twice.set(k, c); seen.add(k); }
  const reused = [...twice.values()];
  if (reused.length) return `${reused.length === 1 ? `Code ${reused[0]} is` : `Codes ${listOf(reused)} are`} used twice — give each item its own.`;
  if (!codes.length) return null;
  const taken = await prisma.shopItem.findMany({
    // A hidden item's options keep active: true — only codes the register can still scan count.
    where: { courseId, active: true, id: { notIn: exceptIds }, AND: [{ OR: [{ parentId: null }, { parent: { active: true } }] }], OR: codes.map(c => ({ sku: { equals: c, mode: 'insensitive' as const } })) },
    select: { name: true, sku: true },
    take: 50,
  });
  if (!taken.length) return null;
  return taken.length === 1 ? `Code ${taken[0].sku} is already on ${taken[0].name} — change one of them.`
    : `These codes are already on other items — change them: ${listOf(taken.map(t => `${t.sku} (${t.name})`))}.`;
}

/** Create one or many items (a bulk add), all or nothing. */
export async function createItems(courseId: string, bodies: unknown[], opts: { cost?: boolean } = {}) {
  if (!bodies.length) return fail('Nothing to add.');
  if (bodies.length > MAX_IMPORT_ITEMS) return fail(`Up to ${MAX_IMPORT_ITEMS} items at a time.`);
  const items: ItemIn[] = [];
  // Nothing is added while any row is wrong — and every wrong row is named at once (IMPORT-2).
  const errors: string[] = [];
  bodies.forEach((b, i) => {
    const body = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    const r = readItem(body, new Set(), opts);
    if (r.ok) { items.push(r.item); return; }
    // Every message names its row: some checks (lib/shop validItemInput) don't say which item.
    const label = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : `Row ${i + 1}`;
    errors.push(r.error.startsWith(label) ? r.error : `${label}: ${r.error}`);
  });
  if (errors.length) return fail(errors.length === 1 ? errors[0] : `${errors.length} items need fixing: ${listOf(errors)}`);
  const clash = await skuClash(courseId, items);
  if (clash) return fail(clash);
  const ids = await prisma.$transaction(async tx => {
    const out: string[] = [];
    for (const it of items) {
      const parent = await tx.shopItem.create({ data: { courseId, name: it.name, category: it.category, priceCents: it.priceCents, stockCount: it.stockCount, sku: it.sku, taxCategory: it.taxCategory, costCents: it.costCents ?? null } });
      out.push(parent.id);
      if (it.options.length) await tx.shopItem.createMany({ data: it.options.map((o, i) => ({
        courseId, parentId: parent.id, optionLabel: o.label, name: optionName(it.name, o.label), category: it.category,
        priceCents: o.priceCents ?? it.priceCents, stockCount: o.stockCount, sku: o.sku, sortOrder: i, taxCategory: it.taxCategory, costCents: o.costCents ?? null,
      })) });
    }
    return out;
  }, { timeout: 30000 });
  // POS-8: the ids, so Add item can save the photo, reorder point and cost onto the item it just made.
  return { ok: true as const, created: ids.length, ids };
}

/**
 * Edit an item. On a parent, the name, category and price carry to its
 * options (an option keeps a price of its own when one was set), and the
 * `options` list is the new set: kept ones are updated, new ones made, and
 * dropped ones deleted — or hidden, when they have ever been sold.
 */
export async function updateItem(courseId: string, id: string, body: Record<string, unknown>) {
  const existing = await prisma.shopItem.findFirst({ where: { id, courseId }, include: { options: { include: { _count: { select: { sales: true, saleLines: true } } } } } });
  if (!existing) return null;
  if (existing.parentId) return fail('Change an option from its item.');
  // POS-8 review: `keepStock: true` (on the item, or on a kept option) leaves its count exactly as stored — never
  // re-written from what the form loaded. A count can be below 0 (sold past it), and the register may be selling while
  // the form is open; a rename or a delivery must not reset either. (A delivery adds through lib/shop-stock receive.)
  const keepItem = body.keepStock === true;
  const keepOpt = new Set((Array.isArray(body.options) ? body.options as Record<string, unknown>[] : []).filter(o => o && o.keepStock === true && typeof o.id === 'string').map(o => o.id as string));
  const r = readItem({ ...body, ...(keepItem ? { stockCount: null } : {}), taxCategory: body.taxCategory ?? existing.taxCategory, options: Array.isArray(body.options) ? body.options : existing.options.filter(o => o.active).map(o => ({ id: o.id, label: o.optionLabel, priceCents: o.priceCents === existing.priceCents ? null : o.priceCents, stockCount: o.stockCount, sku: o.sku })) }, keepOpt);
  if (!r.ok) return r;
  const it = r.item;
  const active = typeof body.active === 'boolean' ? body.active : existing.active;
  const mine = new Map(existing.options.map(o => [o.id, o]));
  if (it.options.some(o => o.id && !mine.has(o.id))) return null;
  const clash = await skuClash(courseId, [it], [id, ...existing.options.map(o => o.id)]);
  if (clash) return fail(clash);
  await prisma.$transaction(async tx => {
    await tx.shopItem.update({ where: { id }, data: { name: it.name, category: it.category, priceCents: it.priceCents, ...(keepItem && !it.options.length ? {} : { stockCount: it.stockCount }), sku: it.sku, taxCategory: it.taxCategory, active } });
    const keep = new Set<string>();
    for (const [i, o] of it.options.entries()) {
      const data = { optionLabel: o.label, name: optionName(it.name, o.label), category: it.category, priceCents: o.priceCents ?? it.priceCents, ...(o.id && keepOpt.has(o.id) ? {} : { stockCount: o.stockCount }), sku: o.sku, sortOrder: i, taxCategory: it.taxCategory, active: true };
      if (o.id) { keep.add(o.id); await tx.shopItem.update({ where: { id: o.id }, data }); }
      else await tx.shopItem.create({ data: { courseId, parentId: id, ...data } });
    }
    for (const o of existing.options) {
      if (keep.has(o.id)) continue;
      if (o._count.sales + o._count.saleLines > 0) await tx.shopItem.update({ where: { id: o.id }, data: { active: false } });
      else await tx.shopItem.delete({ where: { id: o.id } });
    }
  });
  return { ok: true as const };
}

/**
 * Show or hide one row. Hiding an item never touches its options: an option's
 * own `active: false` means only "dropped from the item but kept because it
 * was sold", and the sale paths refuse any option whose item is hidden.
 */
export async function setItemActive(courseId: string, id: string, active: boolean) {
  const n = await prisma.shopItem.updateMany({ where: { courseId, id }, data: { active } });
  return n.count ? { ok: true as const } : null;
}

/** Delete an item (and its options) — or hide it when any of it was ever sold. */
export async function deleteItem(courseId: string, id: string) {
  const existing = await prisma.shopItem.findFirst({ where: { id, courseId }, select: { id: true, _count: { select: { sales: true, saleLines: true } }, options: { select: { _count: { select: { sales: true, saleLines: true } } } } } });
  if (!existing) return null;
  const sold = existing._count.sales + existing._count.saleLines + existing.options.reduce((s, o) => s + o._count.sales + o._count.saleLines, 0);
  if (sold > 0) {
    // Hiding the item is enough — its options can't be sold while it's hidden.
    await prisma.shopItem.update({ where: { id }, data: { active: false } });
    return { ok: true as const, hidden: true };
  }
  await prisma.shopItem.delete({ where: { id } }); // options go with it (onDelete: Cascade)
  return { ok: true as const, hidden: false };
}

export type { ImportItem };

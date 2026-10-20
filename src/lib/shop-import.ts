// W2-7 (Cam 2026-10-20: "they need to add a ton of stuff"): turn what a course
// already has — rows pasted from a spreadsheet, a CSV export from their old
// POS, or rows the AI read out of a list or invoice — into catalog items.
// Pure, shared by the browser (the preview) and the server (the save).
//
// Columns are found by their header (Item/Name/Product, Category, Price,
// Stock/Qty, Size/Option/Variant, SKU/Barcode/UPC). With no header row the
// order is: name, category, price, stock, sizes, SKU. Sizes may sit in one
// cell ("S/M/L/XL", "S, M, L") or one row per size, as POS exports do — rows
// with the same name and category become one item with options.

export type ImportOption = { label: string; priceCents: number | null; stockCount: number | null; sku: string };
export type ImportItem = {
  name: string; category: string; priceCents: number; stockCount: number | null; sku: string;
  options: ImportOption[];
  /** W2-7 part B: a TAX_CATEGORIES key; the AI suggests one, a paste leaves it to the default. */
  taxCategory?: string;
};
export type ImportRow = { line: number; item: ImportItem | null; error: string };

export const MAX_IMPORT_ITEMS = 500;
export const MAX_OPTIONS = 30;

type Col = 'name' | 'category' | 'price' | 'stock' | 'sizes' | 'sku';
const HEADERS: Record<Col, RegExp> = {
  name: /^(item|items|name|product|product name|item name|description|title)$/,
  category: /^(category|categories|type|department|dept|group)$/,
  price: /^(price|retail|retail price|sell price|selling price|amount|unit price|cost to golfer)$/,
  stock: /^(stock|qty|quantity|on hand|in stock|count|inventory)$/,
  sizes: /^(size|sizes|option|options|variant|variants|color|colour)$/,
  sku: /^(sku|barcode|upc|code|item code|item #|item number|ean)$/,
};
const DEFAULT_ORDER: Col[] = ['name', 'category', 'price', 'stock', 'sizes', 'sku'];

/** Split one line on tabs (a spreadsheet paste) or commas (CSV), honouring "quoted, cells". */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "$12.50" → 1250; '' → null; junk → NaN. */
export function parsePriceCents(v: string): number | null {
  const s = v.replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function parseStock(v: string): number | null {
  const s = v.replace(/[,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : NaN;
}

/** "S/M/L", "S, M, L", "S | M" → ['S','M','L']; one value stays one value. */
function splitSizes(v: string): string[] {
  return v.split(/\s*[\/,|;]\s*/).map(s => s.trim()).filter(Boolean).slice(0, MAX_OPTIONS);
}

export function parseImport(text: string): { rows: ImportRow[]; items: ImportItem[] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
  if (!lines.length) return { rows: [], items: [] };
  const sep = lines.some(l => l.includes('\t')) ? '\t' : ',';
  const cells = lines.map(l => splitLine(l, sep));

  // A header row names at least the item column.
  const head = cells[0].map(c => c.toLowerCase().replace(/[^a-z0-9# ]/g, '').trim());
  const map = new Map<Col, number>();
  head.forEach((h, i) => { for (const [col, re] of Object.entries(HEADERS) as [Col, RegExp][]) if (!map.has(col) && re.test(h)) map.set(col, i); });
  const hasHeader = map.has('name') || (map.size >= 2 && map.has('price'));
  if (!hasHeader) { map.clear(); DEFAULT_ORDER.forEach((c, i) => map.set(c, i)); }
  const at = (row: string[], c: Col) => (map.has(c) ? (row[map.get(c)!] ?? '') : '');

  const rows: ImportRow[] = [];
  const byKey = new Map<string, ImportItem>();
  const order: ImportItem[] = [];
  cells.forEach((row, idx) => {
    if (hasHeader && idx === 0) return;
    const line = idx + 1;
    const name = at(row, 'name').slice(0, 80).trim();
    if (!name) { rows.push({ line, item: null, error: 'No item name.' }); return; }
    const price = parsePriceCents(at(row, 'price'));
    if (price === null || Number.isNaN(price) || price <= 0) { rows.push({ line, item: null, error: `"${name}": no price, or not a number.` }); return; }
    if (price > 1_000_000) { rows.push({ line, item: null, error: `"${name}": over $10,000 — check it.` }); return; }
    const stock = parseStock(at(row, 'stock'));
    if (Number.isNaN(stock)) { rows.push({ line, item: null, error: `"${name}": stock must be a whole number.` }); return; }
    const category = at(row, 'category').slice(0, 40).trim();
    const sku = at(row, 'sku').slice(0, 64).trim();
    const sizes = splitSizes(at(row, 'sizes'));

    const key = `${name.toLowerCase()}|${category.toLowerCase()}`;
    const existing = byKey.get(key);
    if (sizes.length === 1 && existing) {
      // One row per size (a POS export): a further option of the same item.
      if (existing.options.length >= MAX_OPTIONS) { rows.push({ line, item: null, error: `"${name}": more than ${MAX_OPTIONS} sizes.` }); return; }
      existing.options.push({ label: sizes[0], priceCents: price === existing.priceCents ? null : price, stockCount: stock, sku });
      rows.push({ line, item: existing, error: '' });
      return;
    }
    const item: ImportItem = {
      name, category, priceCents: price, stockCount: sizes.length > 1 ? null : stock, sku: sizes.length > 1 ? '' : sku,
      options: sizes.length > 1 ? sizes.map(s => ({ label: s, priceCents: null, stockCount: null, sku: '' })) : [],
    };
    if (sizes.length === 1) item.options = [{ label: sizes[0], priceCents: null, stockCount: stock, sku }];
    byKey.set(key, item); order.push(item);
    rows.push({ line, item, error: '' });
  });

  // A single size is just the item ("One size"); two or more are options, and
  // the item itself then carries no stock or SKU of its own.
  for (const it of order) {
    if (it.options.length === 1) {
      const [o] = it.options;
      it.stockCount = o.stockCount; it.sku = o.sku || it.sku; it.options = [];
    } else if (it.options.length > 1) { it.stockCount = null; it.sku = ''; }
  }
  const items = order.slice(0, MAX_IMPORT_ITEMS);
  return { rows, items };
}

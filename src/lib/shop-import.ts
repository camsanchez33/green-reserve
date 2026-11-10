// W2-7 (Cam 2026-10-20: "they need to add a ton of stuff"): turn what a course
// already has — rows pasted from a spreadsheet, a CSV export from their old
// POS, or rows the AI read out of a list or invoice — into catalog items.
// Pure, shared by the browser (the preview) and the server (the save).
//
// Columns are found by their header (Item/Name/Product, Category, Price,
// Stock/Qty, Size/Option/Variant, SKU/Barcode/UPC, Cost). With no header row
// the order is: name, category, price, stock, sizes, SKU. Sizes may sit in one
// cell ("S/M/L/XL", "S, M, L") or one row per size, as POS exports do — rows
// with the same name and category become one item with options.
//
// IMPORT-2 (pro shop stress test, Cam 2026-11-10: "see how the website does in
// picking those up"): headers are matched by the words in them ("Qty On Hand",
// "Retail Price", "Unit Cost"), so a column is never silently dropped; total
// lines, repeated rows and repeated sizes are left out with a reason; barcodes
// are cleaned (spaces, Excel's 7.40001E+11) and checked; and what looks wrong —
// a barcode on two rows, a price far from the rest of its category, categories
// spelled two ways — is flagged in the preview (`warn`), before anything is added.

export type ImportOption = { label: string; priceCents: number | null; stockCount: number | null; sku: string; costCents?: number | null };
export type ImportItem = {
  name: string; category: string; priceCents: number; stockCount: number | null; sku: string;
  options: ImportOption[];
  /** W2-7 part B: a TAX_CATEGORIES key; the AI suggests one, a paste leaves it to the default. */
  taxCategory?: string;
  /** IMPORT-2: what one costs the shop, from a Cost column (saved only for the owner). */
  costCents?: number | null;
  /** IMPORT-2: things to check before adding — shown in the preview, never sent. */
  warn?: string[];
};
export type ImportRow = { line: number; item: ImportItem | null; error: string };
/** Two spellings of one category: `from` (fewer items) folds into `to`. */
export type CategoryMerge = { from: string; to: string; fromCount: number; toCount: number };
/** A column read by its words, not its whole header — said in the preview, so a guess is never invisible. */
export type HeaderGuess = { kind: string; header: string };
/** Two or more columns that could each be one kind — none is read, and the preview says which. */
export type HeaderClash = { kind: string; headers: string[] };
const KIND: Record<Col, string> = { name: 'item name', category: 'category', price: 'price', stock: 'stock count', sizes: 'sizes', sku: 'barcode', cost: 'cost' };

export const MAX_IMPORT_ITEMS = 500;
export const MAX_OPTIONS = 30;

type Col = 'name' | 'category' | 'price' | 'stock' | 'sizes' | 'sku' | 'cost';
// Pass 1: whole headers we know, exactly ("Qty On Hand", "Retail Price", "Unit Cost", "Item #"). Pass 2, only for a
// kind still unclaimed and a column still unread: the header's words, with what would mislead excluded — "Vendor Name"
// is not the item, "Discount Amount" not the price, "Min Qty" / "Qty Sold" / "Reorder Qty" not the stock, a bare
// "Tax Code" not the barcode (final review 2026-11-10: a looser single pass put all of those in the wrong column).
// Pass 1a — the headers the importer always knew, read exactly as before (leftmost column of a kind wins), so no file
// that imported right before reads differently now. The item name alone goes by rank ("Item Name" before
// "Description"), since a description column often sits first.
const KNOWN: Record<Col, string[]> = {
  name: ['item name', 'product name', 'name', 'item', 'items', 'product', 'title', 'description'],
  category: ['category', 'categories', 'department', 'dept', 'group', 'type'],
  price: ['price', 'retail', 'retail price', 'sell price', 'selling price', 'amount', 'unit price', 'cost to golfer'],
  stock: ['stock', 'qty', 'quantity', 'on hand', 'count', 'inventory', 'in stock'],
  sizes: ['size', 'sizes', 'option', 'options', 'variant', 'variants', 'color', 'colour'],
  sku: ['sku', 'barcode', 'upc', 'code', 'item code', 'item #', 'item number', 'ean'],
  cost: [],
};
// Pass 1b — more whole headers from real POS exports, ranked, only for a kind pass 1a left empty.
const EXACT: Record<Col, string[]> = {
  name: ['item name', 'product name', 'name', 'item', 'items', 'product', 'title', 'description', 'item description', 'item desc', 'product description', 'desc'],
  category: ['category', 'categories', 'type', 'department', 'dept', 'group', 'product type', 'item category', 'product category'],
  price: ['price', 'retail price', 'retail', 'sales price', 'regular price', 'selling price', 'sell price', 'unit price', 'price each', 'cost to golfer', 'amount'],
  stock: ['stock qty', 'current qty', 'qty remaining', 'closing stock', 'qty on hand', 'quantity on hand', 'on hand qty', 'stock on hand', 'on hand', 'qoh', 'qty oh', 'qty in stock', 'quantity in stock', 'current stock', 'stock level', 'free stock', 'stock', 'qty', 'quantity', 'item qty', 'inventory', 'count', 'qty available', 'qty avail'],
  sizes: ['size', 'sizes', 'option', 'options', 'variant', 'variants', 'color', 'colour', 'size color'],
  sku: ['sku', 'sku #', 'barcode', 'bar code', 'upc', 'upc code', 'ean', 'gtin', 'plu', 'code', 'item code', 'item #', 'item#', 'item no', 'item number', 'product code'],
  cost: ['cost', 'unit cost', 'cost price', 'our cost', 'wholesale', 'wholesale price', 'cogs', 'avg cost', 'average cost', 'last cost'],
};
const WORDS: [Col, RegExp, RegExp | null][] = [
  ['sku', /(^| )(sku|upc|ean|gtin|plu|barcode)( |$)/, null],
  ['cost', /(^| )(cost|wholesale|cogs)( |$)/, /golfer|(^| )(center|centre|shipping|freight|order|total|ext|extended|case|code|line)( |$)/],
  ['stock', /(^| )(qty|quantity|on hand|onhand|stock|inventory)( |$)/, /(^| )(reorder|min|max|minimum|maximum|sold|value|alert|par|item|order|ordered|code|id|number|no|#|case|pack|per|received|committed|allocated|ytd|sales|opening|low|safety|threshold|status|unit|turns|take|date)( |$)/],
  ['price', /(^| )(price|retail|msrp)( |$)/, /(^| )(discount|tax|cost|wholesale|purchase|buy|vendor|supplier|dealer|trade|net|landed|ext|extended|total|value|line|compare|promo|member|date)( |$)/],
  ['category', /(^| )(category|department|dept)( |$)/, null],
  ['sizes', /(^| )(size|variant|colou?r)( |$)/, null],
  ['name', /(^| )(name|description|desc|title)( |$)/, /(^| )(id|#|number|no|code|vendor|brand|supplier|manufacturer|type|category|file|image|dept|department|group|class)( |$)/],
];
const DEFAULT_ORDER: Col[] = ['name', 'category', 'price', 'stock', 'sizes', 'sku'];
// The whole name is a total ("TOTAL", "Subtotal (tax not incl.)", "Grand total:") — never "Total Golf Towel".
const TOTAL_LINE = /^(grand\s+)?(sub\s*-?\s*)?totals?\s*(\(.*\))?\s*:?$|^(sales\s+)?tax$/i;

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

/** A barcode's check digit (UPC-A, EAN-8/13, GTIN-14) adds up. */
export function barcodeChecks(d: string): boolean {
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Clean one barcode cell. "0 74000 33219 6" → "074000332196" (a scanner sends no spaces); a number Excel turned into
 * "7.40001E+11" is unreadable — left blank, with why; an all-digit code of a standard length whose check digit
 * doesn't add up is kept, with a warning (a typo means it will never scan).
 */
export function cleanSku(raw: string): { sku: string; warn: string } {
  const v = raw.trim().slice(0, 64);
  if (!v) return { sku: '', warn: '' };
  if (/^\d+(\.\d+e\+?|e\+)\d+$/i.test(v)) return { sku: '', warn: `Barcode "${v}" was turned into a number by the spreadsheet — left blank. Re-save that column as text, or scan it in later.` };
  if (/^[\d\s]+$/.test(v)) {
    const d = v.replace(/\s/g, '');
    if ([12, 13].includes(d.length) && !barcodeChecks(d)) return { sku: d, warn: `Barcode ${d} doesn't add up — a digit may be wrong.` };
    return { sku: d, warn: '' };
  }
  return { sku: v, warn: '' };
}

/** "S/M/L", "S, M, L", "S | M" → ['S','M','L'], each once; one value stays one value. */
function splitSizes(v: string): { sizes: string[]; cut: number } {
  const seen = new Set<string>();
  const all = v.split(/\s*[\/,|;]\s*/).map(s => s.trim()).filter(s => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  return { sizes: all.slice(0, MAX_OPTIONS), cut: Math.max(0, all.length - MAX_OPTIONS) };
}

/** Edit distance, for "Accesories" next to "Accessories". */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return dp[b.length];
}

const addWarn = (it: ImportItem, w: string) => { if (!it.warn) it.warn = []; if (!it.warn.includes(w)) it.warn.push(w); };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * The checks that need the whole list — run on the parse, and again in the preview after staff edit a row: a barcode
 * on two rows, a price far from the rest of its category. Replaces each item's warnings from these checks and keeps
 * the row's own. Returns how many barcodes clash (the save refuses those, so Add waits for them).
 */
export const LIST_WARN = /^(Barcode \S+ is on another row too|Much higher than)/;
export function checkList(items: ImportItem[]): { skuClashes: number } {
  for (const it of items) if (it.warn) it.warn = it.warn.filter(w => !LIST_WARN.test(w));
  const bySku = new Map<string, { code: string; items: ImportItem[] }>();
  for (const it of items) for (const c of [it.sku, ...it.options.map(o => o.sku)]) {
    if (!c) continue;
    const k = c.toLowerCase(); const e = bySku.get(k) ?? { code: c, items: [] }; e.items.push(it); bySku.set(k, e);
  }
  let skuClashes = 0;
  for (const { code, items: list } of bySku.values()) if (list.length > 1) { skuClashes++; for (const it of list) addWarn(it, `Barcode ${code} is on another row too`); }
  // A price far from the rest of its category ($3,299.99 cap among $25 caps; a $45 hot dog next to $4.50 ones).
  const byCat = new Map<string, ImportItem[]>();
  for (const it of items) { const k = it.category.toLowerCase(); byCat.set(k, [...(byCat.get(k) ?? []), it]); }
  for (const [, list] of byCat) {
    if (list.length < 4) continue;
    const prices = list.map(i => i.priceCents).filter(p => p > 0).sort((a, b) => a - b);
    const mid = prices[Math.floor(prices.length / 2)];
    for (const it of list) {
      // Only far above: a mixed category (grips beside drivers) has cheap items on purpose, and a slipped decimal or
      // an extra digit lands high.
      if (it.priceCents > mid * 8) addWarn(it, `Much higher than the rest of ${it.category || 'this list'} (about ${usd(mid)}) — check the price.`);
    }
  }
  return { skuClashes };
}

/** Clear the second and later uses of each repeated barcode (the first row keeps it). */
export function clearRepeatedSkus(items: ImportItem[]): void {
  const seen = new Set<string>();
  const once = (c: string) => { if (!c) return c; const k = c.toLowerCase(); if (seen.has(k)) return ''; seen.add(k); return c; };
  for (const it of items) { it.sku = once(it.sku); for (const o of it.options) o.sku = once(o.sku); }
}

/** Categories spelled two ways ("Accessories" / "Accesories"): the rarer one could fold into the other. */
export function categoryMerges(items: ImportItem[]): CategoryMerge[] {
  const count = new Map<string, number>();
  for (const it of items) if (it.category) count.set(it.category, (count.get(it.category) ?? 0) + 1);
  const cats = [...count.keys()];
  const out: CategoryMerge[] = [];
  for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) {
    const a = cats[i].toLowerCase(), b = cats[j].toLowerCase();
    if (Math.min(a.length, b.length) < 5 || distance(a, b) > 2) continue;
    const [from, to] = count.get(cats[i])! <= count.get(cats[j])! ? [cats[i], cats[j]] : [cats[j], cats[i]];
    out.push({ from, to, fromCount: count.get(from)!, toCount: count.get(to)! });
  }
  return out;
}

export function parseImport(text: string): { rows: ImportRow[]; items: ImportItem[]; skuClashes: number; merges: CategoryMerge[]; costColumn: boolean; unread: string[]; guessed: HeaderGuess[]; unclear: HeaderClash[] } {
  // Row numbers are the file's own lines (blank lines and lines of only commas count, so "row 154" is line 154).
  const kept = text.replace(/\r\n?/g, '\n').split('\n').map((l, i) => ({ l: l.replace(/\s+$/, ''), n: i + 1 })).filter(({ l }) => l.trim() !== '' && l.replace(/[,\t"\s]/g, '') !== '');
  const lines = kept.map(k => k.l);
  if (!lines.length) return { rows: [], items: [], skuClashes: 0, merges: [], costColumn: false, unread: [], guessed: [], unclear: [] };
  const sep = lines.some(l => l.includes('\t')) ? '\t' : ',';
  const cells = lines.map(l => splitLine(l, sep));

  // A header row names at least the item column.
  const head = cells[0].map(c => c.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim());
  // The old reading too (punctuation dropped, not spaced): "Item(s)", "Option(s)", "U.P.C." matched before.
  const headOld = cells[0].map(c => c.toLowerCase().replace(/[^a-z0-9# ]/g, '').trim());
  // A percentage ("Cost %", "Margin %") is never a money or count column.
  const pct = cells[0].map(c => c.includes('%'));
  const map = new Map<Col, number>();
  const taken = new Set<number>();
  const claim = (c: Col, i: number) => { map.set(c, i); taken.add(i); };
  const ranked = (c: Col, list: string[]) => { let best = -1, rank = Infinity; head.forEach((h, i) => { const r = list.indexOf(h); if (r >= 0 && r < rank && !taken.has(i)) { rank = r; best = i; } }); return best; };
  for (const c of Object.keys(KNOWN) as Col[]) {
    // The name and category go by rank ("Categories" before WooCommerce's "Type"); "In stock" is often a yes/no flag,
    // so it is the stock only when no other stock column is there; everything else is leftmost, as before.
    const otherStock = head.some(h => h !== 'in stock' && (KNOWN.stock.includes(h) || EXACT.stock.includes(h)));
    const list = c === 'stock' && otherStock ? KNOWN.stock.filter(h => h !== 'in stock') : KNOWN[c];
    const known = (j: number) => !taken.has(j) && !pct[j] && (list.includes(head[j]) || list.includes(headOld[j]));
    let i = -1;
    if (c === 'name' || c === 'category') { let rank = Infinity; head.forEach((_, j) => { if (!known(j)) return; const r = Math.min(...[list.indexOf(head[j]), list.indexOf(headOld[j])].filter(x => x >= 0)); if (r < rank) { rank = r; i = j; } }); }
    else i = head.findIndex((_, j) => known(j));
    if (i >= 0) claim(c, i);
  }
  // Is this row a header by the old rules alone? (A first row of data whose category is "Retail" is not.)
  const knownHeader = map.has('name') || (map.size >= 2 && map.has('price'));
  const guessed: HeaderGuess[] = [], unclear: HeaderClash[] = [];
  for (const c of Object.keys(EXACT) as Col[]) {
    if (map.has(c)) continue;
    const fits = head.map((h, j) => j).filter(j => !taken.has(j) && !pct[j] && EXACT[c].includes(head[j]));
    // Two whole price or stock headers the old rules didn't know ("Regular Price" and "Sales Price"): which one the
    // shop sells at is the course's call, not ours — neither is read, and the preview names both.
    if ((c === 'price' || c === 'stock') && fits.length > 1) { unclear.push({ kind: KIND[c], headers: fits.map(j => cells[0][j].trim()) }); fits.forEach(j => taken.add(j)); continue; }
    const i = ranked(c, EXACT[c]); if (i >= 0 && !pct[i]) claim(c, i);
  }
  // Pass 2 — the header's words, only when exactly ONE unread column fits a kind still empty. Two that could both be the
  // price ("MSRP" and "Our Price") or the stock ("Case Qty" and "Qty") are both left unread and named in the preview:
  // a wrong price or count is worse than none (final review 2026-11-10).
  for (const [c, re, not] of WORDS) {
    if (map.has(c) || unclear.some(u => u.kind === KIND[c])) continue;
    const fits = head.map((h, i) => ({ h, i })).filter(({ h, i }) => h && !taken.has(i) && !pct[i] && re.test(h) && !(not && not.test(h)));
    if (fits.length === 1) { claim(c, fits[0].i); guessed.push({ kind: KIND[c], header: cells[0][fits[0].i].trim() }); }
    else if (fits.length > 1) unclear.push({ kind: KIND[c], headers: fits.map(f => cells[0][f.i].trim()) });
  }
  // A first row holding a number ("Bag tag,Accessories,12,5") is data, not a header.
  // …unless a whole name or price header says otherwise ("Item,Price,2025").
  const numberIn0 = !knownHeader && cells[0].some(c => /^\$?\d[\d,]*(\.\d+)?$/.test(c.trim()));
  // A kind left unclear, or an "In stock" column that yielded, is still evidence the row is a header — without it,
  // "Article,In Stock,Qty On Hand,Qty Available,Price" read by position turned counts into prices (final review 5).
  const kinds = map.size + unclear.length + (!map.has('stock') && head.includes('in stock') ? 1 : 0);
  const hasHeader = !numberIn0 && (map.has('name') || (kinds >= 2 && map.has('price')));
  if (!hasHeader) { map.clear(); DEFAULT_ORDER.forEach((c, i) => map.set(c, i)); }
  const at = (row: string[], c: Col) => (map.has(c) ? (row[map.get(c)!] ?? '') : '');

  const rows: ImportRow[] = [];
  const byKey = new Map<string, { item: ImportItem; line: number }>();
  const order: ImportItem[] = [];
  cells.forEach((row, idx) => {
    if (hasHeader && idx === 0) return;
    const line = kept[idx].n;
    const name = at(row, 'name').slice(0, 80).trim();
    if (!name) { rows.push({ line, item: null, error: 'No item name.' }); return; }
    if (TOTAL_LINE.test(name)) { rows.push({ line, item: null, error: `"${name}" looks like a total line, not an item.` }); return; }
    const price = parsePriceCents(at(row, 'price'));
    if (price === null || Number.isNaN(price) || price <= 0) { rows.push({ line, item: null, error: `"${name}": no price, or not a number.` }); return; }
    if (price > 1_000_000) { rows.push({ line, item: null, error: `"${name}": over $10,000 — check it.` }); return; }
    // A stock cell that isn't a count ("ten", "12.5") doesn't cost the item — it comes in uncounted, flagged.
    const stockRaw = parseStock(at(row, 'stock'));
    const stock = Number.isNaN(stockRaw) ? null : stockRaw;
    const stockWarn = Number.isNaN(stockRaw) ? `Stock "${at(row, 'stock')}" isn't a whole number — left blank.` : '';
    const costRaw = parsePriceCents(at(row, 'cost'));
    // A cost the save would refuse (over $100,000) or a 0 (unknown, as a blank) comes in blank.
    const cost = costRaw === null || Number.isNaN(costRaw) || costRaw <= 0 || costRaw > 10_000_000 ? null : costRaw;
    const category = at(row, 'category').slice(0, 40).trim();
    const { sku, warn: skuWarn } = cleanSku(at(row, 'sku'));
    const { sizes, cut } = splitSizes(at(row, 'sizes'));

    const key = `${name.toLowerCase()}|${category.toLowerCase()}`;
    const found = byKey.get(key);
    const existing = found?.item;
    if (sizes.length === 1 && existing) {
      // One row per size (a POS export): a further option of the same item — each size once.
      if (existing.options.some(o => o.label.toLowerCase() === sizes[0].toLowerCase())) { rows.push({ line, item: null, error: `"${name}": size ${sizes[0]} is listed twice — the second is left out.` }); return; }
      if (existing.options.length >= MAX_OPTIONS) { rows.push({ line, item: null, error: `"${name}": more than ${MAX_OPTIONS} sizes.` }); return; }
      existing.options.push({ label: sizes[0], priceCents: price === existing.priceCents ? null : price, stockCount: stock, sku, costCents: cost });
      if (skuWarn) addWarn(existing, skuWarn);
      if (stockWarn) addWarn(existing, `${sizes[0]}: ${stockWarn}`);
      rows.push({ line, item: existing, error: '' });
      return;
    }
    // The same item again at the same price with no sizes — a repeated row, not a second item. At another price it
    // may be a typo of either one, so both stay, flagged ($4.50 and $45.00 hot dogs).
    const again = !!existing && sizes.length === 0 && existing.options.length === 0;
    if (again && existing!.priceCents === price && existing!.sku === sku && existing!.stockCount === stock) { rows.push({ line, item: null, error: `"${name}" is the same as row ${found!.line} — left out.` }); return; }
    const item: ImportItem = {
      name, category, priceCents: price, stockCount: sizes.length > 1 ? null : stock, sku: sizes.length > 1 ? '' : sku, costCents: cost,
      options: sizes.length > 1 ? sizes.map(s => ({ label: s, priceCents: null, stockCount: null, sku: '', costCents: cost })) : [],
    };
    if (sizes.length === 1) item.options = [{ label: sizes[0], priceCents: null, stockCount: stock, sku, costCents: cost }];
    if (skuWarn) addWarn(item, skuWarn);
    if (/^(grand\s+)?(sub\s*-?\s*)?totals?\b/i.test(name)) addWarn(item, 'Looks like it could be a total line — remove it if it is.');
    if (stockWarn) addWarn(item, sizes.length === 1 ? `${sizes[0]}: ${stockWarn}` : stockWarn);
    if (again) {
      const diff = (other: number) => existing!.priceCents !== price ? `at another price (${usd(other)})` : 'with another barcode or count';
      addWarn(item, `Same name as row ${found!.line} ${diff(existing!.priceCents)} — keep the right one.`);
      addWarn(existing!, `Same name as row ${line} ${diff(price)} — keep the right one.`);
    }
    if (cut) addWarn(item, `Only the first ${MAX_OPTIONS} sizes are kept (${cut} more in the file).`);
    if (!again) byKey.set(key, { item, line });
    order.push(item);
    rows.push({ line, item, error: '' });
  });

  // A single size is just the item ("One size"); two or more are options, and
  // the item itself then carries no stock or SKU of its own.
  for (const it of order) {
    if (it.options.length === 1) {
      const [o] = it.options;
      it.stockCount = o.stockCount; it.sku = o.sku || it.sku; it.costCents = o.costCents ?? it.costCents; it.options = [];
    } else if (it.options.length > 1) { it.stockCount = null; it.sku = ''; }
  }

  // One spelling per category: "drinks" and "Drinks" are one category, written the way most rows write it.
  const spell = new Map<string, Map<string, number>>();
  for (const it of order) { if (!it.category) continue; const k = it.category.toLowerCase(); const m = spell.get(k) ?? new Map(); m.set(it.category, (m.get(it.category) ?? 0) + 1); spell.set(k, m); }
  for (const it of order) { const m = spell.get(it.category.toLowerCase()); if (m) it.category = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; }

  const items = order.slice(0, MAX_IMPORT_ITEMS);
  const { skuClashes } = checkList(items);
  // The file's columns nothing read — said in the preview, so a column is never lost without a word.
  const unread = hasHeader ? cells[0].filter((h, i) => h.trim() && !taken.has(i)).map(h => h.trim()) : [];
  return { rows, items, skuClashes, merges: categoryMerges(items), costColumn: map.has('cost'), unread, guessed: hasHeader ? guessed : [], unclear: hasHeader ? unclear : [] };
}

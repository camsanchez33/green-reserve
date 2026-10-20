// W2-7 (Cam 2026-10-20: "AI could also help with this"): read a pro-shop list
// the course already has — a supplier invoice, a price sheet, notes typed any
// which way — into catalog rows. The model only READS: what it returns goes to
// the same preview as a paste or CSV (lib/shop-import.ts), staff fix or drop
// rows there, and nothing is saved until they press Add. Server only.
import Anthropic from '@anthropic-ai/sdk';
import { MAX_IMPORT_ITEMS, MAX_OPTIONS, type ImportItem } from './shop-import';
import { isTaxCategory } from './tax-categories';

export const SHOP_READ_MODEL = 'claude-opus-5-5';
export const MAX_READ_CHARS = 20000;

const SYSTEM = `You turn a golf course pro shop's list of things it sells into catalog rows.
The text may be a supplier invoice, a price list, a spreadsheet pasted as text, or notes.
Rules:
- One row per product the shop sells to golfers. Skip totals, tax lines, shipping, discounts, addresses and anything that is not a product.
- price is the price the golfer pays, in US dollars. If the text only gives a wholesale/unit cost, still use it but set priceIsCost true. If there is no price at all, set price to 0.
- sizes: when one product comes in sizes or colors (S/M/L/XL, Navy/White, Men's/Women's), list them as options of ONE row, not separate rows. Otherwise an empty list.
- stock: the quantity on hand or received, if the text gives one; else null.
- category: a short shop category such as Balls, Gloves, Apparel, Headwear, Accessories, Drinks, Snacks, Range, Rentals. Keep the course's own category names when the text has them.
- sku: the item code, SKU, UPC or barcode number if present; else "".
- taxCategory: how the item is usually taxed — general (balls, gloves, tees, equipment, accessories), clothing (shirts, hats, outerwear, shoes), snack, candy, soda (soft and sports drinks), water (plain bottled water), food (prepared to eat now), or none (gift cards).
- Never invent products, prices or quantities that are not in the text.`;

const SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          price: { type: 'number' },
          priceIsCost: { type: 'boolean' },
          stock: { type: ['integer', 'null'] },
          sku: { type: 'string' },
          sizes: { type: 'array', items: { type: 'string' } },
          taxCategory: { type: 'string', enum: ['general', 'clothing', 'snack', 'candy', 'soda', 'water', 'food', 'none'] },
        },
        required: ['name', 'category', 'price', 'priceIsCost', 'stock', 'sku', 'sizes', 'taxCategory'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
} as const;

export type ReadRow = ImportItem & { note: string };

/** Clean what the model returned into import rows; a row missing a name or price is kept with a note so staff see it. */
export function cleanRows(raw: unknown): ReadRow[] {
  const rows = (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown }).rows)) ? (raw as { rows: unknown[] }).rows : [];
  const out: ReadRow[] = [];
  for (const r of rows.slice(0, MAX_IMPORT_ITEMS)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const dollars = typeof o.price === 'number' && Number.isFinite(o.price) && o.price > 0 ? o.price : 0;
    const stock = Number.isInteger(o.stock) && (o.stock as number) >= 0 && (o.stock as number) <= 100000 ? (o.stock as number) : null;
    const sizes = (Array.isArray(o.sizes) ? o.sizes : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().slice(0, 30));
    const unique = sizes.filter((s, i) => sizes.findIndex(x => x.toLowerCase() === s.toLowerCase()) === i).slice(0, MAX_OPTIONS);
    const notes: string[] = [];
    if (!dollars) notes.push('No price found — add one.');
    else if (o.priceIsCost === true) notes.push('This looks like your cost, not your price — check it.');
    out.push({
      name, category: typeof o.category === 'string' ? o.category.trim().slice(0, 40) : '',
      priceCents: Math.round(dollars * 100), stockCount: unique.length > 1 ? null : stock,
      sku: unique.length > 1 ? '' : (typeof o.sku === 'string' ? o.sku.trim().slice(0, 64) : ''),
      options: unique.length > 1 ? unique.map(label => ({ label, priceCents: null, stockCount: null, sku: '' })) : [],
      taxCategory: isTaxCategory(o.taxCategory) ? o.taxCategory : 'general',
      note: notes.join(' '),
    });
  }
  return out;
}

export async function readShopList(text: string): Promise<{ ok: true; rows: ReadRow[] } | { ok: false; error: string }> {
  const client = new Anthropic();
  // Opus 5.5 always thinks, and thinking counts toward max_tokens.
  const msg = await client.messages.create({
    model: SHOP_READ_MODEL, max_tokens: 32000, system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: text }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  if (msg.stop_reason === 'refusal') return { ok: false, error: 'The assistant couldn’t read that list. Try pasting it as plain rows instead.' };
  if (msg.stop_reason === 'max_tokens') return { ok: false, error: 'That list is too long to read at once — split it into a few smaller pastes.' };
  const body = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { ok: false, error: 'The assistant’s answer came back garbled — try again.' }; }
  return { ok: true, rows: cleanRows(parsed) };
}

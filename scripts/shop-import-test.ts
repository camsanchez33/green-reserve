// W2-7 (Cam 2026-10-20): pasted rows, CSV and AI rows into catalog items.
// Pure. Run: npx tsx scripts/shop-import-test.ts
import { parseImport, parsePriceCents } from '../src/lib/shop-import';
import { cleanRows } from '../src/lib/shop-ai-import';
let failed = 0;
const check = (label: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !info ? '' : ' — ' + info}`); if (!ok) failed++; };

// A spreadsheet paste (tabs) with a header in its own order.
const a = parseImport('Price\tItem\tSizes\tQty\n45\tLogo polo\tS/M/L/XL\t\n$54.99\tPro V1 dozen\t\t24');
check('header columns found in any order', a.items.length === 2 && a.items[0].name === 'Logo polo' && a.items[0].priceCents === 4500, JSON.stringify(a.items));
check('sizes in one cell become options', a.items[0].options.map(o => o.label).join() === 'S,M,L,XL' && a.items[0].stockCount === null);
check('a plain item keeps its stock and $ price', a.items[1].priceCents === 5499 && a.items[1].stockCount === 24 && a.items[1].options.length === 0);

// A POS export: one row per size, quoted CSV.
const b = parseImport('Name,Category,Size,Price,On Hand,UPC\n"Hat, rope",Headwear,One size,28,6,0001\nGolf polo,Apparel,S,45,3,111\nGolf polo,Apparel,M,45,5,112\nGolf polo,Apparel,XXL,48,1,113');
const polo = b.items.find(i => i.name === 'Golf polo');
check('quoted commas stay in the cell', b.items[0].name === 'Hat, rope' && b.items[0].category === 'Headwear');
check('one size alone is just the item', b.items[0].options.length === 0 && b.items[0].stockCount === 6 && b.items[0].sku === '0001');
check('rows per size merge into one item with options', !!polo && polo.options.map(o => o.label).join() === 'S,M,XXL', JSON.stringify(polo));
check('…each option keeps its stock and SKU', !!polo && polo.options[1].stockCount === 5 && polo.options[1].sku === '112');
check('…a size priced differently keeps its own price', !!polo && polo.options[2].priceCents === 4800 && polo.options[0].priceCents === null);

// No header: name, category, price, stock, sizes, SKU.
const c = parseImport('Glove,Accessories,20,12\nTees,,5');
check('no header uses the default order', c.items.length === 2 && c.items[0].stockCount === 12 && c.items[1].priceCents === 500);

// Problems are reported, not guessed.
const d = parseImport('Item\tPrice\nBroken\tabc\n\t10\nOK\t3');
check('a row with a bad price is left out with a reason', d.items.length === 1 && d.rows.filter(r => r.error).length === 2, JSON.stringify(d.rows));
check('prices parse dollars and cents', parsePriceCents('$1,234.50') === 123450 && parsePriceCents('') === null && Number.isNaN(parsePriceCents('x') as number));

// What the AI returns is cleaned before the preview.
const ai = cleanRows({ rows: [
  { name: 'Logo polo', category: 'Apparel', price: 45, priceIsCost: false, stock: null, sku: '', sizes: ['S', 'M', 'm', 'L'] },
  { name: 'Titleist cap', category: 'Headwear', price: 0, priceIsCost: false, stock: 12, sku: 'TC1', sizes: [] },
  { name: 'Gloves (case)', category: 'Gloves', price: 9.5, priceIsCost: true, stock: 24, sku: '', sizes: [] },
  { name: '', category: 'x', price: 1, priceIsCost: false, stock: null, sku: '', sizes: [] },
] });
check('AI rows: duplicate sizes dropped, options made', ai[0].options.map(o => o.label).join() === 'S,M,L');
check('AI rows: no price is flagged, not invented', ai[1].priceCents === 0 && /No price/.test(ai[1].note));
check('AI rows: a cost price is flagged to check', /cost/.test(ai[2].note) && ai[2].priceCents === 950);
check('AI rows: a row with no name is dropped', ai.length === 3);
check('AI rows: junk input gives no rows', cleanRows('nope').length === 0 && cleanRows({ rows: 'x' }).length === 0);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

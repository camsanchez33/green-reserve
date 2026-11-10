// W2-7 (Cam 2026-10-20): pasted rows, CSV and AI rows into catalog items.
// Pure. Run: npx tsx scripts/shop-import-test.ts
import { parseImport, parsePriceCents, cleanSku, clearRepeatedSkus, checkList } from '../src/lib/shop-import';
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

// IMPORT-2 (pro shop stress test 2026-11-10): an old POS export, with the mess a real one has.
const csv = [
  'Item Name,Category,Retail Price,Qty On Hand,Size,UPC,Unit Cost',
  'Pro V1 Dozen,Golf Balls,54.99,24,,036000291452,38.00',
  'Pro V1 Sleeve,golf balls,19.99,40,,0 36000 29145 2,13.00',
  'Logo Polo,Apparel,64.99,3,M,111,30',
  'Logo Polo,Apparel,64.99,4,M,112,30',
  'Logo Polo,Apparel,64.99,2,L,113,30',
  'Cap,Headwear,24.99,5,,7.40001E+11,',
  'Cap Rope,Headwear,26.99,ten,,222,',
  'Cap Visor,Headwear,22.99,4,,333,',
  'Cap Fitted,Headwear,3299.99,2,,444,',
  'Hot Dog,Grill,4.50,40,,555,',
  'Hot Dog,Grill,45.00,10,,556,',
  'Water,Drinks,2.00,90,,777,',
  'Water,Drinks,2.00,90,,777,',
  'Tees,Accessories,5,10,,036000291452,',
  'Towel,Accessories,15,10,,888,', 'Divot tool,Accessories,9,10,,889,', 'Marker,Accesories,4,10,,890,',
  ',,,,,,',
  'TOTAL,,4213.55,,,,',
  'Subtotal (tax not incl.),,3890.10,,,,',
].join('\n');
const m = parseImport(csv);
const by = (n: string) => m.items.filter(i => i.name === n);
const out = (re: RegExp) => m.rows.some(r => r.error && re.test(r.error));
check('"Qty On Hand" and "Unit Cost" headers are read (stock and cost kept)', by('Pro V1 Dozen')[0]?.stockCount === 24 && by('Pro V1 Dozen')[0]?.costCents === 3800 && m.costColumn, JSON.stringify(by('Pro V1 Dozen')));
check('total lines are left out, with why', !by('TOTAL').length && !by('Subtotal (tax not incl.)').length && out(/looks like a total line/));
check('row numbers are the file\'s own lines', m.rows.some(r => r.line === 20 && /TOTAL/.test(r.error)), JSON.stringify(m.rows.filter(r => r.error)));
check('a repeated row is left out; the same name at another price stays, flagged both ways', by('Water').length === 1 && out(/same as row 13/) && by('Hot Dog').length === 2 && by('Hot Dog').every(h => h.warn?.some(w => /another price/.test(w))));
check('a size listed twice keeps the first', by('Logo Polo')[0]?.options.map(o => o.label).join() === 'M,L' && out(/size M is listed twice/));
check('barcodes lose their spaces; an Excel number is left blank with why', by('Pro V1 Sleeve')[0]?.sku === '036000291452' && by('Cap')[0]?.sku === '' && by('Cap')[0]?.warn?.some(w => /turned into a number/.test(w)) === true);
check('a barcode on two rows (one written with spaces) is flagged on each and counted once', m.skuClashes === 1 && by('Pro V1 Sleeve')[0]?.warn?.some(w => /on another row too/.test(w)) === true && by('Tees')[0]?.warn?.some(w => /on another row too/.test(w)) === true);
check('a bad stock cell keeps the item, uncounted and flagged', by('Cap Rope')[0]?.stockCount === null && by('Cap Rope')[0]?.warn?.some(w => /isn't a whole number/.test(w)) === true);
check('a price far above its category is flagged', by('Cap Fitted')[0]?.warn?.some(w => /Much higher/.test(w)) === true && !by('Cap Visor')[0]?.warn?.length);
check('category case folds into one spelling', by('Pro V1 Sleeve')[0]?.category === 'Golf Balls');
check('a near-miss spelling is offered as a merge', m.merges.some(x => x.from === 'Accesories' && x.to === 'Accessories'));
check('a barcode with a wrong check digit is kept, flagged', cleanSku('036000291453').sku === '036000291453' && /doesn't add up/.test(cleanSku('036000291453').warn) && cleanSku('ABC-12').sku === 'ABC-12');
const fixed = m.items.map(i => ({ ...i, options: i.options.map(o => ({ ...o })) })); clearRepeatedSkus(fixed);
check('clearing repeats keeps the first use of each barcode', checkList(fixed).skuClashes === 0 && fixed.find(i => i.name === 'Pro V1 Dozen')?.sku === '036000291452' && fixed.find(i => i.name === 'Tees')?.sku === '');
check('the old exact headers still work', parseImport('Item,Price,Stock,SKU\nA,5,3,X1').items[0]?.stockCount === 3 && parseImport('Item,Price,Stock,SKU\nA,5,3,X1').items[0]?.sku === 'X1');

// Final review 2026-11-10: headers that must not land in the wrong column.
const one = (csv: string) => parseImport(csv).items[0];
check('"Item #" is the barcode, "Item Name" the name', one('Item #,Item Name,Retail Price,Qty On Hand\n1001,Glove,20,5')?.name === 'Glove' && one('Item #,Item Name,Retail Price,Qty On Hand\n1001,Glove,20,5')?.sku === '1001' && one('Item#,Description,Price\n1001,Glove,20')?.sku === '1001');
check('"Product ID" / "Item ID" is not the name', one('Product ID,Product,Price\n77,Glove,20')?.name === 'Glove' && one('Item ID,Item,Price\n77,Glove,20')?.name === 'Glove');
check('"Vendor Name" / "Brand Name" is not the item', one('Vendor Name,Item Name,Price\nTitleist,Pro V1,50')?.name === 'Pro V1' && one('Brand Name,Product Name,Price\nTitleist,Pro V1,50')?.name === 'Pro V1');
check('"Discount Amount" / "Tax Amount" is not the price', one('Name,Discount Amount,Price\nGlove,2,20')?.priceCents === 2000 && one('Name,Tax Amount,Price\nGlove,1.2,20')?.priceCents === 2000);
check('"Min Stock" / "Min Qty" / "Reorder Qty" / "Qty Sold" are not the stock', one('Item,Price,Min Stock,Stock\nGlove,20,5,12')?.stockCount === 12 && one('Name,Price,Min Qty,Qty\nGlove,20,5,12')?.stockCount === 12 && one('Item,Price,Reorder Qty,Qty On Hand\nGlove,20,5,12')?.stockCount === 12 && one('Item,Price,Qty Sold,Qty On Hand\nGlove,20,300,12')?.stockCount === 12);
check('"Tax Code" / "Dept Code" are not the barcode', one('Item,Price,Tax Code,SKU\nGlove,20,TX1,S1')?.sku === 'S1' && one('Dept Code,Item,Price,UPC\n40,Glove,20,036000291452')?.sku === '036000291452');
check('"Item Type" is not the category when "Category" is there; "Stock Item" is not the stock', one('Item,Item Type,Category,Price\nGlove,Inventory,Acc,20')?.category === 'Acc' && one('Item,Stock Item,Price,Qty\nGlove,Y,20,4')?.stockCount === 4);
check('a first row of data is not read as a header', parseImport('Bag name tag,Accessories,12,5\nGlove,Accessories,20,4').items.length === 2);
check('"Total Golf Towel" is an item; "Grand total:" is not', parseImport('Item,Price\nTotal Golf Towel,25\nGrand total:,25').items.map(i => i.name).join() === 'Total Golf Towel');
check('a repeat with another barcode or count stays, flagged, not left out', parseImport('Item,Category,Price,Stock,SKU\nWater,Drinks,2,90,W1\nWater,Drinks,2,40,W2').items.length === 2 && parseImport('Item,Category,Price,Stock,SKU\nWater,Drinks,2,90,W1\nWater,Drinks,2,40,W2').items[1].warn?.some(w => /another barcode or count/.test(w)) === true);
check('"12E34" and "123-456" are barcodes, kept as typed', cleanSku('12E34').sku === '12E34' && cleanSku('123-456').sku === '123-456' && cleanSku('7E+11').sku === '');
check('a cost over $100,000 or of 0 comes in blank', one('Item,Price,Cost\nA,5,1000000000')?.costCents === null && one('Item,Price,Cost\nA,5,0')?.costCents === null);

// Final review round 2: the header that ranks first wins; codes aren't stock; a numeric header cell.
check('"Price" wins over "MSRP" / "Sale Price" to its left', one('Item,MSRP,Price\nGlove,30,20')?.priceCents === 2000 && parseImport('Item,Sale Price,Price\nGlove,,20\nTees,4,5').items.map(i => i.priceCents).join() === '2000,500' && one('Item #,Description,Dept,Cost,MSRP,Price,QOH\n1001,Glove,ACC,8,25,20,12')?.priceCents === 2000);
check('"Stock Code" / "Stock #" / "Stock ID" are not the stock', one('Stock Code,Description,Category,Cost Price,Selling Price,Free Stock\n10045,Glove,ACC,8,20,12')?.stockCount === 12 && one('Stock #,Description,Price,Qty OH\n10045,Glove,20,12')?.stockCount === 12 && one('Stock ID,Description,Price,Stock Level\n10045,Glove,20,12')?.stockCount === 12);
check('a header with a number in it is still a header', parseImport('Item,Price,2025\nGlove,20,7').items.map(i => `${i.name}:${i.priceCents}`).join() === 'Glove:2000');
check('"On Hand" over "Available"; "Product Name" over "Product Description"', one('Item,Price,Available,On Hand\nGlove,20,5,7')?.stockCount === 7 && one('Product Description,Product Name,Price\nA nice glove,Glove,20')?.name === 'Glove');
check('"Dept Name" is not the item', one('Dept Code,Dept Name,Item Desc,Price\n40,Accessories,Glove,20')?.name === 'Glove');
check('columns nothing read are listed', parseImport('Item,Price,Price inc Tax,Supplier\nGlove,20,22,Acme').unread.join() === 'Price inc Tax,Supplier');
check('"Total Inventory Value" is flagged, not dropped', parseImport('Item,Price\nTotal Inventory Value,4213.55').items[0]?.warn?.some(w => /total line/.test(w)) === true);

// Final review round 3: no guessing between two columns; a guess is named; what read right before still does.
const full = (csv: string) => parseImport(csv);
check('two columns that could be the price: neither is read, and it says so', !full('Item,MSRP,Our Price\nGlove,30,20').items.length && full('Item,MSRP,Our Price\nGlove,30,20').unclear.some(u => u.kind === 'price' && u.headers.length === 2));
check('a buying price is never the selling price', one('Item,Purchase Price,Sales Price,Qty\nGlove,8,20,5')?.priceCents === 2000 && one('Item,Buy Price,Sale Price\nGlove,8,20')?.priceCents === 2000 && one('Item,Vendor Price,Store Price\nGlove,8,20')?.priceCents === 2000 && one('Description,Net Price,List Price\nGlove,8,20')?.priceCents === 2000 && !full('Item,Purchase Price\nGlove,8').items.length);
check('a line total is never the price', !full('Item,Qty,Ext Price\nGlove,10,200').items.length && one('Item,Qty,Unit Price,Price\nGlove,10,20,200')?.priceCents === 2000);
check('member / promo / sale prices are not the price', one('Item,Member Price,Regular Price\nGlove,15,20')?.priceCents === 2000 && one('Name,Promo Price,Standard Price\nGlove,15,20')?.priceCents === 2000 && parseImport('Item,Sale Price,Regular Price\nGlove,,20\nTees,4,5').items.map(i => i.priceCents).join() === '2000,500');
check('a price read by its words is named in the preview', full('Item,Vendor Price,Store Price\nGlove,8,20').guessed.some(g => g.kind === 'price' && g.header === 'Store Price'));
check('case, received, YTD, opening, safety quantities are not the stock', one('Item,Price,Case Qty,Stock Qty\nGlove,20,12,3')?.stockCount === 3 && one('Item,Price,Qty Per Case\nGlove,20,12')?.stockCount === null && one('Name,Price,YTD Qty,Stock Qty\nGlove,20,300,5')?.stockCount === 5 && one('Item,Price,Qty Received,Qty Remaining\nGlove,20,24,3')?.stockCount === 3 && one('Item,Price,Opening Stock,Closing Stock\nGlove,20,24,3')?.stockCount === 3 && one('Name,Price,Safety Stock,Current Qty\nGlove,20,2,5')?.stockCount === 5);
check('"Stock" over a yes/no "In Stock"; Barcode over SKU when Barcode comes first (as before)', one('Item,Price,Stock,In Stock\nGlove,20,5,1')?.stockCount === 5 && one('Name,SKU,In stock?,Stock,Regular price\nGlove,G1,1,5,20')?.stockCount === 5 && one('Name,Barcode,SKU,Price\nGlove,036000291452,G1,20')?.sku === '036000291452');
check('WooCommerce: "Categories" over "Type"', one('ID,Type,SKU,Name,Regular price,Categories\n1,simple,G1,Glove,20,Golf')?.category === 'Golf');
check('"Cost Center" and "Stock Take" are not read', one('Item,Price,Cost Center\nGlove,20,400')?.costCents === null && one('Item,Price,Stock Take\nGlove,20,2026-01-01')?.stockCount === null);

// Final review round 4.
check('"Regular Price" and "Sales Price" together: neither is read, both named', !full('Item,Regular Price,Sales Price\nGlove,20,15').items.length && full('Item,Regular Price,Sales Price\nGlove,20,15').unclear.some(u => u.kind === 'price' && u.headers.length === 2) && !full('Item,Sales Price,Regular Price\nGlove,15,20').items.length);
check('a headerless file whose category is "Retail" still imports', parseImport('Cap,Retail,25,5,One Size\nTees,Retail,5,10\nTowel,Retail,15,3').items.length === 3 && parseImport('Logo name tag,Retail,9,10\nGlove,Retail,20,5').items.length === 2 && parseImport('Mid Size Grip,Retail,12.99,8\nGlove,Retail,20,5').items.length === 2);
check('"Item(s)", "Option(s)" and "U.P.C." read as before', one('Item(s),Price\nGlove,20')?.name === 'Glove' && one('Item,Price,Option(s)\nPolo,40,S/M')?.options.length === 2 && one('Item,Price,U.P.C.\nGlove,20,036000291452')?.sku === '036000291452');
check('"In Stock" yields to "Qty On Hand"; a bare "Available" is not stock', one('Name,Price,In Stock,Qty On Hand\nGlove,20,1,5')?.stockCount === 5 && one('Item,Price,Available\nGlove,20,1')?.stockCount === null);
check('"Cost %" and "Total Cost" are never the cost', one('Item,Price,Cost %,Cost\nGlove,20,40,8')?.costCents === 800 && one('Item,Price,Total Cost\nGlove,20,80')?.costCents === null);

// Final review round 5.
check('an unknown item header with two stock columns is still a header (counts never become prices)', !full('Article,In Stock,Qty On Hand,Qty Available,Price\nGlove,1,5,3,20\nTees,1,40,40,5').items.length && full('Article,In Stock,Qty On Hand,Qty Available,Price\nGlove,1,5,3,20').unclear.some(u => u.kind === 'stock count'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

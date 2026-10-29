// W2-7: items with options (sizes/colors) and bulk adds, against a real
// database. Run: npx tsx scripts/shop-options-db-test.ts (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { createItems, updateItem, setItemActive, deleteItem } from '../src/lib/shop-catalog';
import { createSale } from '../src/lib/shop-sales';
const TAG = 'w27opt';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
async function cleanup() {
  const cs = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids }, parentId: { not: null } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (s: string) => prisma.course.create({ data: { name: s, slug: `${TAG}-${s}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18 } });
  const c = await mk('a'), other = await mk('b');

  const r = await createItems(c.id, [
    { name: 'Logo polo', category: 'Apparel', priceCents: 4500, options: [{ label: 'S', priceCents: null, stockCount: 3, sku: 'P-S' }, { label: 'XXL', priceCents: 4800, stockCount: 1, sku: 'P-XXL' }] },
    { name: 'Glove', category: 'Accessories', priceCents: 2000, stockCount: 10, sku: 'G1' },
  ]);
  ok('bulk add creates both items', r.ok && r.created === 2, JSON.stringify(r));
  const rows = await prisma.shopItem.findMany({ where: { courseId: c.id } });
  const polo = rows.find(x => x.name === 'Logo polo')!;
  const s = rows.find(x => x.optionLabel === 'S')!, xxl = rows.find(x => x.optionLabel === 'XXL')!;
  ok('options are rows under the item, named "item — option"', s.parentId === polo.id && s.name === 'Logo polo — S' && s.priceCents === 4500 && xxl.priceCents === 4800 && s.stockCount === 3);

  const bad = await createItems(c.id, [{ name: 'X', priceCents: 100, options: [{ label: 'Only' }] }, { name: 'Y', priceCents: 100 }]);
  ok('one bad row stops the whole bulk add', !bad.ok && (await prisma.shopItem.count({ where: { courseId: c.id, name: 'Y' } })) === 0);
  // Revamp 3 fix 9: one code, one item — a re-import used to make a second item with the same SKU.
  const dupImport = await createItems(c.id, [{ name: 'Glove again', priceCents: 2000, sku: 'g1' }]);
  ok('a code already on another item is refused, by name', !dupImport.ok && /already on Glove/.test(dupImport.error), JSON.stringify(dupImport));
  const twice = await createItems(c.id, [{ name: 'A', priceCents: 100, sku: 'Z9' }, { name: 'B', priceCents: 100, sku: 'z9' }]);
  ok('…and a code used twice in one import', !twice.ok && /used twice/.test(twice.error));
  const otherCourse = await createItems(other.id, [{ name: 'Their glove', priceCents: 2000, sku: 'G1' }]);
  ok('…another course may use the same code', otherCourse.ok);
  const gloveRow = rows.find(x => x.name === 'Glove')!;
  const keepOwn = await updateItem(c.id, gloveRow.id, { name: 'Glove', category: 'Accessories', priceCents: 2100, stockCount: 10, sku: 'G1' });
  ok('…an item keeps its own code when edited', !!keepOwn && keepOwn.ok, JSON.stringify(keepOwn));
  const stealCode = await updateItem(c.id, gloveRow.id, { name: 'Glove', category: 'Accessories', priceCents: 2100, stockCount: 10, sku: 'P-S' });
  ok('…but can\'t take an option\'s code', !!stealCode && !stealCode.ok);

  const parentSale = await createSale({ courseId: c.id, lines: [{ shopItemId: polo.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  ok('the item itself cannot be sold, only an option', !parentSale.ok);
  const sale = await createSale({ courseId: c.id, lines: [{ shopItemId: s.id, quantity: 2 }], pay: 'cash', soldBy: 't' });
  ok('an option sells at its price and its name', sale.ok, JSON.stringify(sale));
  const line = await prisma.shopSaleLine.findFirst({ where: { shopItemId: s.id } });
  ok('…the sale line reads "Logo polo — S"', line?.name === 'Logo polo — S' && line?.unitPriceCents === 4500);
  ok('…and takes its own stock', (await prisma.shopItem.findUnique({ where: { id: s.id } }))?.stockCount === 1);
  const foreign = await createSale({ courseId: other.id, lines: [{ shopItemId: s.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  ok('another course cannot sell it', !foreign.ok);

  // Rename, drop the sold option, add M.
  const u = await updateItem(c.id, polo.id, { name: 'Club polo', category: 'Apparel', priceCents: 5000, options: [{ id: xxl.id, label: 'XXL', priceCents: null, stockCount: 1 }, { label: 'M', stockCount: 4 }] });
  ok('edit saves', !!u && u.ok, JSON.stringify(u));
  const after = await prisma.shopItem.findMany({ where: { parentId: polo.id } });
  const sAfter = after.find(x => x.id === s.id)!;
  ok('a dropped option that was sold is hidden, not deleted', !!sAfter && !sAfter.active);
  ok('kept and new options carry the new name and price', after.find(x => x.id === xxl.id)?.name === 'Club polo — XXL' && after.find(x => x.optionLabel === 'M')?.priceCents === 5000);
  ok('the past sale line keeps its old name and price', (await prisma.shopSaleLine.findFirst({ where: { shopItemId: s.id } }))?.name === 'Logo polo — S');
  ok('another course cannot edit it', (await updateItem(other.id, polo.id, { name: 'x', priceCents: 1 })) === null);

  await setItemActive(c.id, polo.id, false);
  const m = after.find(x => x.optionLabel === 'M')!;
  ok('an option of a hidden item cannot be sold', !(await createSale({ courseId: c.id, lines: [{ shopItemId: m.id, quantity: 1 }], pay: 'cash', soldBy: 't' })).ok);
  ok('hiding the item leaves its options as they were', (await prisma.shopItem.count({ where: { parentId: polo.id, active: true } })) === 2);
  // Edit the hidden item (a rename): its options survive with their stock and SKUs.
  await updateItem(c.id, polo.id, { name: 'Club polo', category: 'Apparel', priceCents: 5000 });
  const kept = await prisma.shopItem.findMany({ where: { parentId: polo.id, active: true } });
  ok('editing a hidden item keeps its options', kept.length === 2 && kept.some(x => x.optionLabel === 'M' && x.stockCount === 4));
  await setItemActive(c.id, polo.id, true);
  ok('showing it again does not bring back a dropped option', (await prisma.shopItem.findUnique({ where: { id: s.id } }))?.active === false);
  ok('…and its options sell again', (await createSale({ courseId: c.id, lines: [{ shopItemId: m.id, quantity: 1 }], pay: 'cash', soldBy: 't' })).ok);
  await setItemActive(c.id, polo.id, false);
  const del = await deleteItem(c.id, polo.id);
  ok('an item with a sold option is hidden, not deleted', !!del && del.hidden && !!(await prisma.shopItem.findUnique({ where: { id: polo.id } })));
  const glove = rows.find(x => x.name === 'Glove')!;
  const del2 = await deleteItem(c.id, glove.id);
  ok('a never-sold item is deleted', !!del2 && !del2.hidden && !(await prisma.shopItem.findUnique({ where: { id: glove.id } })));
  ok('another course cannot delete', (await deleteItem(other.id, polo.id)) === null);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('shop-options-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

// Revamp 3 dead ends 15 and 23 (Cam 2026-10-29): the register's sale history and
// lookup, a return by item (its share of the discount and tax, restocked), and a
// same-day void of a cash sale before the drawer is counted. Needs a database.
// Run: npx tsx scripts/shop-returns-db-test.ts
import { prisma } from '../src/lib/prisma';
import { createSale, refundSale, voidCashSale, findSales, returnAmount } from '../src/lib/shop-sales';
import { closeDay } from '../src/lib/register-close';

const TAG = 'shopreturnsdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.registerClose.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  // The maths: $50 + $40 of items, $9 off, $8.10 tax. Returning the $40 item gives back $36 + $3.60 tax.
  const pure = { discountCents: 900, taxCents: 810, lines: [
    { id: 'a', unitPriceCents: 2500, quantity: 2, returnedQty: 0, bookingId: null },
    { id: 'b', unitPriceCents: 4000, quantity: 1, returnedQty: 0, bookingId: null },
    { id: 'r', unitPriceCents: 5000, quantity: 1, returnedQty: 0, bookingId: 'bk' },
  ] };
  const one = returnAmount(pure, [{ lineId: 'b', quantity: 1 }]);
  ok('a return gives back the item\'s share after the discount, plus its tax', one.ok && one.cents === 3600 + 360, one);
  ok('…never more than was sold', !returnAmount(pure, [{ lineId: 'a', quantity: 3 }]).ok);
  ok('…and never a green fee line', !returnAmount(pure, [{ lineId: 'r', quantity: 1 }]).ok);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Returns GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const other = await prisma.course.create({ data: { name: 'Other', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const hat = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Logo hat', priceCents: 2500, stockCount: 10 } });
  const glove = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Glove', priceCents: 4000, stockCount: 5 } });

  const sale = await createSale({ courseId: c.id, lines: [{ shopItemId: hat.id, quantity: 2 }, { shopItemId: glove.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerName: 'Pat Example' });
  ok('a cash sale takes stock', sale.ok && (await prisma.shopItem.findUniqueOrThrow({ where: { id: hat.id } })).stockCount === 8);
  if (!sale.ok) throw new Error('sale failed');
  const hatLine = sale.value.lines.find(l => l.name === 'Logo hat')!;
  const ret = await refundSale(c.id, sale.value.id, { lines: [{ lineId: hatLine.id, quantity: 1 }], reason: 'wrong size' }, 't');
  const afterRet = await prisma.shopSaleLine.findUniqueOrThrow({ where: { id: hatLine.id } });
  ok('a hat comes back: $25 refunded, one back on the shelf', ret.ok && ret.value.sale.refundedCents === 2500 && afterRet.returnedQty === 1 && (await prisma.shopItem.findUniqueOrThrow({ where: { id: hat.id } })).stockCount === 9, ret);
  ok('…it can\'t come back twice past what was sold', !(await refundSale(c.id, sale.value.id, { lines: [{ lineId: hatLine.id, quantity: 2 }], reason: 'x' }, 't')).ok);
  ok('…and a part-refunded sale can\'t be voided', !(await voidCashSale(c.id, sale.value.id)).ok);

  // A mistake rung up, voided the same day.
  const oops = await createSale({ courseId: c.id, lines: [{ shopItemId: glove.id, quantity: 2 }], pay: 'cash', soldBy: 't' });
  if (!oops.ok) throw new Error('sale failed');
  ok('another course can\'t void it', !(await voidCashSale(other.id, oops.value.id)).ok);
  const v = await voidCashSale(c.id, oops.value.id);
  ok('a cash sale voided the same day: void, and the gloves back on the shelf', v.ok && v.value.status === 'void' && (await prisma.shopItem.findUniqueOrThrow({ where: { id: glove.id } })).stockCount === 4, v);
  const later = await createSale({ courseId: c.id, lines: [{ shopItemId: glove.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  if (!later.ok) throw new Error('sale failed');
  await closeDay(c.id, { openingFloatCents: 0, countedCashCents: 0 }, 'desk');
  ok('after the drawer is counted, it must be a refund', !(await voidCashSale(c.id, later.value.id)).ok);
  await prisma.shopSale.update({ where: { id: later.value.id }, data: { paidAt: new Date(Date.now() - 2 * 86400000) } });
  ok('…and a sale from an earlier day is never voided', /earlier day/.test(((await voidCashSale(c.id, later.value.id)) as { error?: string }).error ?? ''));

  // History: by customer, by item, by receipt number, by day; never another course's.
  const byName = await findSales(c.id, { q: 'pat ex' });
  ok('find a sale by the customer', byName.ok && byName.value.some(s => s.id === sale.value.id));
  const byItem = await findSales(c.id, { q: 'glove' });
  ok('…by an item on it', byItem.ok && byItem.value.length >= 2);
  const byReceipt = await findSales(c.id, { q: sale.value.id.slice(-6) });
  ok('…by the end of its receipt number', byReceipt.ok && byReceipt.value.some(s => s.id === sale.value.id));
  const today = new Date().toISOString().slice(0, 10);
  const byDay = await findSales(c.id, { day: today });
  ok('…or every sale on a day', byDay.ok && byDay.value.some(s => s.id === oops.value.id));
  ok('…and never another course\'s', (await findSales(other.id, { q: 'glove' })).ok && ((await findSales(other.id, { q: 'glove' })) as { value: unknown[] }).value.length === 0);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('shop-returns-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

// SHOP-4 (Cam 2026-10-30: "Low stock + receiving", "Shop sales report", cost "only the
// owner sees", "scan to add"): deliveries, reorder points, cost and the sales report.
// Needs a database. Run: npx tsx scripts/shop-stock-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { receiveStock, setReorder, setCost, stockRows, isLow, recentReceipts } from '../src/lib/shop-stock';
import { shopReport, summarize } from '../src/lib/shop-report';
import { createSale } from '../src/lib/shop-sales';
import { WIPED_TABLES } from '../src/lib/data-reset';
import { todayIn } from '../src/lib/course-time';

const TAG = 'shopstockdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopStockReceipt.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids }, parentId: { not: null } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  ok('low means counted, with a reorder point, at or below it', isLow({ stockCount: 2, reorderAt: 2 }) && !isLow({ stockCount: 3, reorderAt: 2 }) && !isLow({ stockCount: null, reorderAt: 2 }) && !isLow({ stockCount: 0, reorderAt: null }));
  const sum = summarize([
    { shopItemId: 'a', name: 'Balls', unitPriceCents: 4000, qty: 2, via: 'walkup' },
    { shopItemId: 'a', name: 'Balls', unitPriceCents: 4000, qty: 1, via: 'round' },
    { shopItemId: null, name: 'Lesson', unitPriceCents: 5000, qty: 1, via: 'walkup' },
  ], new Map([['a', { category: 'Balls', costCents: 2500 }]]), { cost: true, discountsCents: 0 });
  ok('the report adds walk-up and round sales, best seller first', sum.items[0].name === 'Balls' && sum.items[0].qty === 3 && sum.totals.salesCents === 17000 && sum.totals.walkUpCents === 13000, sum);
  ok('…margin only where a cost is entered', sum.items[0].marginCents === 4500 && sum.items[1].marginCents === null && sum.totals.marginCents === 4500 && sum.totals.costedSalesCents === 12000, sum);
  const noCost = summarize([{ shopItemId: 'a', name: 'Balls', unitPriceCents: 4000, qty: 1, via: 'walkup' }], new Map([['a', { category: 'Balls', costCents: 2500 }]]), { cost: false, discountsCents: 0 });
  ok('…and no cost or margin for anyone but the owner', !('costCents' in noCost.items[0]) && !('marginCents' in noCost.items[0]) && !('marginCents' in noCost.totals));

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Shop ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'America/New_York' } });
  const c = await mk('a'), other = await mk('b');
  const balls = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Pro V1', category: 'Balls', priceCents: 5000, stockCount: 3 } });
  const tee = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Tees', category: 'Accessories', priceCents: 300 } });
  const shirt = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Polo', category: 'Apparel', priceCents: 6000 } });
  await prisma.shopItem.create({ data: { courseId: c.id, name: 'Polo — M', category: 'Apparel', priceCents: 6000, parentId: shirt.id, optionLabel: 'M', stockCount: 4 } });

  const r1 = await receiveStock(c.id, balls.id, { quantity: 12, unitCostCents: 3100, note: 'Titleist order' }, 'owner@x', true);
  const afterBalls = await prisma.shopItem.findUniqueOrThrow({ where: { id: balls.id } });
  ok('a delivery adds to the shelf and sets the cost', r1.ok && afterBalls.stockCount === 15 && afterBalls.costCents === 3100, afterBalls);
  const r2 = await receiveStock(c.id, tee.id, { quantity: 50 }, 'desk@x', false);
  ok('an item not counted yet starts counting at what came in', r2.ok && (await prisma.shopItem.findUniqueOrThrow({ where: { id: tee.id } })).stockCount === 50);
  ok('staff can\'t enter a cost on a delivery', !(await receiveStock(c.id, tee.id, { quantity: 1, unitCostCents: 10 }, 'desk@x', false)).ok);
  ok('a delivery of nothing is refused', !(await receiveStock(c.id, tee.id, { quantity: 0 }, 'desk@x', false)).ok);
  ok('stock is counted on each option, not on the item', !(await receiveStock(c.id, shirt.id, { quantity: 5 }, 'x', true)).ok && !(await setReorder(c.id, shirt.id, 2)).ok);
  ok('another course\'s item is refused', !(await receiveStock(other.id, balls.id, { quantity: 5 }, 'x', true)).ok && !(await setCost(other.id, balls.id, 1)).ok);
  const receipts = await recentReceipts(c.id, { cost: false });
  ok('deliveries are logged, without cost for staff', receipts.length === 2 && receipts.every(x => !('unitCostCents' in x)));

  await setReorder(c.id, balls.id, 15);
  const rows = await stockRows(c.id, { cost: false });
  ok('at its reorder point an item is low, and low comes first', rows[0].id === balls.id && rows[0].low, rows.map(r => [r.name, r.low]));
  ok('…the parent of options isn\'t a stock row, its options are', !rows.some(r => r.id === shirt.id) && rows.some(r => r.name === 'Polo — M'));
  ok('…and staff never see cost', rows.every(r => !('costCents' in r)));
  ok('a reorder point is a whole number or blank', !(await setReorder(c.id, balls.id, -1)).ok && (await setReorder(c.id, tee.id, '')).ok);

  // The report from real sales: 2 balls sold, 1 returned.
  const sale = await createSale({ courseId: c.id, lines: [{ shopItemId: balls.id, quantity: 2 }], pay: 'cash', soldBy: 'desk' });
  if (sale.ok) await prisma.shopSaleLine.updateMany({ where: { saleId: sale.value.id }, data: { returnedQty: 1 } });
  const today = todayIn('America/New_York');
  const rep = await shopReport(c.id, { from: today, to: today }, { cost: true });
  const line = rep?.items.find(i => i.name === 'Pro V1');
  ok('the report counts what was sold less returns, with the margin at today\'s cost', sale.ok && line?.qty === 1 && line.salesCents === 5000 && line.marginCents === 1900, { sale, line });
  ok('…another course sees none of it', (await shopReport(other.id, { from: today, to: today }, { cost: true }))?.items.length === 0);

  // Wiring.
  const route = readFileSync('src/app/api/operator/shop-stock/route.ts', 'utf8');
  ok('cost is the owner\'s alone; receiving and reorder points need the catalog permission', route.includes("if (session.isStaff) return NextResponse.json({ error: 'Only the course owner can see or set costs.' }") && route.includes("requirePermission(session, 'shop.catalog')") && route.includes('const cost = !session.isStaff'));
  ok('the catalog the register loads never carries cost', !readFileSync('src/lib/shop-catalog.ts', 'utf8').match(/ITEM_SELECT = \{[^}]*costCents/));
  ok('the report is gated like Analytics, cost for the owner only', readFileSync('src/app/api/operator/analytics/shop/route.ts', 'utf8').includes("requirePermission(session, 'analytics.view')") && readFileSync('src/app/api/operator/analytics/shop/route.ts', 'utf8').includes('cost: !session.isStaff'));
  ok('a scanner works anywhere on the register, never while typing in a field', /window\.addEventListener\('keydown', onKey\)/.test(readFileSync('src/app/dashboard/shop/page.tsx', 'utf8')) && readFileSync('src/app/dashboard/shop/page.tsx', 'utf8').includes("t.tagName === 'INPUT'"));
  ok('deliveries are cleared by the launch wipe', WIPED_TABLES.includes('ShopStockReceipt'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('shop-stock-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

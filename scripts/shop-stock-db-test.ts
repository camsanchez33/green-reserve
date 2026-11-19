// SHOP-4 (Cam 2026-10-30: "Low stock + receiving", "Shop sales report", cost "only the
// owner sees", "scan to add"): deliveries, reorder points, cost and the sales report.
// Needs a database. Run: npx tsx scripts/shop-stock-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { receiveStock, setReorder, setCost, stockRows, isLow, recentReceipts } from '../src/lib/shop-stock';
import { shopReport, summarize } from '../src/lib/shop-report';
import { createSale, settleOpenSale, markCardPaid } from '../src/lib/shop-sales';
import { WIPED_TABLES } from '../src/lib/data-reset';
import { todayIn } from '../src/lib/course-time';
import { notifyLowStock } from '../src/lib/low-stock';
import { addItemToBooking } from '../src/lib/shop';

// The owner's address has no inbox (lib/email PLACEHOLDER_EMAIL_DOMAIN), so a real low-stock email is skipped and
// logged, never sent; the key only lets the sender start.
process.env.RESEND_API_KEY ||= 're_test_not_a_real_key';

const TAG = 'shopstockdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.sentMessage.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
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

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@noemail.greenreserve.app`, password: 'x' } });
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

  // Low-stock email (Cam 2026-11-15): once per drop to the reorder point, again only after it went back above.
  type Sent = { ownerEmail: string; items: { name: string; stockCount: number; reorderAt: number }[] };
  const sent: Sent[] = [];
  const fake = async (d: Sent) => { sent.push(d); };
  const boom = async () => { throw new Error('send failed'); };
  const grips = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Grips', category: 'Accessories', priceCents: 900, stockCount: 5, reorderAt: 3 } });
  await prisma.shopItem.updateMany({ where: { courseId: c.id, id: { not: grips.id } }, data: { reorderAt: null } }); // only Grips can be low here
  await prisma.shopItem.create({ data: { courseId: other.id, name: 'Other low', priceCents: 100, stockCount: 0, reorderAt: 5 } });
  const flag = async () => (await prisma.shopItem.findUniqueOrThrow({ where: { id: grips.id } })).lowNoticeAt;
  ok('above the reminder number: no email', (await notifyLowStock(c.id, fake)) === 0 && sent.length === 0);
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 3 } });
  ok('at the reminder number: one email to the owner, naming the item and the count', (await notifyLowStock(c.id, fake)) === 1 && sent.length === 1 && sent[0].ownerEmail === op.email && sent[0].items.length === 1 && sent[0].items[0].name === 'Grips' && sent[0].items[0].stockCount === 3 && (await flag()) !== null, sent);
  ok('…another course\'s low item is not in it', !sent[0].items.some(i => i.name === 'Other low'));
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 2 } });
  ok('still low after another sale: no second email', (await notifyLowStock(c.id, fake)) === 0 && sent.length === 1);
  await receiveStock(c.id, grips.id, { quantity: 10 }, 'desk@x', false);
  ok('restocked above it: re-armed (the trigger clears the flag)', (await flag()) === null);
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 1 } });
  ok('dropped again: emails again', (await notifyLowStock(c.id, fake)) === 1 && sent.length === 2);
  await prisma.shopItem.update({ where: { id: grips.id }, data: { reorderAt: null } });
  ok('reminder turned off: re-armed', (await flag()) === null);
  await prisma.shopItem.update({ where: { id: grips.id }, data: { reorderAt: 3 } });
  ok('a failed send never throws and gives the claim back', (await notifyLowStock(c.id, boom)) === 0 && (await flag()) === null);
  ok('…so the next sale tries again', (await notifyLowStock(c.id, fake)) === 1 && sent.length === 3);
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 20 } });
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 0 } });
  const both = await Promise.all([notifyLowStock(c.id, fake), notifyLowStock(c.id, fake)]);
  ok('two sales at once send one email', both[0] + both[1] === 1 && sent.length === 4, both);

  // An option of a hidden (or deleted) item is not on the Low on Stock list, so it is never emailed.
  const cap = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Cap', priceCents: 2000, active: false } });
  const capM = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Cap — M', priceCents: 2000, parentId: cap.id, optionLabel: 'M', stockCount: 1, reorderAt: 3 } });
  ok('a low size of a hidden item: no email', (await notifyLowStock(c.id, fake)) === 0 && sent.length === 4 && (await prisma.shopItem.findUniqueOrThrow({ where: { id: capM.id } })).lowNoticeAt === null);
  await prisma.shopItem.update({ where: { id: cap.id }, data: { active: true } });
  ok('…shown again, its low size is emailed', (await notifyLowStock(c.id, fake)) === 1 && sent[4]?.items[0].name === 'Cap — M');
  await prisma.shopItem.update({ where: { id: capM.id }, data: { reorderAt: null } });

  // A failed send gives back only its own claim, never one a later sale made.
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 20 } });
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 0 } });
  let release!: () => void;
  const slowFail = (_d: Sent) => new Promise<void>((_, rej) => { release = () => rej(new Error('late failure')); });
  const pendingA = notifyLowStock(c.id, slowFail);
  while (!release) await new Promise(r => setTimeout(r, 10));
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 20 } });
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 0 } });
  await new Promise(r => setTimeout(r, 5)); // a new millisecond for B's claim
  const b = await notifyLowStock(c.id, fake);
  release(); await pendingA;
  ok('a slow failed send does not undo a later sale\'s claim', b === 1 && (await flag()) !== null);

  // The real paths: a paid walk-up sale and an item added to a round each send it (to an address with no inbox here,
  // so the send is skipped and logged), after the sale has committed.
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 5 } });
  const lowLog = () => prisma.sentMessage.findMany({ where: { courseId: c.id, kind: 'shop_low_stock' }, orderBy: { createdAt: 'asc' } });
  const before = (await lowLog()).length;
  const walkUp = await createSale({ courseId: c.id, lines: [{ shopItemId: grips.id, quantity: 2 }], pay: 'cash', soldBy: 'desk' });
  const logged = await lowLog();
  ok('a cash walk-up sale that takes it to the number emails the owner', walkUp.ok && (await flag()) !== null && logged.length === before + 1 && logged[logged.length - 1].to === op.email.toLowerCase(), logged);
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 4 } });
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: '2030-06-01', time: '08:00', holes: 18, playersBooked: 1, greenFeeCents: 5000, cartFeeCents: 0 } });
  const bk = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'G', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const added = await addItemToBooking(c.id, bk.id, grips.id, 1, 'desk');
  ok('an item added to a round that takes it to the number emails the owner', added.ok && (await lowLog()).length === before + 2, added);
  // A pay link taken in cash at the counter.
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 5 } });
  const link = await createSale({ courseId: c.id, lines: [{ shopItemId: grips.id, quantity: 2 }], pay: 'link', soldBy: 'desk' });
  ok('an open pay link takes no stock and sends nothing', link.ok && (await prisma.shopItem.findUniqueOrThrow({ where: { id: grips.id } })).stockCount === 5 && (await lowLog()).length === before + 2);
  const settled = link.ok ? await settleOpenSale(c.id, link.value.id, 'paid_cash') : null;
  ok('a pay link taken in cash that takes it to the number emails the owner', !!settled?.ok && (await lowLog()).length === before + 3, settled);
  // A card payment (link or reader): markCardPaid, after its stock leaves.
  await prisma.shopItem.update({ where: { id: grips.id }, data: { stockCount: 5 } });
  const card = await createSale({ courseId: c.id, lines: [{ shopItemId: grips.id, quantity: 2 }], pay: 'link', soldBy: 'desk' });
  const stamp = new Date();
  if (card.ok) await prisma.shopSale.update({ where: { id: card.value.id }, data: { status: 'paying', chargeStartedAt: stamp } });
  if (card.ok) await markCardPaid(card.value.id, stamp, `pi_${TAG}`);
  ok('a sale paid by card that takes it to the number emails the owner', card.ok && (await prisma.shopItem.findUniqueOrThrow({ where: { id: grips.id } })).stockCount === 3 && (await lowLog()).length === before + 4);

  // Wiring.
  ok('the stock box says the reminder is by email', readFileSync('src/components/dashboard/shop/StockBox.tsx', 'utf8').includes('Reminder by email') && !readFileSync('src/components/dashboard/shop/StockBox.tsx', 'utf8').includes('Shows as Low on Stock'));
  // Emails redo (Cam 2026-11-19): a routine staff notice — from noreply@, pointing to Course support.
  ok('the email goes through getResend from noreply@', /export async function sendLowStockEmail[\s\S]*?getResend\(\)\.emails\.send\(\{ meta: \{ kind: 'shop_low_stock'[^}]*\}, from: FROM_NOREPLY/.test(readFileSync('src/lib/email.ts', 'utf8')));
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

// W2-7 part B2: sales tax on pro-shop items added to a ROUND, against a real
// database with Stripe's tax calls stubbed. Run:
//   npx tsx scripts/round-shop-tax-db-test.ts   (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { addItemToBooking, removeLineFromBooking, roundChargeCents } from '../src/lib/shop';
import { ensureShopTax, recordRoundShopTax, recordPendingRoundShopTax } from '../src/lib/round-shop-tax';
const TAG = 'w27b2';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };

// Stripe Tax stubs: 6.625% on everything but clothing; records what was asked.
type Line = { amount: number; quantity: number; reference: string; tax_code: string };
const recorded: { calc: string; ref: string; account: string }[] = [];
let createCalls = 0, failCreate = false;
const tax = stripe.tax as unknown as Record<string, Record<string, unknown>>;
tax.calculations.create = async (p: { line_items: Line[] }) => {
  createCalls++;
  if (failCreate) throw new Error('stripe down');
  const t = p.line_items.reduce((s, l) => s + (l.tax_code === 'txcd_30011000' ? 0 : Math.round(l.amount * 0.06625)), 0);
  return { id: `taxcalc_b2_${createCalls}`, tax_amount_exclusive: t, expires_at: Math.floor(Date.now() / 1000) + 90 * 86400 };
};
tax.transactions.createFromCalculation = async (p: { calculation: string; reference: string }, o: { stripeAccount: string }) => {
  recorded.push({ calc: p.calculation, ref: p.reference, account: o.stripeAccount });
  return { id: `tax_b2_${recorded.length}` };
};

async function cleanup() {
  const cs = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map(c => c.id);
  await prisma.bookingShopItem.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids }, parentId: { not: null } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Taxed', slug: `${TAG}-a`, operatorId: op.id, address: '1 Main', city: 'Paramus', state: 'NJ', zipCode: '07652', holes: 18, par: 72, timezone: 'UTC', stripeAccountId: 'acct_b2', stripeAccountActive: true, shopTaxOn: true } });
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: '2030-06-01', time: '08:00', holes: 18, playersBooked: 2, greenFeeCents: 5000, cartFeeCents: 0 } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Ann', golferEmail: `${TAG}@g.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const balls = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Pro V1', priceCents: 5400, taxCategory: 'general' } });
  const polo = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Polo', priceCents: 4500, taxCategory: 'clothing' } });

  ok('no items, no tax, no Stripe call', (await ensureShopTax(b.id)).ok && createCalls === 0);
  const add1 = await addItemToBooking(c.id, b.id, balls.id, 1, 'staff');
  ok('an item is added', add1.ok);
  const line = await prisma.bookingShopItem.findFirst({ where: { bookingId: b.id } });
  ok('the line keeps its item’s tax category', line?.taxCategory === 'general');
  const t1 = await ensureShopTax(b.id);
  ok('tax is quoted on the items: 6.625% of $54.00 = $3.58', t1.ok && t1.shopTaxCents === 358, JSON.stringify(t1));
  let row = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  ok('the round charge includes it', roundChargeCents(row) === 10300 + 5400 + 358, String(roundChargeCents(row)));
  const calls = createCalls;
  await ensureShopTax(b.id);
  ok('unchanged items: no second quote', createCalls === calls);

  await addItemToBooking(c.id, b.id, polo.id, 2, 'staff');
  const t2 = await ensureShopTax(b.id);
  ok('a clothing item (untaxed here) re-quotes and the tax follows the lines', t2.ok && t2.shopTaxCents === 358 && createCalls === calls + 1, JSON.stringify(t2));

  // Stripe down: the item still saves, the tax is reported unavailable, the stale figure isn't used as current.
  failCreate = true;
  const l2 = await prisma.bookingShopItem.findFirstOrThrow({ where: { bookingId: b.id, shopItemId: polo.id } });
  await removeLineFromBooking(c.id, b.id, l2.id);
  await addItemToBooking(c.id, b.id, balls.id, 1, 'staff');
  const t3 = await ensureShopTax(b.id);
  ok('Stripe down: ensureShopTax fails (the charge path must stop)', !t3.ok);
  failCreate = false;
  const t4 = await ensureShopTax(b.id);
  ok('…and recovers on the next try: two Pro V1 lines = $7.16', t4.ok && t4.shopTaxCents === 716, JSON.stringify(t4));

  // Course turns tax off: the tax comes off.
  await prisma.course.update({ where: { id: c.id }, data: { shopTaxOn: false } });
  const t5 = await ensureShopTax(b.id);
  row = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  ok('tax turned off: the round carries none', t5.ok && t5.shopTaxCents === 0 && row.shopTaxCalculationId === '');
  await prisma.course.update({ where: { id: c.id }, data: { shopTaxOn: true } });
  await ensureShopTax(b.id);

  // A charge has started: the tax is frozen.
  await prisma.booking.update({ where: { id: b.id }, data: { shopLockedAt: new Date() } });
  const before = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  await prisma.shopItem.update({ where: { id: balls.id }, data: { taxCategory: 'clothing' } });
  await prisma.bookingShopItem.updateMany({ where: { bookingId: b.id }, data: { quantity: 3 } }); // a change that would re-quote if not frozen
  const n = createCalls;
  const t6 = await ensureShopTax(b.id);
  ok('once a charge starts, the tax never changes', t6.ok && t6.shopTaxCents === before.shopTaxCents && createCalls === n);
  await prisma.bookingShopItem.updateMany({ where: { bookingId: b.id }, data: { quantity: 1 } });

  // Review BLOCK: a shop write between the quote and the charge lock. The charge
  // freezes the items first and quotes under its OWN lock, so tax = the items charged.
  const b3 = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Cy', golferEmail: `${TAG}3@g.local`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  await prisma.shopItem.update({ where: { id: balls.id }, data: { taxCategory: 'general' } });
  await addItemToBooking(c.id, b3.id, balls.id, 1, 'staff');
  await ensureShopTax(b3.id);                                   // the panel's quote: $3.58
  const l3 = await prisma.bookingShopItem.findFirstOrThrow({ where: { bookingId: b3.id } });
  await removeLineFromBooking(c.id, b3.id, l3.id);              // staff take it off just before check-in
  const stamp = new Date();
  await prisma.booking.update({ where: { id: b3.id }, data: { shopLockedAt: stamp } });   // the charge freezes the items…
  const atCharge = await ensureShopTax(b3.id, { ownLock: stamp });                         // …then quotes under its own lock
  const r3 = await prisma.booking.findUniqueOrThrow({ where: { id: b3.id } });
  ok('the charge never carries tax on an item that was taken off', atCharge.ok && atCharge.shopTaxCents === 0 && r3.shopTotalCents === 0 && roundChargeCents(r3) === 5150, JSON.stringify({ atCharge, shop: r3.shopTotalCents, tax: r3.shopTaxCents }));
  ok('another charge’s lock still freezes the tax', (await ensureShopTax(b3.id, { ownLock: new Date(stamp.getTime() + 1) })).ok && (await prisma.booking.findUniqueOrThrow({ where: { id: b3.id } })).shopTaxCents === 0);
  const blocked = await addItemToBooking(c.id, b3.id, balls.id, 1, 'staff');
  ok('no item can be added once the charge has started', !blocked.ok);

  // A counter payment on a quote made for different lines is never recorded.
  const b4 = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Di', golferEmail: `${TAG}4@g.local`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  await addItemToBooking(c.id, b4.id, balls.id, 1, 'staff');
  await ensureShopTax(b4.id);
  await addItemToBooking(c.id, b4.id, balls.id, 1, 'staff');   // changed, and Stripe was down so no new quote
  await prisma.booking.update({ where: { id: b4.id }, data: { status: 'completed', paidOffline: true, paymentStatus: 'paid_offline', paidAt: new Date() } });
  const before4 = recorded.length;
  await recordRoundShopTax(b4.id);
  ok('a quote for different lines is not recorded', recorded.length === before4 && (await prisma.booking.findUniqueOrThrow({ where: { id: b4.id } })).shopTaxTransactionId === '');

  await recordRoundShopTax(b.id);
  ok('not recorded before it is paid', recorded.length === 0);
  await prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: 'paid', roundPaymentIntentId: 'pi_x', paidAt: new Date() } });
  await recordRoundShopTax(b.id);
  row = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  ok('paid: recorded on the course’s account, referenced by the booking', recorded.length === 1 && recorded[0].ref === `round-shop-${b.id}` && recorded[0].account === 'acct_b2' && row.shopTaxTransactionId === 'tax_b2_1', JSON.stringify(recorded));
  await recordRoundShopTax(b.id);
  ok('recording twice does nothing', recorded.length === 1);

  // Paid at the counter, missed: the hourly sweep records it.
  const b2 = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Bo', golferEmail: `${TAG}2@g.local`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  await addItemToBooking(c.id, b2.id, polo.id, 1, 'staff');
  await prisma.shopItem.update({ where: { id: polo.id }, data: { taxCategory: 'general' } });
  await addItemToBooking(c.id, b2.id, polo.id, 1, 'staff');
  await ensureShopTax(b2.id);
  await prisma.booking.update({ where: { id: b2.id }, data: { status: 'completed', paidOffline: true, paymentStatus: 'paid_offline', paidAt: new Date() } });
  const swept = await recordPendingRoundShopTax();
  ok('the hourly sweep records a counter-paid round', swept >= 1 && recorded.some(r => r.ref === `round-shop-${b2.id}`));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('round-shop-tax-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

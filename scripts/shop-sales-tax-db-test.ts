// W2-7 part B: pro-shop sales tax (Stripe Tax) on walk-up sales, against a
// real database with Stripe's tax calls stubbed. Run:
//   npx tsx scripts/shop-sales-tax-db-test.ts   (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { createSale, quoteSale, settleOpenSale } from '../src/lib/shop-sales';
import { recordPendingShopTax, isTaxCategory } from '../src/lib/sales-tax';
import { ringUpCash } from '../src/lib/register';
const TAG = 'w27tax';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };

// Stripe Tax stubs: 6.625% on everything but clothing; records what was asked.
type Line = { amount: number; quantity: number; reference: string; tax_code: string };
const calcs = new Map<string, { lines: Line[]; tax: number; account: string; expires: number }>();
const recorded: { calc: string; ref: string; account: string }[] = [];
let createCalls = 0, failCreate = false, failRecord = false;
const tax = stripe.tax as unknown as Record<string, Record<string, unknown>>;
tax.calculations.create = async (p: { line_items: Line[]; customer_details: { address: { state: string } } }, o: { stripeAccount: string }) => {
  createCalls++;
  if (failCreate) throw new Error('stripe down');
  const t = p.line_items.reduce((s, l) => s + (l.tax_code === 'txcd_30011000' ? 0 : Math.round(l.amount * 0.06625)), 0);
  const id = `taxcalc_${createCalls}`;
  calcs.set(id, { lines: p.line_items, tax: t, account: o.stripeAccount, expires: Math.floor(Date.now() / 1000) + 90 * 86400 });
  return { id, tax_amount_exclusive: t, customer_details: p.customer_details };
};
tax.calculations.retrieve = async (id: string, _p: unknown, o: { stripeAccount: string }) => {
  const c = calcs.get(id); if (!c || c.account !== o.stripeAccount) throw new Error('No such calculation');
  return { id, tax_amount_exclusive: c.tax, expires_at: c.expires };
};
tax.calculations.listLineItems = async (id: string) => ({ data: calcs.get(id)!.lines });
tax.transactions.createFromCalculation = async (p: { calculation: string; reference: string }, o: { stripeAccount: string }) => {
  if (failRecord) throw new Error('stripe down');
  recorded.push({ calc: p.calculation, ref: p.reference, account: o.stripeAccount });
  return { id: `tax_${recorded.length}` };
};

async function cleanup() {
  const cs = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Tax GC', slug: `${TAG}-a`, operatorId: op.id, address: '1 Fairway Rd', city: 'Paramus', state: 'NJ', zipCode: '07652', holes: 18, stripeAccountId: 'acct_tax', stripeAccountActive: true, shopTaxOn: true } });
  const off = await prisma.course.create({ data: { name: 'No Tax GC', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '1', holes: 18, stripeAccountId: 'acct_off', shopTaxOn: false } });
  const glove = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Glove', priceCents: 2000, taxCategory: 'general' } });
  const polo = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Polo', priceCents: 4500, taxCategory: 'clothing' } });
  const offItem = await prisma.shopItem.create({ data: { courseId: off.id, name: 'Glove', priceCents: 2000 } });
  const lines = [{ shopItemId: glove.id, quantity: 2 }, { shopItemId: polo.id, quantity: 1 }];

  const q = await quoteSale(c.id, lines);
  ok('the quote adds tax per item type (clothing at 0 here)', q.ok && q.value.subtotalCents === 8500 && q.value.taxCents === Math.round(4000 * 0.06625) && q.value.totalCents === 8500 + 265, JSON.stringify(q));
  const sent = calcs.get(q.ok ? q.value.taxCalculationId : '')!;
  ok('…on the course’s own Stripe account, line totals and Stripe tax codes', sent.account === 'acct_tax' && sent.lines.some(l => l.reference === glove.id && l.amount === 4000 && l.quantity === 2 && l.tax_code === 'txcd_99999999') && sent.lines.some(l => l.tax_code === 'txcd_30011000'));

  const before = createCalls;
  const sale = await createSale({ courseId: c.id, lines, pay: 'cash', soldBy: 't', taxCalculationId: q.ok ? q.value.taxCalculationId : '' });
  ok('a cash sale reuses the matching quote (no second calculation)', sale.ok && createCalls === before, String(createCalls - before));
  ok('…its total is the lines plus tax, and the tax is stored', sale.ok && sale.value.totalCents === 8765 && sale.value.taxCents === 265);
  const row = sale.ok ? await prisma.shopSale.findUnique({ where: { id: sale.value.id } }) : null;
  ok('…and its tax is recorded once, against the sale', !!row?.taxTransactionId && recorded.filter(r => r.ref === `shop-sale-${row.id}`).length === 1 && recorded[0].account === 'acct_tax');

  const stale = await createSale({ courseId: c.id, lines: [{ shopItemId: glove.id, quantity: 1 }], pay: 'cash', soldBy: 't', taxCalculationId: q.ok ? q.value.taxCalculationId : '' });
  ok('a quote for different lines is not reused — tax is worked out again', stale.ok && stale.value.taxCents === Math.round(2000 * 0.06625) && createCalls === before + 1);
  const forged = await createSale({ courseId: c.id, lines, pay: 'cash', soldBy: 't', taxCalculationId: 'taxcalc_doesnotexist' });
  ok('an unknown quote id is ignored, not trusted', forged.ok && forged.value.taxCents === 265);

  // A link sale: tax on the total; recorded only when paid.
  const link = await createSale({ courseId: c.id, lines, pay: 'link', soldBy: 't' });
  const n = recorded.length;
  ok('an open link sale is not recorded yet', link.ok && recorded.length === n);
  failRecord = true;
  const paid = link.ok ? await settleOpenSale(c.id, link.value.id, 'paid_cash') : null;
  ok('taking cash for it still succeeds when Stripe is down', !!paid?.ok);
  ok('…and leaves the tax unrecorded', link.ok && (await prisma.shopSale.findUnique({ where: { id: link.value.id } }))?.taxTransactionId === '');
  failRecord = false;
  const swept = await recordPendingShopTax();
  ok('the hourly sweep records it later', swept >= 1 && link.ok && !!(await prisma.shopSale.findUnique({ where: { id: link.value.id } }))?.taxTransactionId);
  ok('…and a second sweep records nothing twice', (await recordPendingShopTax()) === 0);

  const v = link.ok ? await createSale({ courseId: c.id, lines, pay: 'link', soldBy: 't' }) : null;
  if (v?.ok) await settleOpenSale(c.id, v.value.id, 'void');
  await recordPendingShopTax();
  ok('a voided sale is never recorded', !!v?.ok && !recorded.some(r => r.ref === `shop-sale-${v.value.id}`));

  failCreate = true;
  // Cam 2026-10-29 ("no tax on cash"): cash is never blocked — taken without tax, marked on the sale.
  const down = await createSale({ courseId: c.id, lines, pay: 'cash', soldBy: 't' });
  const downRow = down.ok ? await prisma.shopSale.findUnique({ where: { id: down.value.id }, select: { taxCents: true, taxUnavailable: true, status: true } }) : null;
  ok('Stripe Tax down: cash still goes through, no tax, marked', down.ok && downRow?.status === 'paid_cash' && downRow.taxCents === 0 && downRow.taxUnavailable === true, JSON.stringify(down));
  const downLink = await createSale({ courseId: c.id, lines, pay: 'link', soldBy: 't', customerPhone: '+12125550123' });
  ok('…a pay link still waits for the tax', !downLink.ok && downLink.status === 502);
  const downQuote = await quoteSale(c.id, lines);
  ok('…and the quote says tax is unavailable instead of failing', downQuote.ok && downQuote.value.taxUnavailable && downQuote.value.taxCents === 0);
  // Reviewer 2026-10-29: the tax changes state between the total shown and the ring-up — never record other than the cash taken.
  const shownDown = downQuote.ok ? downQuote.value.totalCents : -1;
  failCreate = false;
  const upQuote = await quoteSale(c.id, lines);
  const shownUp = upQuote.ok ? upQuote.value.totalCents : -1;
  const backUp = await createSale({ courseId: c.id, lines, pay: 'cash', soldBy: 't', expectedItemsCents: shownDown });
  ok('shown without tax, Stripe back at ring-up: refused, nothing recorded', !backUp.ok && backUp.status === 409 && shownUp > shownDown, JSON.stringify(backUp));
  failCreate = true;
  const wentDown = await createSale({ courseId: c.id, lines, pay: 'cash', soldBy: 't', expectedItemsCents: shownUp, taxCalculationId: upQuote.ok ? upQuote.value.taxCalculationId : undefined });
  // The quote it showed is reused (no Stripe call needed), so the tax taken is on the sale.
  ok('shown with tax, Stripe down at ring-up: the shown quote is used, tax on the sale', wentDown.ok && wentDown.value.totalCents === shownUp && wentDown.value.taxCents > 0, JSON.stringify(wentDown));
  const wentDownNoQuote = await createSale({ courseId: c.id, lines, pay: 'cash', soldBy: 't', expectedItemsCents: shownUp });
  ok('…with no quote to reuse: refused, never recorded without the tax taken', !wentDownNoQuote.ok && wentDownNoQuote.status === 409, JSON.stringify(wentDownNoQuote));
  const regDown = await ringUpCash(c.id, { lines, bookingIds: [], walkIns: [], soldBy: 't', actor: { type: 'staff', id: null }, expectedItemsCents: shownUp });
  ok('…the register refuses the same way, before any round is settled', !regDown.ok && regDown.status === 409, JSON.stringify(regDown));
  const regOk = await ringUpCash(c.id, { lines, bookingIds: [], walkIns: [], soldBy: 't', actor: { type: 'staff', id: null }, expectedItemsCents: shownDown });
  const regRow = regOk.ok ? await prisma.shopSale.findUnique({ where: { id: regOk.value.sale.id }, select: { taxUnavailable: true, totalCents: true } }) : null;
  ok('…and takes the cash at the total it showed', regOk.ok && regRow?.taxUnavailable === true && regRow.totalCents === shownDown, JSON.stringify(regOk));
  failCreate = false;

  const noTax = await createSale({ courseId: off.id, lines: [{ shopItemId: offItem.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  ok('a course with tax off sells at the price, no Stripe call', noTax.ok && noTax.value.taxCents === 0 && noTax.value.totalCents === 2000);
  ok('tax categories accept only their own keys', isTaxCategory('clothing') && !isTaxCategory('toString') && !isTaxCategory('constructor'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('shop-sales-tax-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

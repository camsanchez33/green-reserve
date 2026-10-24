// POS-3 (Cam 2026-10-24, "like Square"): the register — custom amounts, a
// discount spread over the lines for sales tax, cash handed over, refunds
// (cash recorded, card through Stripe, tax reversed) — against a real
// database with Stripe's calls stubbed. Run: npx tsx scripts/pos-register-db-test.ts
import Stripe from 'stripe';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { createSale, quoteSale, refundSale, sendShopRefund, discountFor, spreadDiscount, reversePendingShopRefundTax } from '../src/lib/shop-sales';
import { bySku } from '../src/lib/shop-tree';
import { ALL_KEYS, PRESETS } from '../src/lib/staff-permissions';
const TAG = 'pos3reg';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };

// ── Stripe stubs ─────────────────────────────────────────────────────────────
type Line = { amount: number; quantity: number; reference: string; tax_code: string };
const calcs = new Map<string, { lines: Line[]; tax: number; account: string }>();
let calcN = 0;
const tax = stripe.tax as unknown as Record<string, Record<string, unknown>>;
tax.calculations.create = async (p: { line_items: Line[]; customer_details: unknown }, o: { stripeAccount: string }) => {
  const t = p.line_items.reduce((s, l) => s + Math.round(l.amount * 0.1), 0); // 10% on everything
  const id = `taxcalc_${++calcN}`;
  calcs.set(id, { lines: p.line_items, tax: t, account: o.stripeAccount });
  return { id, tax_amount_exclusive: t, customer_details: p.customer_details };
};
tax.calculations.retrieve = async (id: string) => ({ id, tax_amount_exclusive: calcs.get(id)!.tax, expires_at: Math.floor(Date.now() / 1000) + 86400 });
tax.calculations.listLineItems = async (id: string) => ({ data: calcs.get(id)!.lines });
const taxTx: string[] = [];
tax.transactions.createFromCalculation = async (p: { reference: string }) => { taxTx.push(p.reference); return { id: `tax_${taxTx.length}` }; };
const reversals: { mode: string; flat?: number; ref: string; orig: string }[] = [];
let failReversal = false;
tax.transactions.createReversal = async (p: { mode: string; flat_amount?: number; reference: string; original_transaction: string }) => {
  if (failReversal) throw new Error('stripe down');
  reversals.push({ mode: p.mode, flat: p.flat_amount, ref: p.reference, orig: p.original_transaction });
  return { id: `taxrev_${reversals.length}` };
};
const s = stripe as unknown as Record<string, Record<string, unknown>>;
const refundsMade: { pi: string; amount: number; account: string; meta: Record<string, string> }[] = [];
let refundNext: 'ok' | 'refuse' | 'timeout' = 'ok';
s.refunds.list = async (p: { payment_intent: string }) => ({ data: refundsMade.filter(r => r.pi === p.payment_intent).map((r, i) => ({ id: `re_${i}`, status: 'succeeded', metadata: r.meta })) });
s.refunds.create = async (p: { payment_intent: string; amount: number; metadata: Record<string, string> }, o: { stripeAccount: string }) => {
  if (refundNext === 'refuse') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Charge has already been refunded.', type: 'invalid_request_error' } as never);
  if (refundNext === 'timeout') { refundsMade.push({ pi: p.payment_intent, amount: p.amount, account: o.stripeAccount, meta: p.metadata }); throw new Error('Request timed out'); }
  refundsMade.push({ pi: p.payment_intent, amount: p.amount, account: o.stripeAccount, meta: p.metadata });
  return { id: `re_${refundsMade.length}`, status: 'succeeded' };
};

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // ── Pure ──
  ok('10% off $85 is $8.50', discountFor(8500, { percent: 10 }).ok && (discountFor(8500, { percent: 10 }) as { value: { discountCents: number } }).value.discountCents === 850);
  ok('an amount off can’t be more than the sale', !discountFor(1000, { amountCents: 1001 }).ok);
  ok('percent and amount together are refused', !discountFor(1000, { percent: 5, amountCents: 100 }).ok);
  ok('no discount asked = none', discountFor(1000, null).ok && (discountFor(1000, null) as { value: { discountCents: number } }).value.discountCents === 0);
  const spread = spreadDiscount([4000, 4500, 1], 851);
  ok('a discount spreads over the lines and adds up exactly', spread.reduce((a, b) => a + b, 0) === 8501 - 851 && spread.every(x => x >= 0), spread);
  ok('a whole-sale discount leaves every line at nothing', spreadDiscount([300, 700], 1000).every(x => x === 0));
  const flat = [
    { id: 'a', name: 'Balls', category: '', priceCents: 1, active: true, stockCount: null, sku: '0123', parentId: null, optionLabel: '' },
    { id: 'p', name: 'Polo', category: '', priceCents: 1, active: true, stockCount: null, sku: 'POLO', parentId: null, optionLabel: '' },
    { id: 'pm', name: 'Polo — M', category: '', priceCents: 1, active: true, stockCount: null, sku: 'POLO-M', parentId: 'p', optionLabel: 'M' },
    { id: 'x', name: 'Old', category: '', priceCents: 1, active: false, stockCount: null, sku: 'OLD', parentId: null, optionLabel: '' },
  ];
  ok('a scanned code finds its item', bySku(flat, ' 0123 ')?.id === 'a' && bySku(flat, 'polo-m')?.id === 'pm');
  ok('…never the parent of options, a hidden item, or nothing', bySku(flat, 'POLO') === null && bySku(flat, 'OLD') === null && bySku(flat, 'nope') === null);
  ok('discounts are a permission Front desk doesn’t get', ALL_KEYS.includes('shop.discount') && !PRESETS.find(p => p.key === 'front_desk')!.keys.includes('shop.discount'));

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Register GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'Paramus', state: 'NJ', zipCode: '07652', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_reg', stripeAccountActive: true, shopTaxOn: true } });
  const other = await prisma.course.create({ data: { name: 'Other GC', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '1', holes: 18, stripeAccountId: 'acct_other', shopTaxOn: false } });
  const glove = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Glove', priceCents: 2000, stockCount: 10 } });
  const hat = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Hat', priceCents: 3000 } });
  const stock = async () => (await prisma.shopItem.findUniqueOrThrow({ where: { id: glove.id } })).stockCount;

  // ── Custom amounts and discounts ──
  const custom = await createSale({ courseId: c.id, lines: [{ name: 'Range token', priceCents: 500, quantity: 2 }, { shopItemId: glove.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  ok('a custom amount rings up beside a catalog item, taxed', custom.ok && custom.value.lines.some(l => l.name === 'Range token' && l.unitPriceCents === 500 && l.quantity === 2) && custom.value.totalCents === 3000 + 300, custom);
  ok('…and takes no stock (the glove does)', (await stock()) === 9 && custom.ok && (await prisma.shopSaleLine.count({ where: { saleId: custom.value.id, shopItemId: null } })) === 1);
  ok('a custom amount with no name or price is refused', !(await createSale({ courseId: c.id, lines: [{ name: '', priceCents: 500, quantity: 1 }], pay: 'cash', soldBy: 't' })).ok && !(await createSale({ courseId: c.id, lines: [{ name: 'x', priceCents: 0, quantity: 1 }], pay: 'cash', soldBy: 't' })).ok);

  const q = await quoteSale(c.id, [{ shopItemId: glove.id, quantity: 1 }, { shopItemId: hat.id, quantity: 1 }], { percent: 10, note: 'Member day' });
  ok('a 10% discount comes off before tax: $50 → $45 + $4.50 tax', q.ok && q.value.subtotalCents === 5000 && q.value.discountCents === 500 && q.value.taxCents === 450 && q.value.totalCents === 4950, q);
  const sentLines = calcs.get(q.ok ? q.value.taxCalculationId : '')!.lines;
  ok('…Stripe Tax is asked about the discounted line amounts', sentLines.reduce((t, l) => t + l.amount, 0) === 4500, sentLines);
  const disc = await createSale({ courseId: c.id, lines: [{ shopItemId: glove.id, quantity: 1 }, { shopItemId: hat.id, quantity: 1 }], pay: 'cash', soldBy: 't', discount: { percent: 10, note: 'Member day' }, taxCalculationId: q.ok ? q.value.taxCalculationId : '', cashTenderedCents: 5000 });
  ok('the sale keeps the discount, its note, and the cash handed over', disc.ok && disc.value.discountCents === 500 && disc.value.discountNote === 'Member day' && disc.value.totalCents === 4950 && disc.value.cashTenderedCents === 5000, disc);
  ok('cash that doesn’t cover the total is refused', !(await createSale({ courseId: c.id, lines: [{ shopItemId: hat.id, quantity: 1 }], pay: 'cash', soldBy: 't', cashTenderedCents: 1000 })).ok);
  const free = await createSale({ courseId: c.id, lines: [{ shopItemId: hat.id, quantity: 1 }], pay: 'link', soldBy: 't', discount: { percent: 100 } });
  ok('a pay link for a sale discounted to nothing is refused', !free.ok);
  const freeCash = await createSale({ courseId: c.id, lines: [{ shopItemId: hat.id, quantity: 1 }], pay: 'cash', soldBy: 't', discount: { percent: 100, note: 'Prize' } });
  ok('…but a 100% off sale can be recorded (no tax asked)', freeCash.ok && freeCash.value.totalCents === 0 && freeCash.value.taxCents === 0, freeCash);

  // ── Cash refunds ──
  const cashSale = disc.ok ? disc.value : null!;
  const tooMuch = await refundSale(c.id, cashSale.id, { amountCents: 4951 }, 'mgr');
  ok('more than the sale can’t be refunded', !tooMuch.ok);
  ok('another course can’t refund it', !(await refundSale(other.id, cashSale.id, { amountCents: 100 }, 'x')).ok);
  const part = await refundSale(c.id, cashSale.id, { amountCents: 1000, reason: 'Wrong size' }, 'mgr');
  ok('a part cash refund is recorded and done', part.ok && part.value.status === 'done' && part.value.sale.refundedCents === 1000 && part.value.sale.refunds[0].method === 'cash', part);
  ok('…and its tax is reversed for that amount', reversals.some(r => r.mode === 'partial' && r.flat === -1000 && r.ref.startsWith('shop-refund-')), reversals);
  const rest = await refundSale(c.id, cashSale.id, { restock: true }, 'mgr');
  ok('the rest refunds with no amount given; a part-refunded sale doesn’t restock', rest.ok && rest.value.sale.refundedCents === 4950 && !rest.value.sale.refunds[1].restocked);
  ok('a fully refunded sale can’t be refunded again', !(await refundSale(c.id, cashSale.id, {}, 'mgr')).ok);

  const whole = await createSale({ courseId: c.id, lines: [{ shopItemId: glove.id, quantity: 3 }], pay: 'cash', soldBy: 't' });
  const before = await stock();
  const wholeR = whole.ok ? await refundSale(c.id, whole.value.id, { restock: true }, 'mgr') : null;
  ok('a whole refund can put the items back on the shelf', !!wholeR?.ok && (await stock()) === (before ?? 0) + 3);
  ok('…and reverses all of its tax', reversals.some(r => r.mode === 'full'));

  // Two refunds at once for the last of a sale: only one gets it.
  const race = await createSale({ courseId: c.id, lines: [{ shopItemId: hat.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  const both = race.ok ? await Promise.all([refundSale(c.id, race.value.id, { amountCents: 3300 }, 'a'), refundSale(c.id, race.value.id, { amountCents: 3300 }, 'b')]) : [];
  ok('two refunds of the same last dollars: one goes through', both.filter(r => r.ok).length === 1 && (await prisma.shopSale.findUniqueOrThrow({ where: { id: race.ok ? race.value.id : '' } })).refundedCents === 3300);

  // ── Card refunds ──
  const card = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_card', totalCents: 3300, taxCents: 300, paymentIntentId: 'pi_card1', taxTransactionId: 'tax_card1', paidAt: new Date(), soldBy: 't', lines: { create: [{ shopItemId: hat.id, name: 'Hat', unitPriceCents: 3000, quantity: 1 }] } } });
  const cr = await refundSale(c.id, card.id, { amountCents: 1100 }, 'mgr');
  ok('a card refund goes to Stripe on the course’s account, keyed by the refund', cr.ok && cr.value.status === 'done' && refundsMade.some(r => r.pi === 'pi_card1' && r.amount === 1100 && r.account === 'acct_reg' && !!r.meta.shopRefundId), refundsMade);
  refundNext = 'refuse';
  const refused = await refundSale(c.id, card.id, { amountCents: 500 }, 'mgr');
  const afterRefuse = await prisma.shopSale.findUniqueOrThrow({ where: { id: card.id }, include: { refunds: true } });
  ok('a refund Stripe refuses gives the amount back and says so', !refused.ok && afterRefuse.refundedCents === 1100 && afterRefuse.refunds.some(r => r.status === 'failed'));
  refundNext = 'timeout';
  const unsure = await refundSale(c.id, card.id, { amountCents: 500 }, 'mgr');
  const pendingRow = await prisma.shopSaleRefund.findFirst({ where: { saleId: card.id, status: 'pending' } });
  ok('an unsure answer stays pending with the amount held', unsure.ok && unsure.value.status === 'pending' && !!pendingRow && (await prisma.shopSale.findUniqueOrThrow({ where: { id: card.id } })).refundedCents === 1600);
  refundNext = 'ok';
  const made = refundsMade.length;
  const retry = await sendShopRefund(c.id, pendingRow!.id);
  ok('Try again finds the refund Stripe already made — never a second one', retry.ok && retry.value.status === 'done' && refundsMade.length === made);
  ok('another course can’t retry it', !(await sendShopRefund(other.id, pendingRow!.id)).ok);

  // A reversal that failed is retried by the hourly job.
  failReversal = true;
  const later = await refundSale(c.id, card.id, { amountCents: 100 }, 'mgr');
  failReversal = false;
  const n = reversals.length;
  const done = await reversePendingShopRefundTax();
  ok('a tax reversal that didn’t go is retried hourly', later.ok && done >= 1 && reversals.length > n && !!(await prisma.shopSaleRefund.findFirst({ where: { saleId: card.id, amountCents: 100 } }))?.taxReversalId);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('pos-register-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

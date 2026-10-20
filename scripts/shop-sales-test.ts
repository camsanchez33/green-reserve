// POS-2 (Cam 2026-10-19): walk-up pro-shop sales. Source checks on the money
// rules; the flow itself was walked against a local database (see the PR).
// Run: npx tsx scripts/shop-sales-test.ts
import { readFileSync } from 'fs';

const lib = readFileSync('src/lib/shop-sales.ts', 'utf8');
const staff = readFileSync('src/app/api/operator/shop-sales/route.ts', 'utf8');
const pub = readFileSync('src/app/api/shop-sale/[id]/route.ts', 'utf8');
const items = readFileSync('src/app/api/operator/shop-items/route.ts', 'utf8');
const shop = readFileSync('src/lib/shop.ts', 'utf8');
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

check('prices come from the catalog, never the client', /findMany\(\{ where: \{ id: \{ in: \[\.\.\.wanted\.keys\(\)\] \}, courseId: opts\.courseId, active: true, options: \{ none: \{\} \}, OR: \[\{ parentId: null \}, \{ parent: \{ active: true \} \}\] \} \}\)/.test(lib) && /unitPriceCents: i\.priceCents/.test(lib));
check('a charge claims the sale before touching Stripe', lib.indexOf("data: { status: 'paying', chargeStartedAt: now }") > 0 && lib.indexOf("data: { status: 'paying', chargeStartedAt: now }") < lib.indexOf('stripe.paymentIntents.confirm('));
check('void and took-cash only take an open sale', /where: \{ id: saleId, courseId, status: 'open' \}/.test(lib));
check('a decline puts the sale back to open', /status: 'paying', chargeStartedAt: now \}, data: \{ status: 'open'/.test(lib));
check('one PaymentIntent per sale, created once', lib.includes('idempotencyKey: `shop-sale-intent-${saleId}`') && lib.includes('data: { paymentIntentId: pi.id }'));
check('every attempt confirms that same intent', lib.includes('stripe.paymentIntents.confirm(pi.id,'));
check('only a definite decline releases the claim', /if \(err instanceof Stripe\.errors\.StripeCardError\) \{\s*await release\(\);/.test(lib) && lib.includes('return unsure;'));
check('a stuck sale is settled from Stripe', lib.includes('export async function reconcileStuckSale') && staff.includes('reconcileStuckSale('));
check('void and took-cash stop the card intent first', staff.indexOf('cancelSaleIntent(') > 0 && staff.indexOf('cancelSaleIntent(') < staff.indexOf('settleOpenSale('));
check('pay attempts are limited per sale as well as per IP', pub.includes('shop-sale-pay:sale:'));
check('pay-link texts are capped and US/Canada only', staff.includes('shop-link:course:') && staff.includes("to.startsWith('+1')"));
check('the customer must confirm the total they saw', lib.includes('Number(expectedTotalCents) !== sale.totalCents'));
check('GreenReserve fee follows the shop-fee switch', lib.includes('const fee = shopFeeFor(amountCents);'));
check('the pay page needs the sale token', lib.includes('sale.payToken !== token') && pub.includes('saleForPayPage(id, token)'));
check('the pay route is rate limited', pub.includes('rateLimit(`shop-sale-pay:'));
check('staff routes need shop.sell; cash also needs counter payment; only links need the agreement',
  staff.includes("requirePermission(session, 'shop.sell')") && (staff.match(/requirePermission\(g\.session, 'sheet\.counter_payment'\)/g) || []).length === 2
  && (staff.match(/requireAgreementCurrent\(g\.session\.courseId\)/g) || []).length === 2);
check('staff writes are scoped to the session course', staff.includes('courseId: g.session.courseId') && lib.includes('where: { id: saleId, courseId, status'));
check('stock is optional and bounded', items.includes('n > 100000') && items.includes("body.stockCount === ''"));
check('round items take and return stock too', shop.includes('await takeStock(tx, item.id, quantity)') && shop.includes('await takeStock(tx, line.shopItemId, -line.quantity)'));
// W2-7: the delete rule moved to lib/shop-catalog deleteItem (it also counts an item's options).
const catalogLib = readFileSync('src/lib/shop-catalog.ts', 'utf8');
check('an item sold walk-up is hidden, not deleted', /existing\._count\.sales \+ existing\._count\.saleLines/.test(catalogLib) && items.includes('deleteItem(g.session.courseId, id)'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');

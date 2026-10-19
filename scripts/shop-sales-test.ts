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

check('prices come from the catalog, never the client', /findMany\(\{ where: \{ id: \{ in: \[\.\.\.wanted\.keys\(\)\] \}, courseId: opts\.courseId, active: true \} \}\)/.test(lib) && /unitPriceCents: i\.priceCents/.test(lib));
check('a charge claims the sale before touching Stripe', lib.indexOf("data: { status: 'paying', chargeStartedAt: now }") > 0 && lib.indexOf("data: { status: 'paying', chargeStartedAt: now }") < lib.indexOf('chargeOnConnectedAccount({'));
check('void and took-cash only take an open sale', /where: \{ id: saleId, courseId, status: 'open' \}/.test(lib));
check('a decline puts the sale back to open', /status: 'paying', chargeStartedAt: now \}, data: \{ status: 'open'/.test(lib));
check('Stripe is asked about an earlier success before charging', lib.indexOf("metadata['shopSaleId']") > 0 && lib.indexOf("metadata['shopSaleId']") < lib.indexOf('chargeOnConnectedAccount({'));
check('the charge is idempotent per sale and card', lib.includes('idempotencyKey: `shop-sale-${saleId}-${paymentMethodId}`'));
check('the customer must confirm the total they saw', lib.includes('Number(expectedTotalCents) !== sale.totalCents'));
check('GreenReserve fee follows the shop-fee switch', lib.includes('applicationFeeCents: shopFeeFor(sale.totalCents)'));
check('the pay page needs the sale token', lib.includes('sale.payToken !== token') && pub.includes('saleForPayPage(id, token)'));
check('the pay route is rate limited', pub.includes('rateLimit(`shop-sale-pay:'));
check('staff routes need shop.sell and a current agreement', staff.includes("requirePermission(session, 'shop.sell')") && staff.includes('requireAgreementCurrent(session.courseId)'));
check('staff writes are scoped to the session course', staff.includes('courseId: g.session.courseId') && lib.includes('where: { id: saleId, courseId, status'));
check('stock is optional and bounded', items.includes('n > 100000') && items.includes("body.stockCount === ''"));
check('round items take and return stock too', shop.includes('await takeStock(tx, item.id, quantity)') && shop.includes('await takeStock(tx, line.shopItemId, -line.quantity)'));
check('an item sold walk-up is hidden, not deleted', items.includes('existing._count.saleLines > 0'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');

// RECEIPT-3 (Cam 2026-11-09: "this is the receipt text, not even a link"; "if I click receipt as the course I should be
// able to see it"; "just have a filter by button"). A pro shop receipt: staff see it in place, the customer's page is
// token-gated and only for a paid sale, the text is the link, and the link's secret is minted once.
// Needs a database. Run: npx tsx scripts/shop-receipt-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { staffShopReceipt, publicShopReceipt, shopReceiptUrl } from '../src/lib/shop-receipt';

const TAG = 'shopreceiptdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId: { in: ids } } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Receipt ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'Paramus', state: 'NJ', zipCode: '9', holes: 18, timezone: 'America/New_York' } });
  const c = await mk('a'), other = await mk('b');
  const sale = (status: string) => prisma.shopSale.create({ data: { courseId: c.id, status, totalCents: 1284, taxCents: 84, cashTenderedCents: 2000, paidAt: new Date(), customerName: 'Pat', lines: { create: [{ name: 'Sleeve of balls', unitPriceCents: 600, quantity: 2 }] } } });
  const paid = await sale('paid_cash'), open = await sale('open');

  const r = await staffShopReceipt(c.id, paid.id);
  ok('staff see a paid sale\'s receipt: lines, tax, total, cash and change', !!r && r.totalCents === 1284 && r.taxCents === 84 && r.lines[0].quantity === 2 && r.cashTenderedCents === 2000 && r.paidWith === 'Cash' && r.ref === `#${(await prisma.shopSale.findUniqueOrThrow({ where: { id: paid.id }, select: { number: true } })).number}`, r); // PRO-SHOP: the receipt reads like the Sales list
  ok('…not an unpaid sale', (await staffShopReceipt(c.id, open.id)) === null);
  ok('…not another course\'s sale', (await staffShopReceipt(other.id, paid.id)) === null);

  ok('the customer\'s page: nothing before a receipt is sent (no secret yet)', (await publicShopReceipt(paid.id, '')) === null);
  const url = await shopReceiptUrl(c.id, paid.id);
  const token = url?.split('token=')[1] ?? '';
  ok('sending mints the link\'s secret', !!url && url.includes(`/receipt/shop/${paid.id}?token=`) && token.length > 20, url);
  const again = await shopReceiptUrl(c.id, paid.id);
  ok('…once — sending again reuses it', again === url);
  ok('another course can\'t mint a link to it', (await shopReceiptUrl(other.id, paid.id)) === null);
  ok('the right secret shows the receipt', (await publicShopReceipt(paid.id, token))?.totalCents === 1284);
  ok('a wrong or missing secret shows nothing', (await publicShopReceipt(paid.id, token.slice(0, -1) + 'x')) === null && (await publicShopReceipt(paid.id, '')) === null);
  ok('a pay link\'s secret isn\'t the receipt\'s (sending a receipt doesn\'t mark it a pay link)', (await prisma.shopSale.findUniqueOrThrow({ where: { id: paid.id } })).payToken === '');

  const read = (p: string) => readFileSync(p, 'utf8');
  const route = read('src/app/api/operator/shop-sales/route.ts');
  ok('the texted receipt is the link', route.includes('const url = await shopReceiptUrl(g.session.courseId, s.id);') && route.includes('your receipt from ${s.course.name}') && !route.includes('GreenReserve receipt from'));
  ok('staff read a receipt by id, only their course\'s', route.includes('await staffShopReceipt(g.session.courseId, receiptOf)'));
  const page = read('src/app/dashboard/shop/page.tsx');
  ok('Sales → Receipt opens it in place with the send row', page.includes('<SaleReceiptPanel receipt={receipt}') && !page.includes('function ReceiptForm('));
  ok('one Filter control, not a row of chips', page.includes('ariaLabel="Sort and filter"') && !page.includes('aria-label="Show"'));
  ok('the send button is a small icon with a label', read('src/components/dashboard/shop/SaleReceiptPanel.tsx').includes('aria-label="Send receipt"'));
  ok('the customer\'s page is noindex and token-gated', read('src/app/receipt/shop/[id]/page.tsx').includes('robots: { index: false, follow: false }') && read('src/app/receipt/shop/[id]/page.tsx').includes('publicShopReceipt(id,'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('shop-receipt-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

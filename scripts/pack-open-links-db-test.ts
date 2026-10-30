// PRICE-4 (Cam 2026-10-30: the pack price on an unpaid link is "up to course and has to have
// terms"): each pack says whether an unpaid link keeps its price or closes when the pack
// changes; the pay page shows the pack's terms and a golfer pays only after agreeing.
// Needs a database. Run: npx tsx scripts/pack-open-links-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { readPack, buyPackOnline, closeStalePackLinks, packTermsText, saleTerms, stalePackLinkBlock } from '../src/lib/round-packs';
import { createSale, chargeSale, saleForPayPage } from '../src/lib/shop-sales';

const TAG = 'packopenlinksdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const G = { email: `${TAG}+pat@t.local`, name: 'Pat Golfer', phone: '' };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.roundPack.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const sale = (id: string) => prisma.shopSale.findUniqueOrThrow({ where: { id }, include: { lines: true } });

(async () => {
  await cleanup();
  ok('the link rule is read, keep by default', (readPack({ name: 'T', rounds: 2, priceCents: 1000 }) as { data: { openLinks: string } }).data.openLinks === 'keep' && (readPack({ name: 'T', rounds: 2, priceCents: 1000, openLinks: 'current' }) as { data: { openLinks: string } }).data.openLinks === 'current' && (readPack({ name: 'T', rounds: 2, priceCents: 1000, openLinks: 'x' }) as { data: { openLinks: string } }).data.openLinks === 'keep');

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Links GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const keep = await prisma.roundPack.create({ data: { courseId: c.id, name: 'Ten', rounds: 10, priceCents: 40000, sellOnline: true, validDays: 365 } });
  const cur = await prisma.roundPack.create({ data: { courseId: c.id, name: 'Five', rounds: 5, priceCents: 20000, sellOnline: true, openLinks: 'current', guests: true, coversCart: true } });

  // Keep: a price change leaves the open link at what it was sent at.
  const k1 = await buyPackOnline(c.id, keep.id, G);
  await prisma.roundPack.update({ where: { id: keep.id }, data: { priceCents: 45000 } });
  const k2 = await buyPackOnline(c.id, keep.id, G);
  ok('keep: Buy again gives back the same link at the price it was sent at', k1.ok && k2.ok && k1.saleId === k2.saleId && (await sale(k1.saleId)).totalCents === 40000);

  // Current: a change closes the link with a note; Buy again is at the new price.
  const c1 = await buyPackOnline(c.id, cur.id, G);
  ok('current: an unchanged pack closes nothing', (await closeStalePackLinks(c.id, cur.id)).closed === 0 && c1.ok && (await sale(c1.saleId)).status === 'open');
  await prisma.roundPack.update({ where: { id: cur.id }, data: { priceCents: 25000 } });
  const staff = await createSale({ courseId: c.id, lines: [{ roundPackId: cur.id, quantity: 1 }], pay: 'link', soldBy: 'staff', customerEmail: G.email });
  ok('…a link made after the change matches and stays open', staff.ok);
  await prisma.roundPack.update({ where: { id: cur.id }, data: { priceCents: 26000 } });
  const closed = await closeStalePackLinks(c.id, cur.id);
  const s1 = c1.ok ? await sale(c1.saleId) : null;
  ok('current: the changed pack closes both unpaid links', closed.closed === 2 && closed.failed === 0, closed);
  ok('…the golfer\'s link is void with a note pointing to the course page', s1?.status === 'void' && /buy it again from the course/.test(s1.voidNote), s1?.voidNote);
  ok('…a staff link\'s note points to the pro shop', staff.ok && /ask the pro shop/.test((await sale(staff.value.id)).voidNote));
  const c2 = await buyPackOnline(c.id, cur.id, G);
  ok('…Buy again makes a new link at the new price', c2.ok && c1.ok && c2.saleId !== c1.saleId && (await sale(c2.saleId)).totalCents === 26000);
  // A payment already going through is never closed.
  if (c2.ok) await prisma.shopSale.update({ where: { id: c2.saleId }, data: { status: 'paying', chargeStartedAt: new Date() } });
  await prisma.roundPack.update({ where: { id: cur.id }, data: { rounds: 6 } });
  ok('a paying sale is left alone', (await closeStalePackLinks(c.id, cur.id)).closed === 0 && c2.ok && (await sale(c2.saleId)).status === 'paying');
  if (c2.ok) await prisma.shopSale.update({ where: { id: c2.saleId }, data: { status: 'open', chargeStartedAt: null } });
  ok('buying online closes a stale link first (an edit that missed heals)', await (async () => { const c3 = await buyPackOnline(c.id, cur.id, G); return c3.ok && c2.ok && c3.saleId !== c2.saleId && (await sale(c2.saleId)).status === 'void'; })());

  // A close that never happened (Stripe down at the edit): the pay route's own check refuses and closes it.
  const c4 = await buyPackOnline(c.id, cur.id, G);
  await prisma.roundPack.update({ where: { id: cur.id }, data: { priceCents: 27000 } });
  const v4 = c4.ok ? await saleForPayPage(c4.saleId, c4.payToken) : null;
  const block = v4 ? await stalePackLinkBlock(c.id, v4.lines) : null;
  ok('a stale link paid directly is refused, and closed', !!block && /Nothing was charged/.test(block) && c4.ok && (await sale(c4.saleId)).status === 'void', block);
  const k3 = k1.ok ? await saleForPayPage(k1.saleId, k1.payToken) : null;
  ok('…a keep pack\'s old link is fine to pay', !!k3 && (await stalePackLinkBlock(c.id, k3.lines)) === null);

  // Terms.
  const t = packTermsText({ name: 'Five', packRounds: 5, packCoversCart: true, packGuests: true, packValidDays: null }, 'current', 'Links GC');
  ok('terms say rounds, cart, guests, no end date, refunds, the fee, and the link rule', /5 rounds at Links GC, cart included/.test(t) && /players in your bookings/.test(t) && /No end date/.test(t) && /can’t be refunded/.test(t) && /booking fee/.test(t) && /this link closes and a new one/.test(t), t);
  const tk = packTermsText({ name: 'Ten', packRounds: 10, packCoversCart: false, packGuests: false, packValidDays: 365 }, 'keep', 'Links GC');
  ok('…a holder-only pack with an end date, price held', /For you only/.test(tk) && /365 days/.test(tk) && /held until you pay/.test(tk), tk);
  const k = k1.ok ? await saleForPayPage(k1.saleId, k1.payToken) : null;
  const kt = k ? await saleTerms(k.course.name, k.lines) : '';
  ok('a pack sale has terms; built from the sale line (10 rounds, as sold)', /10 rounds/.test(kt) && /held until you pay/.test(kt), kt);
  const plain = await prisma.shopSale.create({ data: { courseId: c.id, status: 'open', soldBy: 'staff', totalCents: 500, payToken: `${TAG}-tok`, lines: { create: [{ name: 'Glove', unitPriceCents: 500, quantity: 1 }] } } });
  const pv = await saleForPayPage(plain.id, plain.payToken);
  ok('a sale with no pack has no terms', pv ? (await saleTerms(pv.course.name, pv.lines)) === '' : false);
  ok('paying a pack without agreeing is refused before any claim', k1.ok && await (async () => { const r = await chargeSale(k1.saleId, k1.payToken, 'pm_x', 40000, { text: kt, agreed: false }); return !r.ok && /agree/.test(r.error) && (await sale(k1.saleId)).status === 'open'; })());

  // Wiring.
  const route = readFileSync('src/app/api/shop-sale/[id]/route.ts', 'utf8');
  ok('the pay route builds the terms itself, passes the golfer\'s tick, and checks for a stale pack first', route.includes('saleTerms(sale.course.name, sale.lines)') && route.includes('agreed: body.agreeTerms === true') && route.indexOf('stalePackLinkBlock(') > 0 && route.indexOf('stalePackLinkBlock(') < route.indexOf('chargeSale(id'));
  const lib = readFileSync('src/lib/shop-sales.ts', 'utf8');
  ok('the agreed terms are stored with the claim', /status: 'paying', chargeStartedAt: now, \.\.\.\(terms\.text \? \{ termsAgreed/.test(lib));
  const page = readFileSync('src/app/pay/shop/[id]/page.tsx', 'utf8');
  ok('the page: Pay and the wallet wait for the box', page.includes('disabled={loading || !stripe || !ready}') && page.includes('{wallet && ready && ('));
  const ops = readFileSync('src/app/api/operator/round-packs/route.ts', 'utf8');
  ok('an edit on a current pack closes stale links', ops.includes("if (data.openLinks !== 'current')") && ops.includes('closeStalePackLinks(g.session.courseId, row.id)'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('pack-open-links-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

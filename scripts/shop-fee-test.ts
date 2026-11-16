// SHOP-FEE-1 (Cam 2026-11-16) — GreenReserve's 1% service fee on pro-shop items paid by card.
// The pure rules, then the real paths against a database with the Stripe client's methods
// swapped for fakes that record what would be sent (as pos-shop-test.ts and
// shop-sales-db-test.ts do): the 66¢ example on a pay link, items on a round (fee on the
// items only, the $1.50 per player unchanged), cash exempt, a refund gives back its share,
// and no fee for a course on the old agreement version (or on the new one before it is published).
// Needs a database, no Stripe. Run: npx tsx scripts/shop-fee-test.ts
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { shopServiceFeeCents, SHOP_FEE_FIRST_VERSION, SHOP_FEE_LABEL } from '../src/lib/booking-fees';
import { shopFeeOn, namesShopFee } from '../src/lib/shop-fee';
import { addItemToBooking, roundApplicationFeeCents, roundChargeCents } from '../src/lib/shop';
import { createSale, chargeSale, settleOpenSale, refundSale, quoteSale, shopFeeBaseCents, serviceFeeBackCents, saleCardCents } from '../src/lib/shop-sales';
import { performCheckIn } from '../src/lib/checkin-booking';
import { settleAtCounter } from '../src/lib/counter-pay';
import { refundBooking } from '../src/lib/refund-booking';
import { feeBackCents } from '../src/lib/money-ledger';
import { currentVersion, listVersions, loadDocument, signableDocuments } from '../src/lib/agreements';

const TAG = 'shopfeetest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ── Fake Stripe ──────────────────────────────────────────────────────────────
type PI = { id: string; status: string; amount: number; application_fee_amount?: number | null; created: number };
const intents = new Map<string, PI>();
const charges: PI[] = [];
const refunds: { payment_intent: string; amount?: number; refund_application_fee?: boolean }[] = [];
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.customers.create = async () => ({ id: 'cus_fake' });
s.paymentMethods.attach = async () => ({ id: 'pm_fake' });
s.paymentMethods.create = async () => ({ id: 'pm_clone_fake' });
s.paymentIntents.search = async () => ({ data: [] });
s.paymentIntents.create = async (p: { amount: number; application_fee_amount?: number; metadata?: Record<string, string>; confirm?: boolean }, o: { idempotencyKey?: string }) => {
  const id = `pi_${TAG}_${o?.idempotencyKey ?? intents.size + 1}`;
  if (!intents.has(id)) {
    // A walk-up sale's intent waits for its card; a round's charge goes through at once.
    const pi = { id, status: p.metadata?.shopSaleId ? 'requires_payment_method' : 'succeeded', amount: p.amount, application_fee_amount: p.application_fee_amount ?? null, created: Math.floor(Date.now() / 1000) };
    intents.set(id, pi); charges.push(pi);
  }
  return { ...intents.get(id)! };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { intents.get(id)!.status = 'canceled'; return { ...intents.get(id)! }; };
s.paymentIntents.confirm = async (id: string) => { const pi = intents.get(id)!; pi.status = 'succeeded'; return { ...pi }; };
s.refunds.list = async (p: { payment_intent: string }) => ({ data: refunds.filter(r => r.payment_intent === p.payment_intent).map((r, i) => ({ id: `re_${i}`, amount: r.amount ?? 0, status: 'succeeded', metadata: {} })) });
s.refunds.create = async (p: { payment_intent: string; amount?: number; refund_application_fee?: boolean }) => { refunds.push(p); return { id: `re_${TAG}_${refunds.length}`, amount: p.amount ?? 0, status: 'succeeded' }; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.moneyMove.deleteMany({ where: { courseId } });
  await prisma.shopSaleRefund.deleteMany({ where: { courseId } });
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId } } });
  await prisma.shopSale.deleteMany({ where: { courseId } });
  const bookingId = { in: (await prisma.booking.findMany({ where: { courseId }, select: { id: true } })).map(b => b.id) };
  await prisma.bookingShopItem.deleteMany({ where: { bookingId } });
  await prisma.paymentEvent.deleteMany({ where: { bookingId } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.shopItem.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.agreementAcceptance.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  // ── Pure rules ─────────────────────────────────────────────────────────────
  check('Cam\'s example: a $50 shirt and $16 of range balls = $66 → 66¢', shopServiceFeeCents(5000 + 1600) === 66);
  check('half up to the cent: $0.50 → 1¢, $0.49 → 0¢, $12.50 → 13¢, $12.49 → 12¢', shopServiceFeeCents(50) === 1 && shopServiceFeeCents(49) === 0 && shopServiceFeeCents(1250) === 13 && shopServiceFeeCents(1249) === 12);
  check('nothing, or less than nothing, carries no fee', shopServiceFeeCents(0) === 0 && shopServiceFeeCents(-500) === 0);
  check('the fee base is the items after the discount, before tax', shopFeeBaseCents([{ unitPriceCents: 5000, quantity: 1 }, { unitPriceCents: 800, quantity: 2 }], 600) === 6000);
  check('a round pack (prepaid rounds) is never in the base', shopFeeBaseCents([{ unitPriceCents: 5000, quantity: 1 }, { unitPriceCents: 20000, quantity: 1, pack: {} }]) === 5000);
  check('a refund gives back its share of the fee: half the items → half the fee', serviceFeeBackCents(3300, { totalCents: 6600, serviceFeeCents: 66 }) === 33);
  check('…and the whole fee on a whole refund, never more', serviceFeeBackCents(6600, { totalCents: 6600, serviceFeeCents: 66 }) === 66 && serviceFeeBackCents(9999, { totalCents: 6600, serviceFeeCents: 66 }) === 66);
  check('a cash sale has no fee to give back', serviceFeeBackCents(3300, { totalCents: 6600, serviceFeeCents: 0 }) === 0);
  check('the card pays the course\'s total plus the fee', saleCardCents({ totalCents: 6600, serviceFeeCents: 66 }) === 6666);
  check('the round\'s charge adds the items\' fee once, the $1.50 per player apart', roundChargeCents({ totalAmount: 5300, shopTotalCents: 6600, shopFeeCents: 66, shopTaxCents: 0 }) === 5300 + 6600 + 66 && roundApplicationFeeCents({ accessFeeTotal: 300, shopFeeCents: 66 }) === 366);
  check('golfers see it named "GreenReserve service fee", never "processing fee"', SHOP_FEE_LABEL.startsWith('GreenReserve service fee') && !/processing/i.test(SHOP_FEE_LABEL));
  check(`a version names the fee from ${SHOP_FEE_FIRST_VERSION} on`, namesShopFee(SHOP_FEE_FIRST_VERSION) && namesShopFee('2027-03') && !namesShopFee('2026-11') && !namesShopFee('2026-10'));
  check('a version that is not YYYY-MM never names it (text that sorts late, like "x-old")', !namesShopFee('x-old') && !namesShopFee('2026-12-bis') && !namesShopFee(''));

  // ── The new agreement version on disk ─────────────────────────────────────
  const v = SHOP_FEE_FIRST_VERSION;
  check(`Operator Agreement ${v} is on disk`, listVersions('operator_agreement').includes(v));
  const doc = loadDocument('operator_agreement', v);
  check(`${v} names the 1% shop fee in its fees section`, /1% of each card payment for pro-shop items/.test(doc.markdown), doc.markdown.slice(0, 200));
  check(`${v} asks courses that signed before to re-accept`, doc.reacceptRequired);
  check(`${v} is a draft until counsel reads it (legal/LEGAL_QUEUE.md) — never presented for signature`, doc.draft && !signableDocuments().some(d => d.document === 'operator_agreement' && d.version === v));
  check('while it is a draft, the current (signable) version stays 2026-11', currentVersion('operator_agreement') === '2026-11' && signableDocuments().some(d => d.document === 'operator_agreement' && d.version === '2026-11'));

  // ── Against the database ──────────────────────────────────────────────────
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Fee Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Fee ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const oldCourse = await mk('old');
  const newCourse = await mk('new');
  const sign = (courseId: string, version: string, textHash: string) => prisma.agreementAcceptance.create({ data: { courseId, document: 'operator_agreement', version, textHash, signerName: 'Pat', signerTitle: 'GM', signerEmail: `${TAG}@test.local`, authorityAttested: true } });
  // The old course signed v2026-11 (the version before the fee); the new one signed the version naming it.
  await sign(oldCourse.id, '2026-11', loadDocument('operator_agreement', '2026-11').hash);
  await sign(newCourse.id, v, doc.hash);

  // This test publishes the fee version itself; it never touches a row it didn't make.
  if (await prisma.agreementVersion.findUnique({ where: { document_version: { document: 'operator_agreement', version: v } } })) {
    throw new Error(`Operator Agreement ${v} is already published in this database — run this test on a throwaway local database.`);
  }
  check('signed the new version, but it is not published: no fee', !(await shopFeeOn(newCourse.id)));
  await prisma.agreementVersion.create({ data: { document: 'operator_agreement', version: v, textHash: doc.hash, effectiveAt: new Date(Date.now() + 86_400_000), reacceptBy: new Date(Date.now() + 31 * 86_400_000) } });
  check('published but not yet in effect: no fee', !(await shopFeeOn(newCourse.id)));
  await prisma.agreementVersion.update({ where: { document_version: { document: 'operator_agreement', version: v } }, data: { effectiveAt: new Date(Date.now() - 60_000) } });
  check('published and in effect, and the course accepted it: the fee is on', await shopFeeOn(newCourse.id));
  check('a course on the old agreement version: no fee', !(await shopFeeOn(oldCourse.id)));
  const tampered = await mk('hash');
  await sign(tampered.id, v, 'not-the-published-text');
  check('an acceptance of different text than was published does not count', !(await shopFeeOn(tampered.id)));

  const shirt = await prisma.shopItem.create({ data: { courseId: newCourse.id, name: 'Shirt', priceCents: 5000 } });
  const balls = await prisma.shopItem.create({ data: { courseId: newCourse.id, name: 'Range balls', priceCents: 1600 } });
  const oldShirt = await prisma.shopItem.create({ data: { courseId: oldCourse.id, name: 'Shirt', priceCents: 5000 } });
  const cart = [{ shopItemId: shirt.id, quantity: 1 }, { shopItemId: balls.id, quantity: 1 }];

  // Walk-up pay link: Cam's example.
  const q = await quoteSale(newCourse.id, cart);
  check('the register\'s quote shows the card fee (66¢) beside the $66 total', q.ok && q.value.totalCents === 6600 && q.value.cardFeeCents === 66, q);
  const link = await createSale({ courseId: newCourse.id, lines: cart, pay: 'link', soldBy: 't' });
  if (!link.ok) throw new Error(link.error);
  check('a pay-link sale fixes the 66¢ fee; the course\'s total stays $66', link.value.totalCents === 6600 && link.value.serviceFeeCents === 66, link.value);
  check('the pay page\'s old total (without the fee) is refused', !(await chargeSale(link.value.id, link.value.payToken, 'pm_card', 6600)).ok);
  const paid = await chargeSale(link.value.id, link.value.payToken, 'pm_card', 6666);
  const pi = charges.at(-1);
  check('the card pays $66.66 with 66¢ as GreenReserve\'s application fee', paid.ok && pi?.amount === 6666 && pi?.application_fee_amount === 66, { paid, pi });
  const inMove = await prisma.moneyMove.findFirst({ where: { saleId: link.value.id, direction: 'in' } });
  check('recordMove: the charge in, with GreenReserve\'s 66¢', inMove?.amountCents === 6666 && inMove?.platformFeeCents === 66 && inMove?.method === 'card', inMove);

  // A refund gives back its share.
  const half = await refundSale(newCourse.id, link.value.id, { amountCents: 3300, reason: 'shirt back' }, 't');
  const r1 = refunds.at(-1);
  check('half the items back: the golfer gets $33 + 33¢, the fee back pro rata', half.ok && r1?.amount === 3333 && r1?.refund_application_fee === true, { half, r1 });
  const out1 = await prisma.moneyMove.findFirst({ where: { saleId: link.value.id, direction: 'out' }, orderBy: { at: 'asc' } });
  check('recordMove: the refund out, with GreenReserve\'s 33¢ back', out1?.amountCents === 3333 && out1?.platformFeeCents === feeBackCents(3333, 6666, 66) && out1?.platformFeeCents === 33, out1);
  const rest = await refundSale(newCourse.id, link.value.id, { reason: 'all back' }, 't');
  const r2 = refunds.at(-1);
  check('the rest back: the whole fee has come back to the golfer', rest.ok && r2?.amount === 3333 && (r1?.amount ?? 0) + (r2?.amount ?? 0) === 6666, { rest, r2 });

  // Cash never carries it.
  const cash = await createSale({ courseId: newCourse.id, lines: cart, pay: 'cash', soldBy: 't' });
  check('a cash sale carries no fee', cash.ok && cash.value.serviceFeeCents === 0 && cash.value.totalCents === 6600, cash);
  const linkToCash = await createSale({ courseId: newCourse.id, lines: cart, pay: 'link', soldBy: 't' });
  if (!linkToCash.ok) throw new Error(linkToCash.error);
  const tookCash = await settleOpenSale(newCourse.id, linkToCash.value.id, 'paid_cash');
  const ltc = await prisma.shopSale.findUnique({ where: { id: linkToCash.value.id } });
  const ltcMove = await prisma.moneyMove.findFirst({ where: { saleId: linkToCash.value.id } });
  check('a pay link taken in cash drops the fee; the till records $66', tookCash.ok && ltc?.serviceFeeCents === 0 && ltcMove?.amountCents === 6600 && ltcMove?.platformFeeCents === 0, { ltc, ltcMove });

  // The old agreement version: no fee anywhere.
  const oldLink = await createSale({ courseId: oldCourse.id, lines: [{ shopItemId: oldShirt.id, quantity: 1 }], pay: 'link', soldBy: 't' });
  check('a course on the old version: a pay link carries no fee', oldLink.ok && oldLink.value.serviceFeeCents === 0, oldLink);
  if (oldLink.ok) {
    await chargeSale(oldLink.value.id, oldLink.value.payToken, 'pm_card', 5000);
    check('…and its card charge has no application fee', charges.at(-1)?.amount === 5000 && !charges.at(-1)?.application_fee_amount, charges.at(-1));
  }

  // Items on a round.
  const tt = await prisma.teeTime.create({ data: { courseId: newCourse.id, date: '2030-01-05', time: '08:00', greenFeeCents: 2500, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4 } });
  const oldTt = await prisma.teeTime.create({ data: { courseId: oldCourse.id, date: '2030-01-05', time: '08:00', greenFeeCents: 2500, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4 } });
  const booking = (courseId: string, teeTimeId: string) => prisma.booking.create({
    data: {
      courseId, teeTimeId, golferName: 'Pat Test', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 2,
      greenFeeTotal: 5000, accessFeeTotal: 300, totalAmount: 5300,
      stripeCustomerId: 'cus_test', stripePaymentMethodId: 'pm_test', checkInToken: `${TAG}-${Math.random()}`,
    },
  });
  const b = await booking(newCourse.id, tt.id);
  await addItemToBooking(newCourse.id, b.id, shirt.id, 1, 'staff');
  const added = await addItemToBooking(newCourse.id, b.id, balls.id, 1, 'staff');
  check('items on a round: the fee is 1% of the items only (66¢), not of the round', added.ok && added.shopTotalCents === 6600 && added.shopFeeCents === 66, added);
  const ci = await performCheckIn(b.id, { type: 'staff', id: op.id });
  const rc = charges.at(-1);
  check('charged by card: round $53 + items $66 + 66¢, once', 'success' in ci && rc?.amount === 5300 + 6600 + 66, { ci, rc });
  check('GreenReserve\'s cut: the $1.50 per player ($3) unchanged, plus 66¢ — never doubled', rc?.application_fee_amount === 300 + 66, rc);
  const ref = await refundBooking(b.id, { amountCents: 5983, reason: 'half back', actor: 'operator', actorName: 't' });
  const rr = refunds.at(-1);
  check('a part refund of the round gives GreenReserve\'s fee back pro rata (as the booking fee does)', ref.ok && rr?.refund_application_fee === true && rr?.amount === 5983, { ref, rr });
  const rMove = await prisma.moneyMove.findFirst({ where: { bookingId: b.id, direction: 'out' } });
  check('recordMove: that refund carries its share of the $3.66', rMove?.platformFeeCents === feeBackCents(5983, 11966, 366), rMove);

  const counter = await booking(newCourse.id, tt.id);
  await addItemToBooking(newCourse.id, counter.id, shirt.id, 1, 'staff');
  const settled = await settleAtCounter(newCourse.id, counter.id, { actor: { type: 'staff', id: op.id }, actorName: 't' });
  const after = await prisma.booking.findUnique({ where: { id: counter.id } });
  check('items on a round paid at the counter (cash, check): no fee', settled.ok && after?.shopFeeCents === 0 && after?.shopTotalCents === 5000, { settled, after });

  const oldB = await booking(oldCourse.id, oldTt.id);
  const oldAdd = await addItemToBooking(oldCourse.id, oldB.id, oldShirt.id, 1, 'staff');
  check('items on a round at a course on the old version: no fee', oldAdd.ok && oldAdd.shopFeeCents === 0, oldAdd);

  await prisma.agreementVersion.delete({ where: { document_version: { document: 'operator_agreement', version: v } } });
  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

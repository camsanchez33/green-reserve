// POS-1a — pro-shop items charged with the round. Runs the real charge path
// (performCheckIn), the refund and the receipt against a database, with the
// Stripe client's methods swapped for fakes that record what would be sent.
// Needs a database, no Stripe. Run: npx tsx scripts/pos-shop-test.ts
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { performCheckIn } from '../src/lib/checkin-booking';
import { refundBooking } from '../src/lib/refund-booking';
import { receiptCharges } from '../src/lib/receipt-charges';
import {
  addItemToBooking, removeLineFromBooking, shopFeeFor, roundChargeCents, roundApplicationFeeCents,
  shopLockedReason, validItemInput, SHOP_SALE_FEE_CENTS, SHOP_FEE_ON, MAX_BOOKING_SHOP_CENTS,
} from '../src/lib/shop';

// The fee the database flow below expects: 50¢ once SHOP_FEE_ON is turned on, 0 until then.
const FEE = SHOP_FEE_ON ? 50 : 0;

const TAG = 'posshoptest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ── Fake Stripe ──────────────────────────────────────────────────────────────
const sent: { charges: { amount: number; application_fee_amount?: number }[]; refunds: { amount?: number; refund_application_fee?: boolean }[] } = { charges: [], refunds: [] };
let piSeq = 0;
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.paymentMethods.create = async () => ({ id: 'pm_clone_test' });
s.paymentIntents.search = async () => ({ data: [] });
// failNext: 'decline' = Stripe says no money moved; 'timeout' = it may have.
let failNext: '' | 'decline' | 'timeout' = '';
s.paymentIntents.create = async (p: { amount: number; application_fee_amount?: number }) => {
  if (failNext) {
    const kind = failNext; failNext = '';
    throw Object.assign(new Error(kind === 'decline' ? 'Your card was declined.' : 'Request timed out'), { type: kind === 'decline' ? 'StripeCardError' : 'StripeConnectionError' });
  }
  sent.charges.push(p); return { id: `pi_${TAG}_${++piSeq}`, amount: p.amount, created: Math.floor(Date.now() / 1000) };
};
s.refunds.create = async (p: { amount?: number; refund_application_fee?: boolean }) => { sent.refunds.push(p); return { id: `re_${TAG}_${sent.refunds.length}`, amount: p.amount ?? 0 }; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  const bookings = await prisma.booking.findMany({ where: { courseId }, select: { id: true } });
  const bookingId = { in: bookings.map(b => b.id) };
  await prisma.bookingShopItem.deleteMany({ where: { bookingId } });
  await prisma.paymentEvent.deleteMany({ where: { bookingId } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.shopItem.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  // ── Pure rules ─────────────────────────────────────────────────────────────
  check('the shop fee is 50¢', SHOP_SALE_FEE_CENTS === 50);
  check('when on: one fee per sale, not per item', shopFeeFor(1, true) === 50 && shopFeeFor(99_99, true) === 50);
  check('when on: no items, no fee', shopFeeFor(0, true) === 0);
  check('off (until the agreement names it): never a fee', shopFeeFor(1200, false) === 0);
  check('the switch is off until the Operator Agreement lists the fee', SHOP_FEE_ON === false);
  check('the charge is round + items + fee', roundChargeCents({ totalAmount: 5300, shopTotalCents: 2400, shopFeeCents: 50, shopTaxCents: 0 }) === 7750);
  check('W2-7 B2: the sales tax on the items rides the same charge', roundChargeCents({ totalAmount: 5300, shopTotalCents: 2400, shopFeeCents: 50, shopTaxCents: 159 }) === 7909);
  check('a booking without items charges the round only', roundChargeCents({ totalAmount: 5300, shopTaxCents: 0 }) === 5300);
  check('GreenReserve takes the booking fee plus the shop fee', roundApplicationFeeCents({ accessFeeTotal: 300, shopFeeCents: 50 }) === 350);
  const open = { status: 'confirmed', paymentStatus: 'card_on_file', roundPaymentIntentId: '', paidOffline: false };
  check('unpaid booking: items can change', shopLockedReason(open) === null);
  check('paid round: locked', shopLockedReason({ ...open, paymentStatus: 'paid', roundPaymentIntentId: 'pi_x' }) !== null);
  check('checked in: locked', shopLockedReason({ ...open, status: 'completed' }) !== null);
  check('paid at the counter: locked', shopLockedReason({ ...open, paidOffline: true }) !== null);
  check('cancelled: locked', shopLockedReason({ ...open, status: 'cancelled' }) !== null);
  check('refunded round: locked', shopLockedReason({ ...open, paymentStatus: 'refunded', roundPaymentIntentId: 'pi_x' }) !== null);
  check('a charge attempt started: locked', shopLockedReason({ ...open, shopLockedAt: new Date() }) !== null);
  check('item needs a name', typeof validItemInput({ name: ' ', priceCents: 100 }) === 'string');
  check('item needs a price above $0', typeof validItemInput({ name: 'Balls', priceCents: 0 }) === 'string' && typeof validItemInput({ name: 'Balls', priceCents: 12.5 }) === 'string');
  check('a valid item passes', JSON.stringify(validItemInput({ name: ' Balls ', category: 'Balls', priceCents: 1200 })) === JSON.stringify({ name: 'Balls', category: 'Balls', priceCents: 1200 }));

  // ── Against the database ──────────────────────────────────────────────────
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'POS Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `POS ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const course = await mk('a');
  const other = await mk('b');
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-01-05', time: '08:00', greenFeeCents: 2500, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4 } });
  const booking = (players: number, extra: object = {}) => prisma.booking.create({
    data: {
      courseId: course.id, teeTimeId: tt.id, golferName: 'Pat Test', golferEmail: `${TAG}@noemail.greenreserve.app`, players,
      greenFeeTotal: 2500 * players, accessFeeTotal: 150 * players, totalAmount: 2650 * players,
      stripeCustomerId: 'cus_test', stripePaymentMethodId: 'pm_test', checkInToken: `${TAG}-${Math.random()}`, ...extra,
    },
  });
  const balls = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Sleeve of balls', priceCents: 1200 } });
  const tee = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Tees', priceCents: 400 } });
  const hidden = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Old hat', priceCents: 2000, active: false } });
  const foreign = await prisma.shopItem.create({ data: { courseId: other.id, name: 'Their hat', priceCents: 2500 } });

  const b = await booking(2);
  let r = await addItemToBooking(course.id, b.id, balls.id, 2, 'staff@test');
  check('adds two sleeves: $24 (+ the shop fee when on)', r.ok && r.shopTotalCents === 2400 && r.shopFeeCents === FEE, r);
  r = await addItemToBooking(course.id, b.id, tee.id, 1, 'staff@test');
  check('a second item keeps one fee', r.ok && r.shopTotalCents === 2800 && r.shopFeeCents === FEE, r);
  check('another course\'s item is refused', !(await addItemToBooking(course.id, b.id, foreign.id, 1, 'x')).ok);
  check('a hidden item is refused', !(await addItemToBooking(course.id, b.id, hidden.id, 1, 'x')).ok);
  const cross = await addItemToBooking(other.id, b.id, foreign.id, 1, 'x');
  check('another course cannot touch this booking', !cross.ok && cross.status === 404, cross);
  check('quantity 0 is refused', !(await addItemToBooking(course.id, b.id, balls.id, 0, 'x')).ok);
  const teeLine = await prisma.bookingShopItem.findFirst({ where: { bookingId: b.id, name: 'Tees' } });
  r = await removeLineFromBooking(course.id, b.id, teeLine!.id);
  check('removing the tees leaves $24', r.ok && r.shopTotalCents === 2400 && r.shopFeeCents === FEE, r);
  await prisma.shopItem.update({ where: { id: balls.id }, data: { priceCents: 9900 } });
  const line = await prisma.bookingShopItem.findFirst({ where: { bookingId: b.id } });
  check('a later price change does not touch the line', line?.unitPriceCents === 1200, line);

  const ci = await performCheckIn(b.id, { type: 'staff', id: op.id });
  const charge = sent.charges.at(-1);
  check('check-in charges round + items + fee ($53 + $24)', 'success' in ci && charge?.amount === 5300 + 2400 + FEE, { ci, charge });
  check('GreenReserve\'s cut is the booking fee (+ shop fee when on)', charge?.application_fee_amount === 300 + FEE, charge);
  check('check-in reports the whole charge', 'success' in ci && ci.totalCharged === 7700 + FEE, ci);
  const after = await prisma.booking.findUnique({ where: { id: b.id } });
  check('the round\'s own total is unchanged', after?.totalAmount === 5300 && after?.shopTotalCents === 2400, after);
  check('items lock once paid', !(await addItemToBooking(course.id, b.id, balls.id, 1, 'x')).ok);
  check('lines cannot be removed once paid', !(await removeLineFromBooking(course.id, b.id, line!.id)).ok);

  const rc = await receiptCharges(b.id);
  check('the receipt shows the whole charge', rc[0]?.amountCents === 7700 + FEE && /shop/.test(rc[0]?.label ?? ''), rc);

  const ref = await refundBooking(b.id, { reason: 'test', actor: 'operator', actorName: 'test' });
  check('a full refund gives back the whole charge', ref.ok && ref.amountCents === 7700 + FEE && sent.refunds.at(-1)?.amount === 7700 + FEE, { ref, refund: sent.refunds.at(-1) });

  // Partial party: the round is prorated, the items are not.
  const p = await booking(4);
  await addItemToBooking(course.id, p.id, tee.id, 1, 'x');
  const pci = await performCheckIn(p.id, { type: 'staff', id: op.id }, { checkedInPlayers: 2 });
  check('2 of 4 showed: half the round, all of the items', 'success' in pci && sent.charges.at(-1)?.amount === 5300 + 400 + FEE && sent.charges.at(-1)?.application_fee_amount === 300 + FEE, { pci, charge: sent.charges.at(-1) });

  // Security review: two adds at the same moment both count.
  const race = await booking(1);
  const adds = await Promise.all([1, 2, 3, 4, 5].map(() => addItemToBooking(course.id, race.id, tee.id, 1, 'x')));
  const raced = await prisma.booking.findUnique({ where: { id: race.id } });
  check('five adds at once: all five lines and all five in the total', adds.every(a => a.ok) && raced?.shopTotalCents === 2000 && (await prisma.bookingShopItem.count({ where: { bookingId: race.id } })) === 5, { adds, total: raced?.shopTotalCents });

  // A declined card unlocks the items; a timeout (money may have moved) keeps them frozen.
  const dec = await booking(1);
  await addItemToBooking(course.id, dec.id, tee.id, 1, 'x');
  failNext = 'decline';
  const decRes = await performCheckIn(dec.id, { type: 'staff', id: op.id });
  check('a decline is reported', 'error' in decRes, decRes);
  check('after a decline the items can still change', (await addItemToBooking(course.id, dec.id, tee.id, 1, 'x')).ok);
  const tmo = await booking(1);
  await addItemToBooking(course.id, tmo.id, tee.id, 1, 'x');
  failNext = 'timeout';
  await performCheckIn(tmo.id, { type: 'staff', id: op.id });
  const tmoAdd = await addItemToBooking(course.id, tmo.id, tee.id, 1, 'x');
  check('after a timeout the items are frozen (the charge may have gone through)', !tmoAdd.ok && tmoAdd.status === 409, tmoAdd);

  // The golfer's shown total is checked after the items freeze.
  const shown = await booking(1);
  await addItemToBooking(course.id, shown.id, tee.id, 1, 'x');
  const stale = await performCheckIn(shown.id, { type: 'golfer' }, { expectedTotalCents: 2650 });
  check('a charge at a total the golfer was not shown is refused', 'error' in stale && stale.status === 409, stale);
  check('…and that refusal unfreezes the items', (await addItemToBooking(course.id, shown.id, tee.id, 1, 'x')).ok);
  const okShown = await performCheckIn(shown.id, { type: 'golfer' }, { expectedTotalCents: 2650 + 800 + FEE });
  check('the shown total goes through', 'success' in okShown && sent.charges.at(-1)?.amount === 2650 + 800 + FEE, okShown);

  // The stored charge, not a recomputed one, caps the refund.
  const stored = await prisma.booking.findUnique({ where: { id: b.id } });
  check('the charged amount is stored on the booking', stored?.roundChargedCents === 7700 + FEE, stored?.roundChargedCents);

  // The per-booking cap.
  const big = await booking(1);
  const pricey = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Cart', priceCents: 900_000 } });
  check('one $9,000 item is allowed', (await addItemToBooking(course.id, big.id, pricey.id, 1, 'x')).ok);
  const over = await addItemToBooking(course.id, big.id, pricey.id, 1, 'x');
  check('going over $10,000 on one booking is refused cleanly', !over.ok && over.status === 409 && MAX_BOOKING_SHOP_CENTS === 1_000_000, over);
  check('the refused add left no line behind', (await prisma.bookingShopItem.count({ where: { bookingId: big.id } })) === 1);

  // No items: unchanged behaviour.
  const plain = await booking(1);
  await performCheckIn(plain.id, { type: 'staff', id: op.id });
  check('a round with no items charges exactly as before', sent.charges.at(-1)?.amount === 2650 && sent.charges.at(-1)?.application_fee_amount === 150, sent.charges.at(-1));

  await cleanup();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    if (failed) { console.error(`${failed} failed`); process.exit(1); }
    console.log('pos-shop: all passed');
  })
  .catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });

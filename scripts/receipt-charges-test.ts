// R-GOLF-010 — the receipt shows what actually reached the golfer's card.
// It used to say "Nothing has been charged yet" after a hold or a no-show fee.
// Seeds the money records each path writes and checks receiptCharges().
// Needs a database, no Stripe. Run: npx tsx scripts/receipt-charges-test.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { receiptCharges, chargedNowCents } from '../src/lib/receipt-charges';

const prisma = new PrismaClient();
const TAG = 'receiptchargestest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  const bookings = await prisma.booking.findMany({ where: { courseId }, select: { id: true } });
  const bookingId = { in: bookings.map(b => b.id) };
  await prisma.paymentEvent.deleteMany({ where: { bookingId } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

let n = 0;
async function seed(extra: Record<string, unknown>) {
  const operator = await prisma.courseOperator.upsert({
    where: { email: `${TAG}@test.local` },
    create: { name: 'Receipt Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' },
    update: {},
  });
  const course = await prisma.course.create({
    data: { name: 'Receipt Test Course', slug: `${TAG}-${++n}`, operatorId: operator.id, address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' },
  });
  const t = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-01-01', time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  return prisma.booking.create({
    data: {
      teeTimeId: t.id, courseId: course.id, golferName: 'Receipt Golfer', golferEmail: `${TAG}@test.local`,
      players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300,
      status: 'confirmed', paymentStatus: 'card_on_file', checkInToken: randomUUID(), cancellationFeeTotal: 2000,
      ...extra,
    },
  });
}
const ev = (bookingId: string, courseId: string, type: 'fee_refunded' | 'fee_charged', amountCents: number, reason: string) =>
  prisma.bookingEvent.create({ data: { bookingId, courseId, type, actorType: 'system', amountCents, stripeId: `test_${randomUUID()}`, metadata: { reason } } });

async function main() {
  await cleanup();

  {
    const b = await seed({});
    const c = await receiptCharges(b.id);
    check('a fresh booking shows no card charges', c.length === 0 && chargedNowCents(c) === 0, JSON.stringify(c));
  }
  {
    const b = await seed({ lateFeeTimingAtBooking: 'hold_at_cutoff', paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_hold' });
    const c = await receiptCharges(b.id);
    check('a taken hold is on the receipt (not "nothing charged")', c.some(x => x.label === 'Late-cancellation hold' && !x.refunded) && chargedNowCents(c) === 2000, JSON.stringify(c));
  }
  {
    const b = await seed({ lateFeeTimingAtBooking: 'hold_at_cutoff', status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_round', cancellationFeeChargeId: 'pi_hold' });
    await ev(b.id, b.courseId, 'fee_refunded', 2000, 'hold_refunded_at_checkin');
    const c = await receiptCharges(b.id);
    check('after check-in: the round charged, the hold shown refunded', c.some(x => x.label === 'Your round' && x.amountCents === 10300 && !x.refunded) && c.some(x => x.label === 'Late-cancellation hold' && x.refunded), JSON.stringify(c));
    check('after check-in the card total is the round only', chargedNowCents(c) === 10300);
  }
  {
    const b = await seed({ lateFeeTimingAtBooking: 'late_cancel', status: 'cancelled', paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_late' });
    await prisma.paymentEvent.create({ data: { bookingId: b.id, kind: 'fee_charged', amountCents: 300, stripeId: 'pi_fee', detail: 'test' } });
    await prisma.booking.update({ where: { id: b.id }, data: { stripePaymentIntentId: 'pi_fee' } });
    const c = await receiptCharges(b.id);
    check('a late cancel shows the fee and the booking fee kept with it', c.some(x => x.label === 'Late-cancellation fee' && !x.refunded) && c.some(x => x.label === 'Booking fee' && x.amountCents === 300 && !x.refunded) && chargedNowCents(c) === 2300, JSON.stringify(c));
  }
  {
    const b = await seed({ noShowAt: new Date() });
    await prisma.paymentEvent.create({ data: { bookingId: b.id, kind: 'no_show_fee', amountCents: 2500, stripeId: 'pi_ns', detail: 'test' } });
    let c = await receiptCharges(b.id);
    check('a no-show fee is on the receipt', c.some(x => x.label === 'No-show fee' && x.amountCents === 2500 && !x.refunded), JSON.stringify(c));
    await prisma.paymentEvent.create({ data: { bookingId: b.id, kind: 'no_show_fee_refunded', amountCents: 2500, stripeId: 're_ns', detail: 'test' } });
    c = await receiptCharges(b.id);
    check('"still coming" shows the no-show fee refunded', c.some(x => x.label === 'No-show fee' && x.refunded) && chargedNowCents(c) === 0, JSON.stringify(c));
  }
  {
    const b = await seed({ status: 'completed', paymentStatus: 'paid_offline', paidOffline: true });
    const c = await receiptCharges(b.id);
    check('a round paid in cash at the counter shows no card charge', c.length === 0);
  }

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

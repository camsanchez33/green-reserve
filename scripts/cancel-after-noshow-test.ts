// R-PAY-002 / R-BOOK-003 — cancelling a booking that was already marked a
// no-show (and charged for it) must never charge the late fee on top.
// "Cancel late or don't show": the no-show charge IS the late fee, so a second
// charge is the same fee twice. Needs a database, no Stripe: any attempt to
// charge is recorded as a 'charge_failed' row (placeholder key), which is what
// this checks for.
// Run: npx tsx scripts/cancel-after-noshow-test.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { performCancellation } from '../src/lib/cancel-booking';

const prisma = new PrismaClient();
const TAG = 'cancelnoshowtest';
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

async function seedNoShow(slugSuffix: string) {
  const operator = await prisma.courseOperator.upsert({
    where: { email: `${TAG}@test.local` },
    create: { name: 'Cancel No-show Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' },
    update: {},
  });
  const course = await prisma.course.create({
    data: {
      name: 'Cancel No-show Test Course', slug: `${TAG}-${slugSuffix}`, operatorId: operator.id,
      address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18,
      liveStatus: 'live', active: true, timezone: 'America/Los_Angeles', cancellationHours: 24,
      lateCancellationFeeCents: 2500, lateFeeTiming: 'late_cancel_or_no_show',
      stripeAccountId: 'acct_test_placeholder', stripeAccountActive: true,
    },
  });
  // Yesterday: well inside the cancellation window, and past the tee time.
  const d = new Date(Date.now() - 24 * 3600_000).toISOString().split('T')[0];
  const teeTime = await prisma.teeTime.create({
    data: { courseId: course.id, date: d, time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' },
  });
  const booking = await prisma.booking.create({
    data: {
      teeTimeId: teeTime.id, courseId: course.id,
      golferName: 'No-show Golfer', golferEmail: `${TAG}@test.local`,
      players: 2, greenFeeTotal: 10000, cartFeeTotal: 0,
      accessFeeTotal: 0, // keeps GreenReserve's separate fee out of this test
      totalAmount: 10000, status: 'confirmed', paymentStatus: 'card_on_file', checkInToken: randomUUID(),
      stripeCustomerId: 'cus_test_placeholder', stripePaymentMethodId: 'pm_test_placeholder',
      cancellationFeeTotal: 2500, noShowFeeTotal: 2500, lateFeeTimingAtBooking: 'late_cancel_or_no_show',
      cancellationHoursAtBooking: 24, noShowAt: new Date(Date.now() - 60 * 60_000),
    },
  });
  // What markNoShow records after a successful course no-show charge.
  await prisma.paymentEvent.create({ data: { bookingId: booking.id, kind: 'no_show_fee', amountCents: 2500, stripeId: 'pi_test_noshow', actor: 'cron', detail: 'No-show fee (automatic — not checked in)' } });
  return booking;
}

const lateFeeAttempts = (bookingId: string) =>
  prisma.paymentEvent.count({ where: { bookingId, kind: 'charge_failed', detail: { startsWith: 'Late-cancellation fee' } } });

async function main() {
  await cleanup();

  // 1. Staff or golfer cancels after the no-show: no late fee on top.
  {
    const b = await seedNoShow('plain');
    const r = await performCancellation(b.id, { type: 'staff', id: null });
    check('cancel after a charged no-show succeeds', 'success' in r && r.success === true, JSON.stringify(r));
    check('no late-fee charge is attempted on top of the no-show charge', (await lateFeeAttempts(b.id)) === 0);
    check('the caller is told a fee was kept, not "no charge"', 'success' in r && r.feeCharged === true);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    check('booking is cancelled', after?.status === 'cancelled');
    check('no late-fee charge id is stamped', !after?.cancellationFeeChargeId);
    const ev = await prisma.bookingEvent.findFirst({ where: { bookingId: b.id, type: 'booking_cancelled' } });
    const meta = (ev?.metadata ?? {}) as Record<string, unknown>;
    check('the cancel event records the no-show fee as kept', meta.noShowFeeKept === 2500, JSON.stringify(meta));
  }

  // 2. Weather cancel (fee waived): the no-show charge is refunded, not kept.
  {
    const b = await seedNoShow('waived');
    const r = await performCancellation(b.id, { type: 'staff', id: null }, { waiveFee: true, reason: 'test weather' });
    check('waived cancel succeeds', 'success' in r && r.success === true);
    check('waived cancel tries to refund the no-show charge', 'success' in r && /no-show fee/.test(r.feeRefundFailed ?? ''), 'success' in r ? (r.feeRefundFailed ?? '') : '');
    check('waived cancel never charges a late fee', (await lateFeeAttempts(b.id)) === 0);
  }

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

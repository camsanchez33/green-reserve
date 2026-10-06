// A hold-at-cutoff booking cancelled after its cutoff but before the hourly
// cron took the hold used to cost the golfer nothing, though describePolicy
// promises the hold is "kept if you cancel late". performCancellation now
// charges it, with the crons' own idempotency key. Needs a database, no Stripe:
// any charge attempt is recorded as a 'charge_failed' row (placeholder key),
// which is what this checks for.
// Run: npx tsx scripts/hold-late-cancel-test.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { performCancellation } from '../src/lib/cancel-booking';
import { cancelFutureBookingsForClosure } from '../src/lib/course-closure';

const prisma = new PrismaClient();
const TAG = 'holdlatecanceltest';
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

/** A hold booking whose tee time is `hoursOut` from now, under a 24h window. */
async function seed(slugSuffix: string, hoursOut: number, timing: string | null) {
  const operator = await prisma.courseOperator.upsert({
    where: { email: `${TAG}@test.local` },
    create: { name: 'Hold Late Cancel Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' },
    update: {},
  });
  const course = await prisma.course.create({
    data: {
      name: 'Hold Late Cancel Test Course', slug: `${TAG}-${slugSuffix}`, operatorId: operator.id,
      address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18,
      liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
      lateCancellationFeeCents: 2000, lateFeeTiming: 'hold_at_cutoff',
      stripeAccountId: 'acct_test_placeholder', stripeAccountActive: true,
    },
  });
  const tee = new Date(Date.now() + hoursOut * 3600_000);
  const teeTime = await prisma.teeTime.create({
    data: { courseId: course.id, date: tee.toISOString().slice(0, 10), time: tee.toISOString().slice(11, 16), holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' },
  });
  return prisma.booking.create({
    data: {
      teeTimeId: teeTime.id, courseId: course.id,
      golferName: 'Hold Golfer', golferEmail: `${TAG}@test.local`,
      players: 2, greenFeeTotal: 10000, cartFeeTotal: 0,
      accessFeeTotal: 0, // keeps GreenReserve's separate fee out of this test
      totalAmount: 10000, status: 'confirmed', paymentStatus: 'card_on_file', checkInToken: randomUUID(),
      stripeCustomerId: 'cus_test_placeholder', stripePaymentMethodId: 'pm_test_placeholder',
      cancellationFeeTotal: 2000, lateFeeTimingAtBooking: timing, cancellationHoursAtBooking: 24,
    },
  });
}

const feeAttempts = (bookingId: string) =>
  prisma.paymentEvent.count({ where: { bookingId, kind: 'charge_failed', detail: { startsWith: 'Late-cancellation fee' } } });

async function main() {
  await cleanup();

  // 1. Past the cutoff (10h out, 24h window), hold not yet taken → the hold is charged on cancel.
  {
    const b = await seed('late', 10, 'hold_at_cutoff');
    const r = await performCancellation(b.id, { type: 'golfer', id: null });
    check('late cancel of an untaken hold succeeds', 'success' in r && r.success === true, JSON.stringify(r));
    check('the hold is charged on a late cancel', (await feeAttempts(b.id)) === 1);
    check('the booking is cancelled', (await prisma.booking.findUnique({ where: { id: b.id } }))?.status === 'cancelled');
  }

  // 2. A booking made before SP-B (no timing) behaves as a hold too.
  {
    const b = await seed('legacy', 10, null);
    await performCancellation(b.id, { type: 'golfer', id: null });
    check('a legacy (no timing) booking is charged as a hold on a late cancel', (await feeAttempts(b.id)) === 1);
  }

  // 3. Before the cutoff (48h out) → free, nothing attempted.
  {
    const b = await seed('early', 48, 'hold_at_cutoff');
    const r = await performCancellation(b.id, { type: 'golfer', id: null });
    check('cancel before the cutoff succeeds', 'success' in r && r.success === true);
    check('nothing is charged before the cutoff', (await feeAttempts(b.id)) === 0);
  }

  // 4. Waived (weather) cancel past the cutoff → nothing attempted.
  {
    const b = await seed('waived', 10, 'hold_at_cutoff');
    await performCancellation(b.id, { type: 'staff', id: null }, { waiveFee: true, reason: 'test weather' });
    check('a waived late cancel charges nothing', (await feeAttempts(b.id)) === 0);
  }

  // 5. Hold already taken by the cron → never charged a second time.
  {
    const b = await seed('taken', 10, 'hold_at_cutoff');
    await prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_test_hold', cancellationFeeChargedAt: new Date() } });
    await performCancellation(b.id, { type: 'golfer', id: null });
    check('a hold the cron already took is not charged again', (await feeAttempts(b.id)) === 0);
  }

  // 6. A course closure cancels every future booking and tells golfers nobody was charged — so it never charges a hold.
  {
    const b = await seed('closure', 10, 'hold_at_cutoff');
    await cancelFutureBookingsForClosure(b.courseId);
    check('a course closure does not charge an untaken hold', (await feeAttempts(b.id)) === 0);
    check('the closure cancelled the booking', (await prisma.booking.findUnique({ where: { id: b.id } }))?.status === 'cancelled');
  }

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

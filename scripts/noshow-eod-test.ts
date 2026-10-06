// NS-EOD (Cam 2026-10-06: "if the course charges no shows they all get charged
// at 12 midnight eod"). Marking a no-show only flags the booking; the charges
// are taken once the course's local date has passed the tee date, and only if
// the group still never checked in — so a late group checked in before midnight
// is never charged. Needs a database, no Stripe: any charge attempt shows up as
// a 'charge_failed' row (placeholder key).
// Run: npx tsx scripts/noshow-eod-test.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { markNoShow, dueNoShowCharges, chargeNoShow } from '../src/lib/no-show-fee';
import { describePolicy, policyFrom } from '../src/lib/cancel-policy';

const prisma = new PrismaClient();
const TAG = 'noshoweodtest';
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
/** A no-show-fee booking teed off at 10:00 UTC on `date` (course in UTC). */
async function seed(date: string) {
  const operator = await prisma.courseOperator.upsert({
    where: { email: `${TAG}@test.local` },
    create: { name: 'No-show EOD Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' },
    update: {},
  });
  const course = await prisma.course.create({
    data: {
      name: 'No-show EOD Test Course', slug: `${TAG}-${++n}`, operatorId: operator.id, address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18,
      liveStatus: 'live', active: true, timezone: 'UTC', noShowFeeCents: 2500, stripeAccountId: 'acct_test_placeholder', stripeAccountActive: true,
    },
  });
  const t = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  return prisma.booking.create({
    data: {
      teeTimeId: t.id, courseId: course.id, golferName: 'No-show Golfer', golferEmail: `${TAG}@test.local`,
      players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000,
      status: 'confirmed', paymentStatus: 'card_on_file', checkInToken: randomUUID(),
      stripeCustomerId: 'cus_test_placeholder', stripePaymentMethodId: 'pm_test_placeholder', noShowFeeTotal: 2500,
    },
  });
}
const attempts = (bookingId: string) => prisma.paymentEvent.count({ where: { bookingId, kind: { in: ['no_show_fee', 'charge_failed'] } } });

async function main() {
  await cleanup();
  const today = new Date().toISOString().slice(0, 10);
  const sameDayEvening = new Date(`${today}T23:30:00Z`);
  const nextMorning = new Date(new Date(`${today}T00:30:00Z`).getTime() + 86_400_000);

  // 1. Marking charges nothing.
  const b = await seed(today);
  await markNoShow(b.id, { type: 'staff', id: null });
  check('marking a no-show charges nothing', (await attempts(b.id)) === 0);
  check('the booking is flagged', !!(await prisma.booking.findUnique({ where: { id: b.id } }))?.noShowAt);

  // 2. Not due before the course's midnight; due after.
  check('not charged the same evening', !(await dueNoShowCharges(sameDayEvening)).includes(b.id));
  check('due after the course’s midnight', (await dueNoShowCharges(nextMorning)).includes(b.id));

  // 3. Charged once, then never again.
  await chargeNoShow(b.id);
  check('the end-of-day run attempts the no-show charge', (await attempts(b.id)) === 1);
  check('a booking already attempted is not tried again', !(await dueNoShowCharges(nextMorning)).includes(b.id));

  // 4. A late group checked in before midnight is never charged.
  const late = await seed(today);
  await markNoShow(late.id, { type: 'staff', id: null });
  await prisma.booking.update({ where: { id: late.id }, data: { status: 'completed', checkedInAt: new Date(), noShowAt: null } });
  check('a group checked in before midnight is not charged', !(await dueNoShowCharges(nextMorning)).includes(late.id));

  // 5. "Still coming" clears the flag — nothing due.
  const cleared = await seed(today);
  await markNoShow(cleared.id, { type: 'staff', id: null });
  await prisma.booking.update({ where: { id: cleared.id }, data: { noShowAt: null } });
  check('"Still coming" before midnight means no charge', !(await dueNoShowCharges(nextMorning)).includes(cleared.id));

  // 6. The golfer is told when.
  const lines = describePolicy(policyFrom({ noShowFeeCents: 2500 })).lines.join(' ');
  check('the policy says no-show fees are charged at the end of the day', /end of the day/.test(lines), lines);

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

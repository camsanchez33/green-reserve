// PAY-2 — what counts as "GreenReserve fee not collected, paid at the counter"
// on Admin → Revenue. Cam 2026-10-06: cash is allowed and the fee is eaten,
// but every such round is counted so the cost is visible per course.
// Needs a database, no Stripe. Run: npx tsx scripts/counter-fee-test.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { counterFeesUncollected } from '../src/lib/access-fee';

const prisma = new PrismaClient();
const TAG = 'counterfeetest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  const bookings = await prisma.booking.findMany({ where: { courseId }, select: { id: true } });
  await prisma.paymentEvent.deleteMany({ where: { bookingId: { in: bookings.map(b => b.id) } } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const operator = await prisma.courseOperator.create({ data: { name: 'Counter Fee Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' } });
  const course = await prisma.course.create({
    data: { name: 'Counter Fee Test Course', slug: `${TAG}-course`, operatorId: operator.id, address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' },
  });
  const tee = await prisma.teeTime.create({ data: { courseId: course.id, date: '2026-10-06', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'booked' } });
  const now = new Date();
  const mk = (label: string, data: { paymentStatus: string; accessFeeTotal: number }) => prisma.booking.create({
    data: {
      teeTimeId: tee.id, courseId: course.id, golferName: label, golferEmail: `${TAG}-${label}@test.local`,
      players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, totalAmount: 5000 + data.accessFeeTotal,
      status: 'completed', paidAt: now, checkInToken: randomUUID(), ...data,
    },
  });
  const cash = await mk('cash', { paymentStatus: 'paid_offline', accessFeeTotal: 150 });
  const savedCard = await mk('savedcard', { paymentStatus: 'paid_offline', accessFeeTotal: 150 });
  await prisma.paymentEvent.create({ data: { bookingId: savedCard.id, kind: 'fee_charged', amountCents: 150, stripeId: 'pi_test_counterfee', actor: 'operator' } });
  const refunded = await mk('refunded', { paymentStatus: 'paid_offline', accessFeeTotal: 150 });
  await prisma.paymentEvent.create({ data: { bookingId: refunded.id, kind: 'fee_charged', amountCents: 150, stripeId: 'pi_test_counterfee2', actor: 'operator' } });
  await prisma.paymentEvent.create({ data: { bookingId: refunded.id, kind: 'fee_refunded', amountCents: 150, stripeId: 're_test_counterfee2', actor: 'operator' } });
  await mk('walkin', { paymentStatus: 'paid_offline', accessFeeTotal: 0 });
  await mk('card', { paymentStatus: 'paid', accessFeeTotal: 150 });

  const win = { gte: new Date(now.getTime() - 60_000), lt: new Date(now.getTime() + 60_000) };
  const r = await counterFeesUncollected(win);
  const mine = r.byCourse.get(course.id);
  check('a cash round on an online booking is counted', !!mine);
  check('exactly two rounds count: cash, and a fee charged then refunded', mine?.rounds === 2, JSON.stringify(mine));
  check('the amount is their two fees ($3.00)', mine?.cents === 300, JSON.stringify(mine));
  check('a counter round whose fee hit a saved card is NOT counted (collected)', mine?.rounds === 2);
  check('a walk-in with no fee and a card-paid round are never counted', mine?.rounds === 2);
  const outside = await counterFeesUncollected({ gte: new Date(now.getTime() + 3_600_000), lt: new Date(now.getTime() + 7_200_000) });
  check('rounds outside the period are not counted', !outside.byCourse.has(course.id));
  void cash;

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

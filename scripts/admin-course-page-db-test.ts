// AW-7: one course's Bookings and Money numbers against a real database —
// fees this month by Today's rule (paid rounds + fees charged on their own −
// refunded), cash rounds whose fee wasn't collected, failed charges at what
// the card is asked for, and players per week online vs at the counter. Other
// courses never leak in. Needs a database. Run: npx tsx scripts/admin-course-page-db-test.ts
import { PrismaClient } from '@prisma/client';
import { courseMoney, courseWeeks } from '../src/lib/admin-course-page';

const prisma = new PrismaClient();
const TAG = 'admincoursepagetest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId } } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  // 3pm Eastern on Wednesday June 12, 2030.
  const now = new Date('2030-06-12T19:00:00Z');
  const op = await prisma.courseOperator.create({ data: { name: 'Page Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: number) => prisma.course.create({ data: {
    name: `${TAG} ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NJ', zipCode: '07000', holes: 18,
    liveStatus: 'live', active: true, timezone: 'America/New_York', cancellationHours: 24,
  } });
  const course = await mk(1);
  const other = await mk(2);
  const tt = async (courseId: string, date: string) => prisma.teeTime.create({ data: { courseId, date, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'available' } });
  const bk = async (courseId: string, date: string, o: Record<string, unknown>) => {
    const t = await tt(courseId, date);
    return prisma.booking.create({ data: {
      teeTimeId: t.id, courseId, golferName: 'G', golferEmail: `${TAG}@test.local`, players: 2,
      greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'completed', ...o,
    } });
  };

  // Paid this month: one round ($3 fee); one last month before the same point ($3).
  await bk(course.id, '2030-06-05', { paymentStatus: 'paid', roundPaymentIntentId: 'pi_1', paidAt: new Date('2030-06-05T15:00:00Z') });
  await bk(course.id, '2030-05-05', { paymentStatus: 'paid', roundPaymentIntentId: 'pi_2', paidAt: new Date('2030-05-05T15:00:00Z') });
  // A no-show fee charged on its own this month ($5), and $2 of it refunded.
  const ns = await bk(course.id, '2030-06-06', { status: 'confirmed', paymentStatus: 'card_on_file', roundPaymentIntentId: '' });
  await prisma.paymentEvent.create({ data: { bookingId: ns.id, kind: 'fee_charged', amountCents: 500, stripeId: `${TAG}-c`, createdAt: new Date('2030-06-06T15:00:00Z') } });
  await prisma.paymentEvent.create({ data: { bookingId: ns.id, kind: 'fee_refunded', amountCents: 200, stripeId: `${TAG}-r`, createdAt: new Date('2030-06-07T15:00:00Z') } });
  // Paid in cash this month: fee not collected ($3); one last month too.
  await bk(course.id, '2030-06-08', { paymentStatus: 'paid_offline', paidAt: new Date('2030-06-08T15:00:00Z') });
  await bk(course.id, '2030-05-08', { paymentStatus: 'paid_offline', paidAt: new Date('2030-05-08T15:00:00Z') });
  // A failed charge with a $12 shop item on it.
  await bk(course.id, '2030-06-12', { status: 'confirmed', paymentStatus: 'card_on_file', checkInFailReason: 'card_declined', shopTotalCents: 1200, shopTaxCents: 0 });
  // Another course's paid round and failed charge must not show up.
  await bk(other.id, '2030-06-05', { paymentStatus: 'paid', roundPaymentIntentId: 'pi_3', paidAt: new Date('2030-06-05T15:00:00Z') });
  await bk(other.id, '2030-06-12', { status: 'confirmed', paymentStatus: 'card_on_file', checkInFailReason: 'card_declined' });

  const m = await courseMoney(course.id, now);
  check('fees this month: round fee + no-show fee − refund = $6', Math.abs(m.feesThisMonth - 6) < 0.001, String(m.feesThisMonth));
  check('one paid round this month', m.roundsThisMonth === 1);
  check('same point last month: $3', Math.abs(m.feesSamePointLastMonth - 3) < 0.001, String(m.feesSamePointLastMonth));
  check('paid in cash this month: 1 round, $3 not collected', m.counterThisMonth.rounds === 1 && Math.abs(m.counterThisMonth.fees - 3) < 0.001);
  check('…2 rounds, $6 all time', m.counterAllTime.rounds === 2 && Math.abs(m.counterAllTime.fees - 6) < 0.001);
  check('one failed charge, only this course’s', m.failedCharges.length === 1);
  check('…at what the card is asked for: round + shop item', Math.abs(m.failedCharges[0].amount - 115) < 0.001, String(m.failedCharges[0]?.amount));

  // Weeks: an online booking and a walk-in this week, a phone booking last week, a cancelled one ignored.
  await bk(course.id, '2030-06-11', { source: 'walk_in', players: 3, paymentStatus: 'manual' });
  await bk(course.id, '2030-06-04', { source: 'phone', players: 1, paymentStatus: 'manual' });
  await bk(course.id, '2030-06-10', { status: 'cancelled', players: 4 });
  const w = await courseWeeks(course.id, 'America/New_York', now);
  const thisWeek = w[w.length - 1];
  check('this week is the week of June 10', thisWeek.weekStart === '2030-06-10');
  // This week: failed-charge booking (2, online, the 12th) + walk-in (3). Cancelled left out.
  check('this week: 2 online, 3 at the counter', thisWeek.online === 2 && thisWeek.counter === 3, JSON.stringify(thisWeek));
  const last = w[w.length - 2];
  // Last week (Jun 3–9): paid round (2), no-show (2), cash (2) online; phone (1).
  check('last week: 6 online, 1 by phone', last.online === 6 && last.counter === 1, JSON.stringify(last));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

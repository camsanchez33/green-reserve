// AW-4: the admin Today page's numbers against seeded data — money this month
// vs the same point last month (only paid rounds, by when they were paid), and
// onboarding's stuck rule (7+ days in one stage, snoozed ones excused). Uses a
// fixed "now" in 2030 so the rest of the database can't move the sums.
// Needs a database. Run: npx tsx scripts/admin-today-db-test.ts
import { PrismaClient } from '@prisma/client';
import { todayMoney, todayOnboarding, STUCK_DAYS } from '../src/lib/admin-today';

const prisma = new PrismaClient();
const TAG = 'admintodaytest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.courseInquiry.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  // 3pm Eastern on June 15, 2030: this month runs from June 1, last month's
  // same point is May 15 at 3pm.
  const now = new Date('2030-06-15T19:00:00Z');
  const base = await todayMoney(now, false);

  const op = await prisma.courseOperator.create({ data: { name: 'Today Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: 'Today Test Course', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
  } });
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-10', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'available' } });
  const booking = (paidAt: Date | null, o: { green: number; cart: number; fee: number; paid?: boolean }) => prisma.booking.create({ data: {
    teeTimeId: tt.id, courseId: course.id, golferName: 'T', golferEmail: `${TAG}@test.local`, players: 2,
    greenFeeTotal: o.green, cartFeeTotal: o.cart, accessFeeTotal: o.fee, totalAmount: o.green + o.cart + o.fee,
    status: 'completed', paymentStatus: o.paid === false ? 'card_on_file' : 'paid', roundPaymentIntentId: o.paid === false ? '' : 'pi_test', paidAt,
  } });
  await booking(new Date('2030-06-03T15:00:00Z'), { green: 10000, cart: 2000, fee: 300 });          // this month
  await booking(new Date('2030-06-15T18:00:00Z'), { green: 5000, cart: 0, fee: 150 });               // this month, an hour ago
  await booking(new Date('2030-06-03T15:00:00Z'), { green: 9999, cart: 0, fee: 999, paid: false });  // never paid
  await booking(new Date('2030-05-10T15:00:00Z'), { green: 4000, cart: 0, fee: 150 });               // last month, before the same point
  await booking(new Date('2030-05-20T15:00:00Z'), { green: 8000, cart: 0, fee: 300 });               // last month, after it

  const m = await todayMoney(now, false);
  check('this month: volume is green fees + carts of paid rounds', Math.abs(m.current.volume - base.current.volume - 170) < 0.001, `${m.current.volume}`);
  check('this month: GreenReserve fees from paid rounds only', Math.abs(m.current.fees - base.current.fees - 4.5) < 0.001, `${m.current.fees}`);
  check('this month: rounds counted', m.current.rounds - base.current.rounds === 2);
  check('last month: only up to the same point', Math.abs(m.prior.volume - base.prior.volume - 40) < 0.001 && Math.abs(m.prior.fees - base.prior.fees - 1.5) < 0.001, `${m.prior.volume}/${m.prior.fees}`);
  check('days into the month', m.daysIn === 15 && m.from === '2030-06-01');
  check('net is for the owner only', m.net === null);

  // Onboarding: stuck = in one stage STUCK_DAYS+ days, not snoozed.
  const inquiry = async (name: string, daysInStage: number, snoozed = false) => {
    const enteredAt = new Date(now.getTime() - daysInStage * 86_400_000);
    return prisma.courseInquiry.create({ data: {
      firstName: 'T', lastName: 'T', contactName: 'T', contactTitle: 'GM', email: `${TAG}@test.local`, phone: '5550000000',
      courseName: `${TAG} ${name}`, address: '1', city: 'T', state: 'CA', zipCode: '90210', courseType: 'public',
      status: 'details_requested', createdAt: new Date(enteredAt.getTime() - 86_400_000),
      snoozeUntil: snoozed ? new Date(now.getTime() + 5 * 86_400_000) : null,
      events: { create: [{ fromStatus: 'in_review', toStatus: 'details_requested', trigger: 'admin', createdAt: enteredAt }] },
    } });
  };
  await inquiry('Old', STUCK_DAYS + 3);
  await inquiry('Fresh', 2);
  await inquiry('Snoozed', STUCK_DAYS + 5, true);
  const o = await todayOnboarding(now);
  const sent = o.stages.find(s => s.key === 'sheet-sent')!;
  const mine = sent.stuck.filter(s => s.name.startsWith(TAG));
  check('stuck: the one 10 days in the stage is named', mine.some(s => s.name.endsWith('Old') && s.days === STUCK_DAYS + 3), JSON.stringify(mine));
  check('stuck: a fresh one is not', !mine.some(s => s.name.endsWith('Fresh')));
  check('stuck: a snoozed one is not', !mine.some(s => s.name.endsWith('Snoozed')));
  check('all six stages, in order', o.stages.map(s => s.key).join(',') === 'new,in-review,sheet-sent,sheet-in,building,live');
  check('the stage count includes every inquiry in it', sent.count >= 3);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

// DENSE-5 (Cam 2026-10-28): members' rounds and spend this year (src/lib/member-stats.ts)
// against a database — matched by account or email, a booking counted once however many
// keys or memberships match it, spend = Analytics' course share (no shop), money only
// when the caller may see it. Run: npx tsx scripts/member-stats-db-test.ts
import { prisma } from '../src/lib/prisma';
import { memberRoundStats } from '../src/lib/member-stats';

const TAG = 'memstatstest';
let failed = 0;
const check = (l: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${ok ? '' : ' — ' + JSON.stringify(d)}`); if (!ok) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Stats GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const other = await prisma.course.create({ data: { name: 'Other GC', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const g = await prisma.golferAccount.create({ data: { email: `${TAG}+pat@t.local`, firstName: 'Pat', lastName: 'Lee', password: 'x' } });
  const tt = (courseId: string, date: string) => prisma.teeTime.create({ data: { courseId, date, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const book = async (courseId: string, date: string, extra: Record<string, unknown>) => {
    const t = await tt(courseId, date);
    return prisma.booking.create({ data: { teeTimeId: t.id, courseId, golferName: 'Pat', golferEmail: `${TAG}+pat@t.local`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 2000, rangeBallsTotal: 500, accessFeeTotal: 150, totalAmount: 7650, shopTotalCents: 3000, status: 'completed', paymentStatus: 'paid', ...extra } });
  };
  // This year: one by account AND email (counted once), one by email only (different case).
  await book(c.id, '2031-03-01', { golferAccountId: g.id });
  await book(c.id, '2031-04-01', { golferEmail: `${TAG}+PAT@t.local` });
  // Last year: counts for last round order only. Not completed: never counted. Other course: never.
  await book(c.id, '2030-12-30', {});
  await book(c.id, '2031-05-01', { status: 'cancelled', paymentStatus: 'cancellation_fee_charged' });
  await book(other.id, '2031-06-01', {});

  const members = [
    { id: 'm1', keys: [g.id, `${TAG}+pat@t.local`, `${TAG}+pat@t.local`] },
    { id: 'm2', keys: ['', `${TAG}+PAT@t.local`] }, // a second membership on the same email
    { id: 'm3', keys: ['', 'nobody@t.local'] },
  ];
  const withMoney = await memberRoundStats(c.id, members, '2031-01-01', true);
  const m1 = withMoney.byMember.get('m1')!;
  check('a booking matched by account and email counts once; email matching ignores case', m1.roundsThisYear === 2, m1);
  check('last round is the latest checked-in round, any year', m1.lastRound === '2031-04-01', m1);
  check('spend is the course share — green, cart, range; no shop, no booking fee', m1.spendThisYearCents === 2 * 7500, m1);
  check('cancelled bookings and other courses are never counted', m1.roundsThisYear === 2 && withMoney.byMember.get('m3')!.roundsThisYear === 0);
  check('a second membership on the same email sees the same rounds…', withMoney.byMember.get('m2')!.roundsThisYear === 2);
  check('…but the members\' total counts each round once', withMoney.roundsThisYear === 2, withMoney.roundsThisYear);
  const noMoney = await memberRoundStats(c.id, members, '2031-01-01', false);
  check('without payments, no spend comes back', [...noMoney.byMember.values()].every(s => s.spendThisYearCents === null) && noMoney.byMember.get('m1')!.roundsThisYear === 2);
  const none = await memberRoundStats(c.id, [], '2031-01-01', true);
  check('no members: no query, nothing counted', none.roundsThisYear === 0 && none.byMember.size === 0);

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

// DASH-C Home — src/lib/operator-home.ts against a database: players by hour
// today vs the same weekday last week, the fill, groups past their time, a
// declined card, the next tee times, and what a login without payments sees.
// Needs a database. Run: npx tsx scripts/operator-home-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { operatorHome } from '../src/lib/operator-home';

const TAG = 'ophomedbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// 2031-05-14 is a Wednesday; noon UTC = 12:00 at a UTC course.
const NOW = new Date('2031-05-14T12:00:00Z');
const TODAY = '2031-05-14', LAST_WEEK = '2031-05-07';

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  const op = await prisma.courseOperator.create({ data: { name: 'Home Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: 'Home Test Course', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
  } });
  const tt = (date: string, time: string, status = 'available') => prisma.teeTime.create({ data: { courseId: course.id, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status } });
  const book = (teeTimeId: string, players: number, extra: Record<string, unknown> = {}) => prisma.booking.create({ data: {
    teeTimeId, courseId: course.id, golferName: `G${players}`, golferEmail: `${TAG}@test.local`, players,
    greenFeeTotal: 5000 * players, cartFeeTotal: 0, accessFeeTotal: 150 * players, totalAmount: 5150 * players, status: 'confirmed', paymentStatus: 'card_on_file', ...extra,
  } });

  const t08 = await tt(TODAY, '08:00'), t11 = await tt(TODAY, '11:00'), t13 = await tt(TODAY, '13:00'), t14 = await tt(TODAY, '14:00');
  await tt(TODAY, '15:00', 'blocked');
  await book(t08.id, 2, { status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_x', paidAt: new Date('2031-05-14T08:30:00Z'), checkedInAt: new Date('2031-05-14T08:00:00Z') });
  await book(t11.id, 3); // 11:00, never checked in: past the 30-minute grace at noon
  await book(t13.id, 1, { checkInFailReason: 'card_declined' });
  await book(t14.id, 4, { status: 'cancelled' });
  // A declined card on a group past its time, with shop items on the round.
  const t1030 = await tt(TODAY, '10:30');
  await book(t1030.id, 2, { checkInFailReason: 'card_declined', shopTotalCents: 2000, shopTaxCents: 160 });
  const lw = await tt(LAST_WEEK, '08:00');
  await book(lw.id, 4);

  const owner = await operatorHome(course.id, { money: true, messages: true }, NOW);
  check('players today count live bookings only (cancelled left out)', owner.players.today === 8, owner.players);
  check('…against the same weekday last week', owner.players.lastWeek === 4, owner.players);
  check('players land in their tee-time hour', owner.hours[10].today === 2 && owner.hours[8].today === 2 && owner.hours[11].today === 3 && owner.hours[13].today === 1 && owner.hours[14].today === 0 && owner.hours[8].lastWeek === 4);
  check('fill counts spots in times that are not blocked', owner.fillPct.today === Math.round((8 / 20) * 100), owner.fillPct);
  check('a group past its tee time plus the grace, not checked in, needs you', owner.late.length === 1 && owner.late[0].time === '11:00', owner.late);
  const shopDecline = owner.declined.find(d => d.time === '10:30');
  check('declined cards need you, each with what the retry will charge (round + shop items)', owner.declined.length === 2 && owner.declinedTotal === 2 && shopDecline?.amountCents === 10300 + 2000 + 160, owner.declined);
  check('a declined group past its time is not listed again as late', !owner.late.some(l => l.time === '10:30'));
  check('coming up starts at the course clock and skips blocked times', owner.comingUp.map(s => s.time).join(',') === '13:00,14:00', owner.comingUp.map(s => s.time));
  check('money uses the Analytics definitions (paid today, counted in groups)', !!owner.money && owner.money.paidCents === 10000 && owner.money.paidGroups === 1, owner.money);

  const staff = await operatorHome(course.id, { money: false, messages: false }, NOW);
  check('a login without payments gets no money', staff.money === null);
  check('…and sees who declined, not how much', staff.declined.length === 2 && staff.declined.every(d => d.amountCents === null));
  check('…and no unread count without messages', staff.unreadMessages === 0);

  const route = readFileSync('src/app/api/operator/home/route.ts', 'utf8');
  check('the route gates money and messages per permission', /money: can\(session, 'money\.payments'\)/.test(route) && /messages: can\(session, 'messages\.use'\)/.test(route) && /requirePermission\(session, 'sheet\.view'\)/.test(route));
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });

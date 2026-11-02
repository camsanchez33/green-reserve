// DASH-C Home — src/lib/operator-home.ts against a database: players by hour
// today vs the same weekday last week, the fill, groups past their time, a
// declined card, the next tee times, and what a login without payments sees.
// Needs a database. Run: npx tsx scripts/operator-home-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { operatorHome, declinedCards } from '../src/lib/operator-home';

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
  await book(t1030.id, 2, { checkInFailReason: 'card_declined', shopTotalCents: 2000, shopTaxCents: 160, golferPhone: '(555) 123-4567', checkInToken: `${TAG}-tok` });
  // A walk-in's placeholder email can't be sent a link, nor can a booking with no token.
  const t1045 = await tt(TODAY, '10:45');
  await book(t1045.id, 1, { checkInFailReason: 'card_declined', golferEmail: `walkin${TAG}@noemail.greenreserve.app`, checkInToken: `${TAG}-tok2` });
  // Declined, then paid at the counter: the counter clears the reason, so it is not listed.
  const t0930 = await tt(TODAY, '09:30');
  await book(t0930.id, 1, { status: 'completed', paymentStatus: 'paid_offline', checkedInAt: new Date('2031-05-14T09:30:00Z'), checkInFailReason: '' });
  const lw = await tt(LAST_WEEK, '08:00');
  await book(lw.id, 4);

  const owner = await operatorHome(course.id, { money: true, messages: true }, NOW);
  check('players today count live bookings only (cancelled left out)', owner.players.today === 10, owner.players);
  check('…against the same weekday last week', owner.players.lastWeek === 4, owner.players);
  check('players land in their tee-time hour', owner.hours[10].today === 3 && owner.hours[9].today === 1 && owner.hours[8].today === 2 && owner.hours[11].today === 3 && owner.hours[13].today === 1 && owner.hours[14].today === 0 && owner.hours[8].lastWeek === 4);
  check('fill counts spots in times that are not blocked', owner.fillPct.today === Math.round((10 / 28) * 100), owner.fillPct);
  check('a group past its tee time plus the grace, not checked in, needs you', owner.late.length === 1 && owner.late[0].time === '11:00', owner.late);
  const shopDecline = owner.declined.find(d => d.time === '10:30');
  check('declined cards need you, each with what the retry will charge (round + shop items)', owner.declined.length === 3 && owner.declinedTotal === 3 && shopDecline?.amountCents === 10300 + 2000 + 160, owner.declined);
  check('a declined group past its time is not listed again as late', !owner.late.some(l => l.time === '10:30'));
  check('coming up starts at the course clock and skips blocked times', owner.comingUp.map(s => s.time).join(',') === '13:00,14:00', owner.comingUp.map(s => s.time));
  // Home audit: each time (and a single late group) carries its tee time's id, so Home opens that time's card.
  check('coming-up times and late groups carry the tee time id the card opens by', owner.comingUp.every(s => typeof s.id === 'string' && s.id.length > 8) && owner.late.every(l => typeof l.teeTimeId === 'string' && l.teeTimeId.length > 8));
  check('money uses the Analytics definitions (paid today by card or at the counter, counted in groups)', !!owner.money && owner.money.paidCents === 15000 && owner.money.paidGroups === 2, owner.money);

  // DENSE-3 (Cam 2026-10-28): trend lines, the 14-day pace, and Not paid yet as on the tee sheet strip.
  check('trend: the same weekday for seven weeks, then today', owner.trend.dates.length === 8 && owner.trend.dates[7] === TODAY && owner.trend.dates[6] === LAST_WEEK, owner.trend.dates);
  check('…players and fill per week, today last', owner.trend.players[6] === 4 && owner.trend.players[7] === 10 && owner.trend.fillPct[7] === owner.fillPct.today, owner.trend);
  check('…paid per week from computeAnalytics, today last', owner.trend.paidCents?.[7] === 15000 && owner.trend.paidCents.slice(0, 7).every(c => c === 0), owner.trend.paidCents);
  check('pace: 14 days from today, today\'s live players against spots offered', owner.pace.length === 14 && owner.pace[0].date === TODAY && owner.pace[0].booked === 10 && owner.pace[0].offered === 28, owner.pace[0]);
  check('not paid yet counts every unpaid group today, past their time and still to play', !!owner.money && owner.money.lateGroups > 0 && owner.money.outstandingGroups > owner.money.lateGroups, owner.money);
  const staff = await operatorHome(course.id, { money: false, messages: false }, NOW);
  check('a login without payments gets no money', staff.money === null && staff.trend.paidCents === null);
  check('…but still sees players, fill and the pace', staff.trend.players[7] === 10 && staff.pace.length === 14);
  check('…and sees who declined, not how much', staff.declined.length === 3 && staff.declined.every(d => d.amountCents === null));
  check('…and no unread count without messages', staff.unreadMessages === 0);

  // Money → Needs you reads the same list, with which pay link each one can take.
  const money = await declinedCards(course.id, true);
  const byTime = Object.fromEntries(money.rows.map(r => [r.time, r]));
  check('Money and Home list the same declined cards', money.total === owner.declinedTotal && money.rows.map(r => r.id).join() === owner.declined.map(d => d.id).join());
  check('a mobile number means it can be texted; a real email with a token means it can be emailed', byTime['10:30']?.canText === true && byTime['10:30']?.canEmail === true, byTime['10:30']);
  check('no token: no email link; no phone: no text', byTime['13:00']?.canEmail === false && byTime['13:00']?.canText === false, byTime['13:00']);
  check('a walk-in placeholder email is never offered', byTime['10:45']?.canEmail === false, byTime['10:45']);
  check('the flags are booleans — no phone or email leaves the server', money.rows.every(r => !('golferPhone' in r) && !('golferEmail' in r)));
  const overview = readFileSync('src/app/api/operator/money/overview/route.ts', 'utf8');
  check('Money\'s overview is gated by payments and uses the shared list', /requirePermission\(session, 'money\.payments'\)/.test(overview) && /declinedCards\(session\.courseId, true, 50\)/.test(overview));
  const page = readFileSync('src/app/dashboard/money/page.tsx', 'utf8');
  check('Money\'s pay-link buttons need the tee sheet\'s check-in permission, like the route', /access\.can\('sheet\.checkin'\)/.test(page) && /action: 'send_pay_link'/.test(readFileSync('src/components/dashboard/DeclinedCardList.tsx', 'utf8')));

  const route = readFileSync('src/app/api/operator/home/route.ts', 'utf8');
  check('the route gates money and messages per permission', /money: can\(session, 'money\.payments'\)/.test(route) && /messages: can\(session, 'messages\.use'\)/.test(route) && /requirePermission\(session, 'sheet\.view'\)/.test(route));
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });

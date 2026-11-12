// DASH-D Home (Cam 2026-11-01): the shift note, course conditions, week ahead and month goal.
//  1. shift notes: open notes newest first; clearing sets doneAt (never deletes); another course's note id changes nothing;
//  2. conditions: only known keys/values are kept;
//  3. week ahead: 7 days from today, per hour, players booked of spots offered; blocked times offer nothing;
//  4. goals (HOME-2): each metric's actual is computeAnalytics' own figure; money goals only with money; a removed goal is gone (the row stays);
//     an old CourseMonthGoal still shows as the collected goal; custom condition lines are cleaned;
//  5. the routes check permissions: notes = sheet.view, conditions = sheet.course_alert, goals = settings.edit (+ money.payments for money);
//  6. the tables are in the launch wipe, shift notes in the test-course reset, goals kept.
// Needs a database. Run: npx tsx scripts/home-board-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { openShiftNotes, weekAhead, monthGoals, courseConditions } from '../src/lib/home-board';
import { cleanConditions } from '../src/lib/course-conditions';
import { computeAnalytics } from '../src/lib/analytics';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'homeboardtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shiftNote.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMonthGoal.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseGoal.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Board Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `${TAG} ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  const [a, b] = [await mk('a'), await mk('b')];

  // 1. notes
  const n1 = await prisma.shiftNote.create({ data: { courseId: a.id, body: 'first', authorName: 'Sam', createdAt: new Date(Date.now() - 60000) } });
  await prisma.shiftNote.create({ data: { courseId: a.id, body: 'second', authorName: 'Ana' } });
  await prisma.shiftNote.create({ data: { courseId: a.id, body: 'old', createdAt: new Date(Date.now() - 4 * 86400000) } });
  await prisma.shiftNote.create({ data: { courseId: b.id, body: 'other course' } });
  const open = await openShiftNotes(a.id);
  ok('open notes: this course only, newest first, last 3 days', open.map(n => n.body).join(',') === 'second,first', open);
  const cross = await prisma.shiftNote.updateMany({ where: { id: n1.id, courseId: b.id, doneAt: null }, data: { doneAt: new Date() } });
  ok('another course clearing this note changes nothing (the route\'s where)', cross.count === 0);
  await prisma.shiftNote.updateMany({ where: { id: n1.id, courseId: a.id, doneAt: null }, data: { doneAt: new Date(), doneBy: 'Ana' } });
  ok('a cleared note leaves the board but is kept', (await openShiftNotes(a.id)).length === 1 && !!(await prisma.shiftNote.findUnique({ where: { id: n1.id } }))?.doneAt);
  const route = read('src/app/api/operator/shift-notes/route.ts');
  ok('the route clears by course and never deletes', route.includes('where: { id: body.id, courseId: session.courseId, doneAt: null }') && !route.includes('.delete'));

  // 2. conditions
  ok('only known conditions survive', JSON.stringify(cleanConditions({ carts: 'path', range: 'lava', pins: 'middle', x: 'y' })) === JSON.stringify({ carts: 'path', pins: 'middle' }));
  await prisma.course.update({ where: { id: a.id }, data: { conditionsDetail: { carts: 'walking', junk: 1 }, conditionsDetailAt: new Date(), conditions: 'Cart path only' } });
  const cond = await courseConditions(a.id);
  ok('conditions read back cleaned, with the alert golfers see', cond.detail.carts === 'walking' && !('junk' in cond.detail) && cond.alert === 'Cart path only' && !!cond.updatedAt);

  // 3. week ahead
  const today = todayIn('UTC');
  const tt = (date: string, time: string, avail: number, status = 'available') => prisma.teeTime.create({ data: { courseId: a.id, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: avail, playersBooked: 0, status } });
  const t8 = await tt(today, '08:00', 4); await tt(today, '08:10', 4); await tt(addDaysStr(today, 2), '14:00', 4); await tt(addDaysStr(today, 2), '14:10', 4, 'blocked'); await tt(addDaysStr(today, 9), '09:00', 4);
  // Review 2026-11-02: real bookings, so booked and collected aren't trivially 0. A paid, checked-in round of 3
  // counts; a cancelled group of 2 at the same time doesn't.
  const bk = (o: Record<string, unknown>) => prisma.booking.create({ data: { teeTimeId: t8.id, courseId: a.id, golferName: 'G', golferEmail: `${TAG}@test.local`, greenFeeTotal: 13500, cartFeeTotal: 0, accessFeeTotal: 450, totalAmount: 13950, ...o } as never });
  await bk({ players: 3, status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_hb1', paidAt: new Date(), checkedInAt: new Date() });
  await bk({ players: 2, status: 'cancelled', paymentStatus: 'card_on_file' });
  const wk = await weekAhead(a.id, 'UTC');
  ok('booked counts live groups only (a cancelled group doesn\'t)', wk.days[0].cells[0].booked === 3, wk.days[0].cells[0]);
  ok('7 days from today, hours that have tee times (blocked and later days left out)', wk.days.length === 7 && wk.days[0].date === today && JSON.stringify(wk.hours) === '[8,14]', wk.hours);
  ok('spots offered per hour (blocked offers nothing)', wk.days[0].cells[0].offered === 8 && wk.days[2].cells[1].offered === 4 && wk.days[1].cells[0].offered === 0);

  // 4. goals (HOME-2)
  const month = today.slice(0, 7);
  const none = await monthGoals(a.id, 'UTC', { money: true });
  ok('no goals set: none listed, every metric can be added', none.goals.length === 0 && none.metrics.length === 5);
  ok('…a login without money can\'t add a money goal', !(await monthGoals(a.id, 'UTC', { money: false })).metrics.includes('collected'));
  await prisma.courseMonthGoal.create({ data: { courseId: a.id, month, cents: 3_000_000 } });
  // GOAL-PACE: monthGoals sends the month's elapsed days at the course clock (noon ET on Nov 12 → 11.5).
  ok('monthGoals sends elapsed days counted by the hour, in the course timezone', (await monthGoals(a.id, 'America/New_York', { money: true }, new Date('2026-11-12T17:00:00Z'))).elapsed === 11.5);
  ok('an old month goal still shows as the collected goal', (await monthGoals(a.id, 'UTC', { money: true })).goals.find(g => g.metric === 'collected')?.target === 3_000_000);
  await prisma.courseGoal.createMany({ data: [{ courseId: a.id, month, metric: 'collected', target: 4_000_000 }, { courseId: a.id, month, metric: 'rounds', target: 500 }, { courseId: a.id, month, metric: 'booked', target: 800 }] });
  const g = await monthGoals(a.id, 'UTC', { money: true });
  const mtd = await computeAnalytics(a.id, { from: `${month}-01`, to: today });
  const col = g.goals.find(x => x.metric === 'collected'), rnd = g.goals.find(x => x.metric === 'rounds'), bkd = g.goals.find(x => x.metric === 'booked');
  ok('a new collected goal wins over the old one', col?.target === 4_000_000, col);
  ok('collected is computeAnalytics\' figure for the month to date — and not 0', col?.actual === mtd.revenue.collectedCents && (col?.actual ?? 0) > 0, col);
  ok('rounds played is Analytics\' rounds played', rnd?.actual === mtd.revenue.roundsPlayed && (rnd?.actual ?? 0) === 3, rnd);
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  ok('players booked reads the whole month, tee times ahead included', bkd?.actual === (await computeAnalytics(a.id, { from: `${month}-01`, to: monthEnd })).behavior.players && (bkd?.actual ?? 0) >= 3, bkd);
  ok('a login without money never sees the money goal', !(await monthGoals(a.id, 'UTC', { money: false })).goals.some(x => x.metric === 'collected'));
  await prisma.courseGoal.update({ where: { courseId_month_metric: { courseId: a.id, month, metric: 'collected' } }, data: { target: null } });
  const after = await monthGoals(a.id, 'UTC', { money: true });
  ok('a removed goal is gone — the old month goal doesn\'t come back — and the row stays', !after.goals.some(x => x.metric === 'collected') && (await prisma.courseGoal.count({ where: { courseId: a.id } })) === 3);
  ok('the goal route never deletes', !read('src/app/api/operator/goals/route.ts').includes('.delete'));
  const lines = cleanConditions({ carts: 'path', lines: ['  Greens rolling   10 ', 'greens rolling 10', '', 7, 'x'.repeat(200), 'a', 'b', 'c', 'd', 'e'] }).lines ?? [];
  ok('own condition lines: trimmed, no repeats, short, at most six', lines[0] === 'Greens rolling 10' && lines.length === 6 && lines[1].length === 80 && !lines.includes(''), lines);

  // 5. permissions
  ok('notes: sheet.view on GET, POST and PATCH', (route.match(/requirePermission\(session, 'sheet\.view'\)/g) || []).length === 3);
  ok('conditions: still sheet.course_alert', read('src/app/api/operator/conditions/route.ts').includes("requirePermission(session, 'sheet.course_alert')"));
  const goalRoute = read('src/app/api/operator/goals/route.ts');
  ok('goals: settings.edit, and money.payments for a money goal', goalRoute.includes("requirePermission(session, 'settings.edit')") && goalRoute.includes("if (m.money) { const denied = requirePermission(session, 'money.payments')"));
  ok('Home sends money goals only to logins that see money', read('src/app/api/operator/home/route.ts').includes('monthGoals(session.courseId, tz, { money })'));

  // 6. reset
  const reset = read('src/lib/data-reset.ts');
  ok('both tables in the launch wipe; notes reset with a test course, goals kept', (WIPED_TABLES as readonly string[]).includes('ShiftNote') && (WIPED_TABLES as readonly string[]).includes('CourseMonthGoal') && (WIPED_TABLES as readonly string[]).includes('CourseGoal') && reset.includes('prisma.shiftNote.deleteMany({ where: { courseId } })') && !reset.includes('prisma.courseMonthGoal.deleteMany') && !reset.includes('prisma.courseGoal.deleteMany'));

  await cleanup();
}

main().catch(e => { console.error(e); failed++; }).finally(async () => {
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
});

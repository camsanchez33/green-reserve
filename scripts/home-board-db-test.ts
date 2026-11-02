// DASH-D Home (Cam 2026-11-01): the shift note, course conditions, week ahead and month goal.
//  1. shift notes: open notes newest first; clearing sets doneAt (never deletes); another course's note id changes nothing;
//  2. conditions: only known keys/values are kept;
//  3. week ahead: 7 days from today, per hour, players booked of spots offered; blocked times offer nothing;
//  4. month goal: collected is computeAnalytics' figure; needed a day = what's left / days left; a cleared goal is null;
//  5. the routes check permissions: notes = sheet.view, conditions = sheet.course_alert, goal = settings.edit + money.payments;
//  6. the tables are in the launch wipe, shift notes in the test-course reset, goals kept.
// Needs a database. Run: npx tsx scripts/home-board-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { openShiftNotes, weekAhead, monthGoal, courseConditions } from '../src/lib/home-board';
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

  // 4. goal
  const none = await monthGoal(a.id, 'UTC');
  ok('no goal set: goalCents and needed are null', none.goalCents === null && none.neededPerDayCents === null);
  await prisma.courseMonthGoal.create({ data: { courseId: a.id, month: today.slice(0, 7), cents: 3_000_000 } });
  const g = await monthGoal(a.id, 'UTC');
  const mtd = await computeAnalytics(a.id, { from: `${today.slice(0, 7)}-01`, to: today });
  ok('collected is computeAnalytics\' figure for the month to date — and not 0', g.collectedCents === mtd.revenue.collectedCents && g.collectedCents > 0, g.collectedCents);
  ok('needed a day = what\'s left over the days left (today included)', g.neededPerDayCents === Math.ceil((3_000_000 - g.collectedCents) / g.daysLeft) && g.daysLeft >= 1);
  await prisma.courseMonthGoal.update({ where: { courseId_month: { courseId: a.id, month: today.slice(0, 7) } }, data: { cents: null } });
  ok('a cleared goal reads as no goal (the row stays)', (await monthGoal(a.id, 'UTC')).goalCents === null && (await prisma.courseMonthGoal.count({ where: { courseId: a.id } })) === 1);
  ok('the goal route never deletes', !read('src/app/api/operator/month-goal/route.ts').includes('.delete'));

  // 5. permissions
  ok('notes: sheet.view on GET, POST and PATCH', (route.match(/requirePermission\(session, 'sheet\.view'\)/g) || []).length === 3);
  ok('conditions: still sheet.course_alert', read('src/app/api/operator/conditions/route.ts').includes("requirePermission(session, 'sheet.course_alert')"));
  const goalRoute = read('src/app/api/operator/month-goal/route.ts');
  ok('goal: settings.edit and money.payments', goalRoute.includes("requirePermission(session, 'settings.edit')") && goalRoute.includes("requirePermission(session, 'money.payments')"));
  ok('Home sends the goal only to logins that see money', read('src/app/api/operator/home/route.ts').includes('money ? monthGoal(session.courseId, tz) : Promise.resolve(null)'));

  // 6. reset
  const reset = read('src/lib/data-reset.ts');
  ok('both tables in the launch wipe; notes reset with a test course, goals kept', (WIPED_TABLES as readonly string[]).includes('ShiftNote') && (WIPED_TABLES as readonly string[]).includes('CourseMonthGoal') && reset.includes('prisma.shiftNote.deleteMany({ where: { courseId } })') && !reset.includes('prisma.courseMonthGoal.deleteMany'));

  await cleanup();
}

main().catch(e => { console.error(e); failed++; }).finally(async () => {
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
});

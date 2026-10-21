// AW-4b: the admin Today page's Courses list and Admin → Goals against seeded
// data — "Staff seen" amber only while the course had tee times, fees this
// month per course, each course's own to-dos, and goal progress/pace. Uses a
// fixed "now" in 2031 so the rest of the database can't move the sums.
// Needs a database. Run: npx tsx scripts/admin-today-courses-test.ts
import { PrismaClient } from '@prisma/client';
import { todayCourses, staffSeenSignal, STAFF_QUIET_DAYS } from '../src/lib/admin-today';
import { goalPace, goalCurrent } from '../src/lib/admin-goals';
import type { ActionRow } from '../src/lib/admin-action-queue';
import { touchStaffSeen } from '../src/lib/session';

const prisma = new PrismaClient();
const TAG = 'admintodaycourses';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };
const DAY = 86_400_000;

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  // Pure rules first.
  const now = new Date('2031-07-15T19:00:00Z');
  check('quiet: 4 days unseen while open', staffSeenSignal(new Date(now.getTime() - 4 * DAY), true, now).quiet);
  check('not quiet: 4 days unseen while closed (no tee times)', !staffSeenSignal(new Date(now.getTime() - 4 * DAY), false, now).quiet);
  check('not quiet: seen yesterday', !staffSeenSignal(new Date(now.getTime() - DAY), true, now).quiet);
  check(`quiet: exactly ${STAFF_QUIET_DAYS} days`, staffSeenSignal(new Date(now.getTime() - STAFF_QUIET_DAYS * DAY), true, now).quiet);
  check('quiet: never seen while open', staffSeenSignal(null, true, now).quiet);

  const start = new Date('2031-01-01T00:00:00Z'), due = new Date('2032-01-01T00:00:00Z');
  check('pace: 6 of 10 a little past halfway is on pace', goalPace(6, 10, start, due, now).status === 'on_pace');
  check('pace: 2 of 10 past halfway is behind', goalPace(2, 10, start, due, now).status === 'behind');
  check('pace: target reached', goalPace(10, 10, start, due, now).status === 'met');
  check('pace: past due and short is missed', goalPace(3, 10, new Date('2030-01-01'), new Date('2031-01-01'), now).status === 'missed');
  check('pace: days left counted', goalPace(0, 1, start, due, now).daysLeft === 170, `${goalPace(0, 1, start, due, now).daysLeft}`);

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Courses Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string, active = true) => prisma.course.create({ data: {
    name: `${TAG} ${n}`, slug: `${TAG}-${n.toLowerCase()}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: active ? 'live' : 'draft', active, timezone: 'UTC', cancellationHours: 24,
    staffLastSeenAt: new Date(now.getTime() - 5 * DAY),
  } });
  const open = await mk('Open'), closed = await mk('Closed'), draft = await mk('Draft', false), seen = await mk('Seen');
  await prisma.course.update({ where: { id: seen.id }, data: { staffLastSeenAt: new Date(now.getTime() - 3_600_000) } });
  const tee = (courseId: string, date: string, status = 'available') => prisma.teeTime.create({ data: { courseId, date, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status } });
  const tt = await tee(open.id, '2031-07-14');
  await tee(closed.id, '2031-07-14', 'blocked');       // closed: every time blocked
  await tee(closed.id, '2031-07-01');                  // an open time, but weeks ago
  await tee(seen.id, '2031-07-15');
  const booking = (courseId: string, teeTimeId: string, paidAt: Date, fee: number, source = 'online') => prisma.booking.create({ data: {
    teeTimeId, courseId, golferName: 'T', golferEmail: `${TAG}@test.local`, players: 2, source,
    greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: fee, totalAmount: 5000 + fee, createdAt: paidAt,
    status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_test', paidAt,
  } });
  await booking(open.id, tt.id, new Date('2031-07-10T15:00:00Z'), 300);      // this month
  await booking(open.id, tt.id, new Date('2031-06-28T15:00:00Z'), 150);      // last month: not counted
  await booking(open.id, tt.id, new Date('2031-07-12T15:00:00Z'), 0, 'walk_in');

  const rows: ActionRow[] = [
    { id: `fc-${open.id}`, courseId: open.id, who: 'x', why: '1 failed charge', doThis: '', ageDays: 1, actionLabel: 'Review', href: '/admin/revenue', severity: 'bad' },
    { id: 'inq-1', who: 'An inquiry', why: 'New', doThis: '', ageDays: 0, actionLabel: 'Open', href: '/admin/inquiries', severity: 'warn' },
  ];
  const list = (await todayCourses(now, rows)).filter(c => c.name.startsWith(TAG));
  const by = (id: string) => list.find(c => c.id === id)!;
  check('open course unseen 5 days with tee times is amber', by(open.id).staffQuiet);
  check('closed course (only blocked or old times) stays quiet', !by(closed.id).staffQuiet);
  check('draft never amber', !by(draft.id).staffQuiet && by(draft.id).live === false);
  check('seen an hour ago is not amber', !by(seen.id).staffQuiet);
  check('fees this month: only this month', Math.abs(by(open.id).feesThisMonth - 3) < 0.001, `${by(open.id).feesThisMonth}`);
  check('a course row lands on its course', by(open.id).rows.length === 1 && by(open.id).rows[0].id === `fc-${open.id}`);
  check('an inquiry row lands on no course', list.every(c => c.rows.every(r => r.id !== 'inq-1')));
  check('a course with a red to-do sorts first', list[0].id === open.id, list.map(c => c.name).join(', '));

  // Fallback: no staffLastSeenAt yet, but the owner signed in yesterday → not amber.
  const op2 = await prisma.courseOperator.create({ data: { name: 'Fallback', email: `${TAG}-2@test.local`, password: 'x', lastLoginAt: new Date(now.getTime() - DAY) } });
  const fb = await prisma.course.create({ data: { name: `${TAG} Fallback`, slug: `${TAG}-fallback`, operatorId: op2.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  await tee(fb.id, '2031-07-15');
  const fbRow = (await todayCourses(now, [])).find(c => c.id === fb.id)!;
  check('no staff record yet: the owner\'s last sign-in counts', !fbRow.staffQuiet && fbRow.staffSeenAt === op2.lastLoginAt!.toISOString());

  // The write: sets once, then nothing for 15 minutes, and never touches updatedAt.
  const before = (await prisma.course.findUnique({ where: { id: fb.id }, select: { updatedAt: true } }))!.updatedAt;
  const t0 = new Date();
  await touchStaffSeen(fb.id, t0);
  const a1 = await prisma.course.findUnique({ where: { id: fb.id }, select: { staffLastSeenAt: true, updatedAt: true } });
  check('touch: sets staffLastSeenAt', a1?.staffLastSeenAt?.getTime() === t0.getTime());
  check('touch: leaves updatedAt alone', a1?.updatedAt.getTime() === before.getTime());
  await touchStaffSeen(fb.id, new Date(t0.getTime() + 10 * 60_000));
  const a2 = await prisma.course.findUnique({ where: { id: fb.id }, select: { staffLastSeenAt: true } });
  check('touch: no write inside 15 minutes', a2?.staffLastSeenAt?.getTime() === t0.getTime());
  await touchStaffSeen(fb.id, new Date(t0.getTime() + 16 * 60_000));
  const a3 = await prisma.course.findUnique({ where: { id: fb.id }, select: { staffLastSeenAt: true } });
  check('touch: writes again after 15 minutes', a3?.staffLastSeenAt?.getTime() === t0.getTime() + 16 * 60_000);

  const from = new Date('2031-07-01T00:00:00Z');
  const online = await goalCurrent('online_rounds', from, due, now);
  check('goal: online bookings counted (walk-ins are not)', online >= 1, `${online}`);
  const onlineBase = await goalCurrent('online_rounds', from, from, now);
  check('goal: nothing counted before it starts', onlineBase === 0);
  const fees = await goalCurrent('fees', from, due, now);
  check('goal: fees in cents from the start', fees >= 300, `${fees}`);

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

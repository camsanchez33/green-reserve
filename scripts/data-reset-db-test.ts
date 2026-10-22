// TEST-1 — the launch wipe and resetting a test course, against a database.
// Every schema model is named in exactly one of WIPED_TABLES / KEPT_TABLES; a
// test course's activity is cleared while its setup and every other course
// are untouched; a course not marked as a test is refused; the launch wipe
// closes on Nov 1 and, run inside a transaction that is then rolled back,
// empties every wiped table and leaves the kept ones alone.
// Needs a database. Run: npx tsx scripts/data-reset-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { WIPED_TABLES, KEPT_TABLES, WIPE_ALL_UNTIL, wipeAll, wipeAllOpen, resetTestCourse, previewCourseReset } from '../src/lib/data-reset';

const TAG = 'resetdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function seedCourse(n: string, isTest: boolean) {
  const op = await prisma.courseOperator.create({ data: { name: `Op ${n}`, email: `${TAG}-${n}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: `Reset ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, isTest,
  } });
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-10', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  const blocked = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-10', time: '08:10', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'blocked' } });
  const booking = await prisma.booking.create({ data: {
    teeTimeId: tt.id, courseId: course.id, golferName: 'T', golferEmail: `${TAG}-${n}@test.local`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_test',
  } });
  await prisma.paymentEvent.create({ data: { bookingId: booking.id, kind: 'charge', amountCents: 10300, detail: 'test' } });
  const tier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Full' } });
  await prisma.courseMembership.create({ data: { courseId: course.id, tierId: tier.id, inviteEmail: `${TAG}-${n}-m@test.local`, inviteName: 'M' } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'R' } });
  const item = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Balls', priceCents: 500 } });
  await prisma.shopSale.create({ data: { courseId: course.id, totalCents: 500, status: 'paid_cash' } });
  await prisma.courseEvent.create({ data: { courseId: course.id, name: 'Outing', date: '2030-06-11', startTime: '08:00', holdFrom: '08:00', holdTo: '09:00' } });
  return { course, tt, blocked, tier, item };
}

async function main() {
  // Every model is decided.
  const models = [...readFileSync('prisma/schema.prisma', 'utf8').matchAll(/^model (\w+) \{/gm)].map(m => m[1]);
  const wiped = new Set<string>(WIPED_TABLES), kept = new Set<string>(KEPT_TABLES);
  const undecided = models.filter(m => !wiped.has(m) && !kept.has(m));
  const both = models.filter(m => wiped.has(m) && kept.has(m));
  const unknown = [...wiped, ...kept].filter(t => !models.includes(t));
  check('every table is either wiped or kept by the launch wipe (add a new model to one list in src/lib/data-reset.ts)', undecided.length === 0, undecided);
  check('no table is in both lists', both.length === 0, both);
  check('the lists name only real tables', unknown.length === 0, unknown);
  check('the company side is kept', ['AdminUser', 'OwnerSession', 'AdminAuditLog', 'Expense', 'AdminGoal', 'AgreementVersion'].every(t => kept.has(t)));

  // The launch wipe closes on Nov 1.
  check('the launch wipe is open before Nov 1', wipeAllOpen(new Date('2026-10-31T23:00:00Z')));
  check('the launch wipe is closed from midnight Nov 1 Eastern', !wipeAllOpen(WIPE_ALL_UNTIL) && !wipeAllOpen(new Date('2027-01-01T00:00:00Z')));
  const t = await seedCourse('test', true);
  const r = await seedCourse('real', false);

  const late = await wipeAll(new Date('2026-11-02T00:00:00Z'));
  check('a late launch wipe is refused and clears nothing', !late.ok && (await prisma.course.count({ where: { slug: { startsWith: TAG } } })) === 2);

  // A course that isn't marked as a test is refused.
  const refused = await resetTestCourse(r.course.id);
  check('a course not marked as a test cannot be reset', !refused.ok && refused.status === 400);
  check('…and nothing of it is touched', (await prisma.booking.count({ where: { courseId: r.course.id } })) === 1);

  const pre = await previewCourseReset(t.course.id);
  check('the preview counts the test course activity', !!pre && pre.activity.bookings === 1 && pre.activity.members === 1 && pre.activity.shopSales === 1 && pre.activity.events === 1, pre?.activity);

  const res = await resetTestCourse(t.course.id);
  check('a test course resets', res.ok);
  const c = t.course.id;
  check('its bookings and their payment records are gone',
    (await prisma.booking.count({ where: { courseId: c } })) === 0 && (await prisma.paymentEvent.count({ where: { booking: { courseId: c } } })) === 0);
  check('its members, residents, shop sales and events are gone',
    (await prisma.courseMembership.count({ where: { courseId: c } })) === 0 && (await prisma.courseResident.count({ where: { courseId: c } })) === 0
    && (await prisma.shopSale.count({ where: { courseId: c } })) === 0 && (await prisma.courseEvent.count({ where: { courseId: c } })) === 0);
  const tt = await prisma.teeTime.findUnique({ where: { id: t.tt.id } });
  const bl = await prisma.teeTime.findUnique({ where: { id: t.blocked.id } });
  check('its booked tee time opens back up', tt?.playersBooked === 0 && tt?.status === 'available');
  check('a time it blocked stays blocked', bl?.status === 'blocked');
  check('its setup is kept: the course, its login, tiers and shop catalogue',
    !!(await prisma.course.findUnique({ where: { id: c } })) && !!(await prisma.membershipTier.findUnique({ where: { id: t.tier.id } })) && !!(await prisma.shopItem.findUnique({ where: { id: t.item.id } })));
  check('the other course is untouched',
    (await prisma.booking.count({ where: { courseId: r.course.id } })) === 1 && (await prisma.courseMembership.count({ where: { courseId: r.course.id } })) === 1 && (await prisma.shopSale.count({ where: { courseId: r.course.id } })) === 1);

  // The launch wipe itself, rolled back so the rest of the test run keeps its data.
  await prisma.adminGoal.create({ data: { metric: 'courses_live', target: 1, dueAt: new Date('2030-01-01T00:00:00Z'), createdBy: TAG } });
  const keptBefore = await prisma.adminGoal.count();
  const ROLLBACK = new Error('rollback');
  let inside: { wipedLeft: number; keptLeft: number; ok: boolean } | null = null;
  try {
    await prisma.$transaction(async tx => {
      const w = await wipeAll(new Date('2026-10-30T00:00:00Z'), tx);
      const left = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT (${WIPED_TABLES.map(x => `(SELECT COUNT(*) FROM "${x}")`).join(' + ')})::bigint AS n`);
      inside = { ok: w.ok, wipedLeft: Number(left[0].n), keptLeft: await tx.adminGoal.count() };
      throw ROLLBACK;
    }, { timeout: 60_000 });
  } catch (e) { if (e !== ROLLBACK) throw e; }
  const got = inside as { wipedLeft: number; keptLeft: number; ok: boolean } | null;
  check('the launch wipe empties every wiped table', !!got && got.ok && got.wipedLeft === 0, got);
  check('…and keeps the company side', !!got && got.keptLeft === keptBefore, got);
  check('(rolled back here: the test courses are still there)', (await prisma.course.count({ where: { slug: { startsWith: TAG } } })) === 2);
}

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = courses.map(x => x.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.adminGoal.deleteMany({ where: { createdBy: TAG } });
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });

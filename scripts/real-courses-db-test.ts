// TEST-2 — a course marked isTest stays out of the platform's numbers, its
// Problems and its public lists, while its own course page still counts it.
// Against a database: one real and one test course, each with a paid round, a
// failed card and a cash round. Plus a source check that every platform query
// named in src/lib/real-courses.ts still uses it.
// Needs a database. Run: npx tsx scripts/real-courses-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { paidWindow, todayHealth } from '../src/lib/admin-today';
import { counterFeesUncollected } from '../src/lib/access-fee';
import { urgentFindings } from '../src/lib/admin-checks';
import { goalCurrent } from '../src/lib/admin-goals';
import { buildActionQueue } from '../src/lib/admin-action-queue';

const TAG = 'realcoursedbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const FROM = new Date('2031-04-01T00:00:00Z');
const TO = new Date('2031-04-30T00:00:00Z');
const PAID_AT = new Date('2031-04-10T15:00:00Z');

async function seed(n: string, isTest: boolean) {
  const op = await prisma.courseOperator.create({ data: { name: `Op ${n}`, email: `${TAG}-${n}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: `${TAG} ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, isTest, stripeAccountActive: false,
  } });
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2031-04-10', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'full' } });
  const base = { teeTimeId: tt.id, courseId: course.id, golferName: 'T', golferEmail: `${TAG}-${n}@test.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300 };
  await prisma.booking.create({ data: { ...base, status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_x', paidAt: PAID_AT, source: 'online', createdAt: PAID_AT } });
  await prisma.booking.create({ data: { ...base, status: 'completed', paymentStatus: 'paid_offline', paidAt: PAID_AT } });
  await prisma.booking.create({ data: { ...base, status: 'confirmed', paymentStatus: 'card_on_file', checkInFailReason: 'card_declined' } });
  return course;
}

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  // Source check: the platform queries still use the shared filter.
  const mustUse: [string, RegExp][] = [
    ['src/lib/admin-home.ts', /ON_REAL_COURSE[\s\S]*REAL_COURSE/],
    ['src/lib/admin-today.ts', /ON_REAL_BOOKING/],
    ['src/lib/access-fee.ts', /courseId \? \{ courseId \} : ON_REAL_COURSE/],
    ['src/lib/admin-goals.ts', /REAL_COURSE/],
    ['src/lib/admin-checks.ts', /\.\.\.FAILED_CHARGE_WHERE, \.\.\.ON_REAL_COURSE/],
    ['src/lib/admin-action-queue.ts', /\.\.\.FAILED_CHARGE_WHERE, \.\.\.ON_REAL_COURSE/],
    ['src/app/api/admin/nav-badges/route.ts', /ON_REAL_COURSE/],
    ['src/app/api/admin/revenue/route.ts', /const PAID = \{[^}]*\}, \.\.\.ON_REAL_COURSE \}/],
    ['src/app/sitemap.ts', /isTest: false/],
    ['src/app/api/courses/route.ts', /isTest: false/],
    ['src/app/courses/[slug]/page.tsx', /course\.isTest \? \{ index: false/],
    ['src/lib/agreement-required.ts', /archivedAt: null, \.\.\.REAL_COURSE, agreements/],
    ['src/lib/admin-ask.ts', /\.\.\.FAILED_CHARGE_WHERE, \.\.\.ON_REAL_COURSE/],
    ['src/app/api/admin/activity/route.ts', /courseId \? \{ courseId \} : ON_REAL_COURSE/],
  ];
  for (const [f, re] of mustUse) check(`${f} leaves test courses out`, re.test(readFileSync(f, 'utf8')));
  // The menu's unread count and the Messages page's count are the same rule (both include a test course's messages).
  const unread = /senderType: 'operator', readAt: null, isBroadcast: false \}/;
  check('the menu badge and Messages count unread messages the same way',
    unread.test(readFileSync('src/app/api/admin/nav-badges/route.ts', 'utf8')) && unread.test(readFileSync('src/app/api/admin/messages/route.ts', 'utf8')));

  const before = { paid: await paidWindow(FROM, TO), counter: await counterFeesUncollected({ gte: FROM, lt: TO }) };
  const real = await seed('real', false);
  const test = await seed('test', true);

  const paid = await paidWindow(FROM, TO);
  check('platform fees count the real course only', paid.feesCents - before.paid.feesCents === 300 && paid.rounds - before.paid.rounds === 1, { paid, before: before.paid });
  const own = await paidWindow(FROM, TO, test.id);
  check('the test course\'s own page still counts its fees', own.feesCents === 300 && own.rounds === 1, own);
  const counter = await counterFeesUncollected({ gte: FROM, lt: TO });
  check('cash rounds at the test course are not "not collected"', counter.rounds - before.counter.rounds === 1 && !counter.byCourse.has(test.id) && counter.byCourse.has(real.id));
  check('…but its own page still sees them', (await counterFeesUncollected({ gte: FROM, lt: TO }, test.id)).rounds === 1);

  const findings = await urgentFindings(new Date('2031-04-15T12:00:00Z'));
  check('a failed card at the test course is not a Problem', !findings.some(f => f.courseId === test.id), findings.filter(f => f.courseId === test.id));
  check('…while the real course\'s failed card is', findings.some(f => f.courseId === real.id));
  check('the test course without Stripe is not a Problem either', !findings.some(f => f.courseId === test.id && /stripe/i.test(f.key)));

  const queue = await buildActionQueue(new Date('2031-04-15T12:00:00Z'));
  check('Needs you leaves the test course out', !queue.rows.some(r => (r as { courseId?: string }).courseId === test.id));

  const liveGoal = await goalCurrent('courses_live', FROM, TO, new Date('2031-04-15T00:00:00Z'));
  const liveCount = await prisma.course.count({ where: { active: true, archivedAt: null, isTest: false } });
  check('the live-courses goal does not count the test course', liveGoal === liveCount);
  const health = await todayHealth(new Date('2031-04-15T12:00:00Z'));
  const blockedCount = await prisma.course.count({ where: { active: true, stripeAccountActive: false, archivedAt: null, isTest: false } });
  check('Health counts live and Stripe-blocked courses without the test course', health.payments.live === liveCount && health.payments.blocked === blockedCount, health.payments);
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });

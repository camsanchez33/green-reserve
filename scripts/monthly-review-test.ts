// BI-1 (PLATFORM_ROADMAP_SPEC §1): the monthly AI review. Proves the month
// maths, the baseline rule ("after 1 month then metrics are set"), and that a
// draft carrying a number the facts don't contain never reaches the stored
// review. Needs a database, no Anthropic key: the writer is a stub.
// Run: npx tsx scripts/monthly-review-test.ts
import { PrismaClient } from '@prisma/client';
import {
  previousMonth, monthRange, isFullMonth, validateNumbers, draftProblems, runMonthlyReview,
  type Writer, type ReviewBody,
} from '../src/lib/monthly-review';

const prisma = new PrismaClient();
const TAG = 'monthlyreviewtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.monthlyReview.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

let n = 0;
async function seedCourse(firstWentLiveAt: Date) {
  const operator = await prisma.courseOperator.upsert({
    where: { email: `${TAG}@test.local` },
    create: { name: 'Review Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' },
    update: {},
  });
  const course = await prisma.course.create({
    data: {
      name: 'Review Test Course', slug: `${TAG}-${++n}`, operatorId: operator.id, address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18,
      liveStatus: 'live', active: true, timezone: 'UTC', firstWentLiveAt,
    },
  });
  // A little play in August and September.
  for (const date of ['2026-08-08', '2026-08-15', '2026-09-12']) {
    const t = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
    await prisma.booking.create({ data: {
      teeTimeId: t.id, courseId: course.id, golferName: 'Test Golfer', golferEmail: `${TAG}@test.local`,
      players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300,
      status: 'completed', paymentStatus: 'paid', checkedInAt: new Date(`${date}T09:00:00Z`),
    } });
  }
  return course.id;
}

const GOOD: ReviewBody = { verdict: 'A quiet month to start from.', wentWell: ['Every group that booked showed up.'], fellShort: ['Most tee times went unsold.'], recommendations: ['Send a reminder to past golfers before the weekend.'] };
const INVENTED: ReviewBody = { ...GOOD, verdict: 'Revenue rose to $98,765 this month.' };

async function main() {
  // 1. Month maths.
  check('previous month of an October day is September', previousMonth('2026-10-02') === '2026-09');
  check('previous month of January is last December', previousMonth('2026-01-15') === '2025-12');
  check('September range runs to the 30th', JSON.stringify(monthRange('2026-09')) === JSON.stringify({ from: '2026-09-01', to: '2026-09-30' }));
  check('February 2028 range runs to the 29th', monthRange('2028-02').to === '2028-02-29');
  check('live before the 1st = a full month', isFullMonth(new Date('2026-07-15T12:00:00Z'), '2026-08', 'UTC'));
  check('live on the 10th = not a full month', !isFullMonth(new Date('2026-09-10T12:00:00Z'), '2026-09', 'UTC'));
  check('never live = not a full month', !isFullMonth(null, '2026-09', 'UTC'));

  // 2. The number check.
  const facts = { thisMonth: { collectedDollars: 1240, fillPct: 22.4 }, month: 'September 2026', worstUnsoldHours: [{ hour: '1pm', lostDollars: 310 }] };
  check('numbers from the facts pass', validateNumbers('Collected $1,240, 22.4% full, $310 lost at 1pm in September 2026.', facts).length === 0);
  check('a rounded fact passes', validateNumbers('About 22% full.', facts).length === 0);
  check('small counting numbers pass', validateNumbers('Try these 3 changes.', facts).length === 0);
  check('an invented figure is caught', JSON.stringify(validateNumbers('Revenue rose to $98,765.', facts)) === '[98765]');
  check('an invented percentage is caught', validateNumbers('No-shows fell 37%.', facts).includes(37));
  check('a ratio word is caught', draftProblems('Bookings doubled this month.', facts).includes('doubled'));
  check('half is caught', draftProblems('Half of your tee times went unsold.', facts).includes('half'));

  await cleanup();
  const live = await seedCourse(new Date('2026-07-15T12:00:00Z'));
  const calls: string[] = [];
  const good: Writer = async () => { calls.push('good'); return GOOD; };

  // 3. The first full month is the baseline.
  const aug = await runMonthlyReview(live, new Date('2026-09-02T12:00:00Z'), good);
  const augRow = await prisma.monthlyReview.findUnique({ where: { courseId_month: { courseId: live, month: '2026-08' } } });
  check('August review is stored', aug.month === '2026-08' && !!augRow?.body, aug.outcome);
  check('August is the baseline', augRow?.isBaseline === true);
  check('a quiet month is marked thin', augRow?.status === 'thin');
  check('the stored metrics are the computed ones', (augRow?.metrics as { headline?: { bookings?: number } })?.headline?.bookings === 2);
  check('running again does not write a second review', (await runMonthlyReview(live, new Date('2026-09-03T12:00:00Z'), good)).outcome === 'exists');

  // 4. The next month measures against the baseline and last month.
  let seen: unknown = null;
  const capture: Writer = async (f) => { seen = f; return GOOD; };
  await runMonthlyReview(live, new Date('2026-10-02T12:00:00Z'), capture);
  const sepRow = await prisma.monthlyReview.findUnique({ where: { courseId_month: { courseId: live, month: '2026-09' } } });
  const f = seen as { baseline?: { month?: string }; lastMonth?: { month?: string }; isBaseline?: boolean } | null;
  check('September is not a baseline', sepRow?.isBaseline === false);
  check('September is given the August baseline', f?.baseline?.month === 'August 2026');
  check('September is given last month', f?.lastMonth?.month === 'August 2026');

  // 5. Invented numbers never reach the stored review.
  const course2 = await seedCourse(new Date('2026-07-15T12:00:00Z'));
  let tries = 0;
  const liar: Writer = async () => { tries++; return INVENTED; };
  const bad = await runMonthlyReview(course2, new Date('2026-09-02T12:00:00Z'), liar);
  const badRow = await prisma.monthlyReview.findUnique({ where: { courseId_month: { courseId: course2, month: '2026-08' } } });
  check('a draft with an invented number is retried once', tries === 2);
  check('two invented drafts = failed, nothing stored to show', bad.outcome === 'failed' && badRow?.status === 'failed' && badRow.body === null, bad.error);
  let attempt = 0;
  const learns: Writer = async () => (++attempt === 1 ? INVENTED : GOOD);
  const fixed = await runMonthlyReview(course2, new Date('2026-09-04T12:00:00Z'), learns);
  check('a failed month is retried on a later run and the corrected draft stored', fixed.outcome === 'thin' && attempt === 2, fixed.outcome);

  // 6. A course that went live mid-month gets no review for that month.
  const late = await seedCourse(new Date('2026-09-10T12:00:00Z'));
  check('went live mid-September: no September review', (await runMonthlyReview(late, new Date('2026-10-02T12:00:00Z'), good)).outcome === 'not_full_month');

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

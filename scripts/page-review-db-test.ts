// Cam 2026-10-27: onboarding step 1's part-by-part review reads the booking page
// in golfers' words (src/lib/page-review.ts). Real database.
// Run: npx tsx scripts/page-review-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { pageReview } from '../src/lib/page-review';
import { describePolicy, policyFrom } from '../src/lib/cancel-policy';

const TAG = 'pagereviewtest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.coursePhoto.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Review Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: 'Pine Review GC', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'Saratoga Springs', state: 'NY', zipCode: '12866',
    holes: 18, par: 71, phone: '518-555-0100', description: 'Rolling hills.', publicAdvanceDays: 10,
    cancellationHours: 24, lateCancellationFeeCents: 1500, logoUrl: '', heroImageUrl: 'https://x/hero.jpg',
  } });
  await prisma.teeTimeSchedule.create({ data: { courseId: course.id, daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '17:30', intervalMinutes: 9, holes: 18, greenFeeWeekdayCents: 4500, greenFeeWeekendCents: 5500, cartFeeCents: 2000 } });
  await prisma.teeTimeSchedule.create({ data: { courseId: course.id, daysOfWeek: [], startTime: '06:00', endTime: '08:00', intervalMinutes: 10, holes: 9, greenFeeWeekdayCents: 2000, greenFeeWeekendCents: 2000, active: false } });

  const r = (await pageReview(course.id))!;
  const part = (k: string) => r.parts.find(p => p.key === k)!;
  const row = (k: string, label: string) => part(k).rows.find(x => x.label === label)?.value;

  ok('five parts in order', r.parts.map(p => p.key).join() === 'course_details,pricing,tee_times,policies,photos', r.parts.map(p => p.key));
  ok('course details in plain words', row('course_details', 'Address') === '1 Test Dr, Saratoga Springs, NY' && row('course_details', 'Course') === '18 holes, par 71');
  ok('prices from the running schedule only', row('pricing', '18 holes') === '$45 weekdays, $55 weekends' && row('pricing', 'Cart') === '$20 a player' && part('pricing').rows.length === 2, part('pricing').rows);
  ok('tee times say the days, the hours and the gap', row('tee_times', 'Tee times') === 'Weekdays, 7:00 am to 5:30 pm, every 9 minutes', part('tee_times').rows);
  ok('…and how far ahead booking opens', row('tee_times', 'Booking opens') === '10 days ahead');
  const golfer = describePolicy(policyFrom(course));
  ok('the policy is word for word what golfers read', part('policies').rows[0].label === golfer.headline && part('policies').rows[0].value === golfer.lines.join(' '));
  ok('photos say what is there and what is not', row('photos', 'Logo') === 'Not added yet' && row('photos', 'Course photo') === 'Added' && row('photos', 'Gallery') === 'Not added yet');
  ok('missing items come from the shared list', r.missing.map(m => m.key).join() === 'logo,gallery,teesets', r.missing.map(m => m.key));

  const route = readFileSync('src/app/api/operator/page-review/route.ts', 'utf8');
  ok('the route is owner only and reads the session\'s own course', route.includes('if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }') && route.includes('pageReview(session.courseId)'));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`page-review: ${failed} failed`); process.exit(1); }
  console.log('page-review: all passed');
})();

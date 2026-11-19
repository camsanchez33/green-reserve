// The nightly run makes one day past each course's horizon (Build 2026-11-19). It runs at 03:00 UTC, the evening
// before for a course west of UTC, so its "today" is the golfers' yesterday; without the extra day the window's last
// day had no tee times from local midnight until the next run.
// Run: npx tsx scripts/nightly-extra-day-db-test.ts (needs DATABASE_URL)
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { generateForAllCourses } from '../src/lib/tee-sheet-engine';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { lastBookableDate } from '../src/lib/booking-window';

const TAG = 'nightx';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || i === '' ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

ok('the cron still runs generateForAllCourses at 03:00 UTC', readFileSync('src/app/api/cron/generate-tee-times/route.ts', 'utf8').includes('generateForAllCourses(8)')
  && /"path": "\/api\/cron\/generate-tee-times", "schedule": "0 3 \* \* \*"/.test(readFileSync('vercel.json', 'utf8')));

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const tz = 'America/Los_Angeles';
  const c = await prisma.course.create({ data: { name: 'West', slug: `${TAG}-w`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '1', holes: 18, timezone: tz, publicAdvanceDays: 7, memberAdvanceDays: 7 } });
  await prisma.teeTimeSchedule.create({ data: { courseId: c.id, daysOfWeek: [], startTime: '08:00', endTime: '08:30', intervalMinutes: 10, greenFeeWeekdayCents: 5000, greenFeeWeekendCents: 6000 } });

  // The nightly run at 03:00 UTC: 7 or 8 PM the evening before in Los Angeles.
  const utcDay = todayIn('UTC');
  const run = new Date(`${utcDay}T03:00:00Z`);
  const errors = (await generateForAllCourses(8, run)).filter(e => e.courseId === c.id);
  ok('the run has no errors for the course', errors.length === 0, errors);
  const runDay = todayIn(tz, run);
  ok('(at 03:00 UTC the course\'s day is the UTC day before)', runDay === addDaysStr(utcDay, -1), { runDay, utcDay });

  // The next morning in Los Angeles (after local midnight), the public window's last day must have tee times.
  const morning = new Date(`${utcDay}T16:00:00Z`);
  const last = lastBookableDate(7, morning, tz);
  ok('after local midnight, the window\'s last day has its tee times', (await prisma.teeTime.count({ where: { courseId: c.id, date: last } })) === 4, { last });
  // Horizon 8 (a 7-day window plus one) plus the extra day: 9 days from the run's day, nothing past.
  const dates = (await prisma.teeTime.groupBy({ by: ['date'], where: { courseId: c.id } })).map(g => g.date).sort();
  ok('nine days from the run\'s day, nothing past', dates.length === 9 && dates[0] === runDay && dates[8] === addDaysStr(runDay, 8), dates);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

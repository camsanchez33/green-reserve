// Hotfix 2026-10-19: generateTeeTimes read the day's rows before deleting the
// open ones, then skipped recreating every row it had just deleted — so a
// second run on the same day (the nightly cron, or any schedule save) wiped all
// open tee times. Against a real database (CI has Postgres, migrated).
// Run: npx tsx scripts/teetime-regenerate-test.ts
import { prisma } from '../src/lib/prisma';
import { generateTeeTimes } from '../src/lib/tee-sheet-engine';

let failed = 0;
const check = (label: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + d}`); if (!ok) failed++; };
const TAG = `regen-${Date.now()}`;
const DATE = '2031-06-03'; // a Tuesday far from any real data

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = courses.map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  try {
    const op = await prisma.courseOperator.create({ data: { name: 'Regen', email: `${TAG}@test.local`, password: 'x' } });
    const course = await prisma.course.create({ data: { name: 'Regen Course', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC' } });
    const sched = await prisma.teeTimeSchedule.create({ data: { courseId: course.id, tierName: 'Morning', daysOfWeek: [], startTime: '07:00', endTime: '08:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 5500, greenFeeWeekendCents: 7000, cartFeeCents: 1800 } });
    const count = () => prisma.teeTime.count({ where: { courseId: course.id, date: DATE } });

    await generateTeeTimes(course.id, DATE);
    check('first run makes the six times', (await count()) === 6, String(await count()));
    await generateTeeTimes(course.id, DATE);
    check('a second run keeps them (it used to delete all six)', (await count()) === 6, String(await count()));
    await generateTeeTimes(course.id, DATE);
    check('a third run still six', (await count()) === 6, String(await count()));

    await prisma.teeTimeSchedule.update({ where: { id: sched.id }, data: { greenFeeWeekdayCents: 6000 } });
    await generateTeeTimes(course.id, DATE);
    const rows = await prisma.teeTime.findMany({ where: { courseId: course.id, date: DATE } });
    check('a price change keeps every time, at the new price', rows.length === 6 && rows.every(r => r.greenFeeCents === 6000), JSON.stringify(rows.map(r => r.greenFeeCents)));

    // A booked time is never touched.
    const t0700 = rows.find(r => r.time === '07:00')!;
    await prisma.teeTime.update({ where: { id: t0700.id }, data: { playersBooked: 2 } });
    await prisma.teeTimeSchedule.update({ where: { id: sched.id }, data: { greenFeeWeekdayCents: 6500 } });
    await generateTeeTimes(course.id, DATE);
    const after = await prisma.teeTime.findMany({ where: { courseId: course.id, date: DATE } });
    check('the booked time keeps its old price; the rest move', after.length === 6 && after.find(r => r.time === '07:00')!.greenFeeCents === 6000 && after.filter(r => r.time !== '07:00').every(r => r.greenFeeCents === 6500), JSON.stringify(after.map(r => [r.time, r.greenFeeCents])));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('teetime-regenerate: all passed');
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

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
    check('first run makes the seven times (W2-3: the last at 08:00)', (await count()) === 7, String(await count()));
    await generateTeeTimes(course.id, DATE);
    check('a second run keeps them (it used to delete them all)', (await count()) === 7, String(await count()));
    const idsBefore = (await prisma.teeTime.findMany({ where: { courseId: course.id, date: DATE }, select: { id: true } })).map(r => r.id).sort().join();
    await generateTeeTimes(course.id, DATE);
    check('a third run still seven', (await count()) === 7, String(await count()));
    // Reviewer 2026-10-29: a rebuild of the whole horizon must not rewrite every open slot.
    const idsAfter = () => prisma.teeTime.findMany({ where: { courseId: course.id, date: DATE }, select: { id: true } }).then(r => r.map(x => x.id).sort().join());
    check('…the same rows, not deleted and re-created', (await idsAfter()) === idsBefore);

    await prisma.teeTimeSchedule.update({ where: { id: sched.id }, data: { greenFeeWeekdayCents: 6000 } });
    await generateTeeTimes(course.id, DATE);
    const rows = await prisma.teeTime.findMany({ where: { courseId: course.id, date: DATE } });
    check('a price change keeps every time, at the new price', rows.length === 7 && rows.every(r => r.greenFeeCents === 6000), JSON.stringify(rows.map(r => r.greenFeeCents)));
    check('…updated in place (same rows)', (await idsAfter()) === idsBefore);

    // A booked time stays (never deleted) and its open spots take the new price;
    // the booking keeps its own (Revamp 3 fix 5, Cam 2026-10-29).
    const t0700 = rows.find(r => r.time === '07:00')!;
    await prisma.teeTime.update({ where: { id: t0700.id }, data: { playersBooked: 2 } });
    await prisma.teeTimeSchedule.update({ where: { id: sched.id }, data: { greenFeeWeekdayCents: 6500 } });
    await generateTeeTimes(course.id, DATE);
    const after = await prisma.teeTime.findMany({ where: { courseId: course.id, date: DATE } });
    check('the booked time stays, its open spots at the new price', after.length === 7 && after.every(r => r.greenFeeCents === 6500) && after.find(r => r.time === '07:00')!.playersBooked === 2, JSON.stringify(after.map(r => [r.time, r.greenFeeCents])));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('teetime-regenerate: all passed');
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

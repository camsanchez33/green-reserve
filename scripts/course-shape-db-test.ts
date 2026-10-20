// W2-6 (Cam 2026-10-20): one save sets a course's shape and retires what the
// old shape had. Against a real database. Run: npx tsx scripts/course-shape-db-test.ts
import { prisma } from '../src/lib/prisma';
import { planCourseSetup, applyCourseSetup } from '../src/lib/course-shape-setup';
import { shapeDef, shapeRounds } from '../src/lib/course-shape';
import { todayIn, addDaysStr } from '../src/lib/course-time';
const TAG = 'w26shape';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
async function cleanup() {
  const cs = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseProduct.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.nine.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const sched = (courseId: string, productId: string | null, extra: Record<string, unknown> = {}) => prisma.teeTimeSchedule.create({ data: { courseId, productId, tierName: 'standard', daysOfWeek: [], startTime: '07:00', endTime: '09:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 5000, greenFeeWeekendCents: 6000, cartFeeCents: 0, ...extra } });

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });

  // A course that was set up as 27 holes and is really an 18.
  const c = await prisma.course.create({ data: { name: 'Was 27', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '1', holes: 27, par: 72, timezone: 'UTC' } });
  const [n, s, w] = await Promise.all(['North', 'South', 'West'].map((name, i) => prisma.nine.create({ data: { courseId: c.id, name, sortOrder: i } })));
  const ns = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'North + South', holes: 18, nineIds: [n.id, s.id], sortOrder: 0 } });
  const sw = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'South + West', holes: 18, nineIds: [s.id, w.id], sortOrder: 1 } });
  await sched(c.id, ns.id); const swSched = await sched(c.id, sw.id, { startTime: '10:00', endTime: '11:00' });
  // A booked future time on South + West.
  const day = addDaysStr(todayIn('UTC'), 1);
  await prisma.teeTime.create({ data: { courseId: c.id, productId: sw.id, date: day, time: '10:00', holes: 18, playersBooked: 2, greenFeeCents: 5000, cartFeeCents: 0 } });

  const input = { shape: 'eighteen' as const, names: ['Front 9', 'Back 9'], par: 72, rounds: shapeRounds(shapeDef('eighteen')!, []).map(r => ({ key: r.key, on: r.key === 'pair:0-1' || r.key === 'single:0' })) };
  const pv = await planCourseSetup(c.id, input);
  ok('the preview says what goes', pv.ok && pv.preview.ninesRemoved.join() === 'West' && pv.preview.roundsStopped.join() === 'South + West' && pv.preview.bookedTimesKept === 1, JSON.stringify(pv));
  ok('…and writes nothing', (await prisma.nine.count({ where: { courseId: c.id } })) === 3);
  const r = await applyCourseSetup(c.id, input);
  ok('the save succeeds', r.ok, JSON.stringify(r));
  const nines = await prisma.nine.findMany({ where: { courseId: c.id }, orderBy: { sortOrder: 'asc' } });
  ok('no leftover nine from the 27', nines.length === 2 && nines.map(x => x.name).join() === 'Front 9,Back 9', JSON.stringify(nines.map(x => x.name)));
  ok('the course now says 18 holes', (await prisma.course.findUnique({ where: { id: c.id } }))?.holes === 18);
  const prods = await prisma.courseProduct.findMany({ where: { courseId: c.id } });
  const eighteen = prods.find(p => p.id === ns.id);
  ok('the 18 keeps its round (and its schedule)', eighteen?.active === true && eighteen.label === '18 holes' && (await prisma.teeTimeSchedule.count({ where: { productId: ns.id, active: true } })) === 1);
  ok('South + West stops being sold, its schedule paused', prods.find(p => p.id === sw.id)?.active === false && (await prisma.teeTimeSchedule.findUnique({ where: { id: swSched.id } }))?.active === false);
  ok('a 9-hole round is added', prods.some(p => p.active && p.holes === 9 && p.label === '9 holes'));
  ok('the booked time on the stopped round is kept', (await prisma.teeTime.count({ where: { courseId: c.id, productId: sw.id, playersBooked: { gt: 0 } } })) === 1);
  ok('no open times are left on the stopped round', (await prisma.teeTime.count({ where: { courseId: c.id, productId: sw.id, playersBooked: 0 } })) === 0);
  const again = await planCourseSetup(c.id, input);
  ok('saving the same shape again changes nothing', again.ok && !again.preview.ninesAdded.length && !again.preview.ninesRemoved.length && !again.preview.roundsStarted.length && !again.preview.roundsStopped.length, JSON.stringify(again));

  // A simple 18 with no rounds: its schedules move onto the new rounds.
  const d = await prisma.course.create({ data: { name: 'Simple 18', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '1', holes: 18, par: 70, timezone: 'UTC' } });
  const s18 = await sched(d.id, null); const s9 = await sched(d.id, null, { holes: 9, startTime: '16:00', endTime: '17:00' });
  const legacy = await prisma.teeTime.create({ data: { courseId: d.id, productId: null, date: day, time: '07:00', holes: 18, playersBooked: 4, greenFeeCents: 5000, cartFeeCents: 0 } });
  const r2 = await applyCourseSetup(d.id, { ...input, par: 70 });
  ok('a simple 18 gets its rounds', r2.ok && r2.preview.schedulesMoved === 2);
  const p18 = await prisma.courseProduct.findFirst({ where: { courseId: d.id, holes: 18 } });
  const p9 = await prisma.courseProduct.findFirst({ where: { courseId: d.id, holes: 9 } });
  ok('its 18-hole schedule moves onto "18 holes", the 9-hole one onto "9 holes"', (await prisma.teeTimeSchedule.findUnique({ where: { id: s18.id } }))?.productId === p18?.id && (await prisma.teeTimeSchedule.findUnique({ where: { id: s9.id } }))?.productId === p9?.id);
  const slots0700 = await prisma.teeTime.findMany({ where: { courseId: d.id, date: day, time: '07:00' } });
  ok('a booked time is adopted by its round, not doubled', slots0700.length === 1 && slots0700[0].id === legacy.id, JSON.stringify(slots0700.map(x => [x.productId, x.playersBooked])));

  // Bad input.
  ok('the same name twice is refused', !(await planCourseSetup(c.id, { shape: 'three_nines', names: ['A', 'A', 'B'], par: 72, rounds: [] })).ok);
  ok('no round ticked is refused', !(await planCourseSetup(c.id, { ...input, rounds: input.rounds.map(x => ({ ...x, on: false })) })).ok);
  ok('an unknown shape is refused', !(await planCourseSetup(c.id, { ...input, shape: 'nope' as never })).ok);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('course-shape-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

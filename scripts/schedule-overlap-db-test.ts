// W2-6 (Cam 2026-10-20): Schedule overlaps WARN, never block — only one tee time
// sold twice is refused. Preview and save, against a real database.
// Run: npx tsx scripts/schedule-overlap-db-test.ts
import { prisma } from '../src/lib/prisma';
import { previewScheduleChange } from '../src/lib/schedule-preview';
import { saveSchedulePlan, ScheduleConflictError } from '../src/lib/schedule-service';
const TAG = 'w26ovl';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
async function cleanup() {
  const cs = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map(c => c.id);
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseProduct.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.nine.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const period = (startTime: string, endTime: string) => ({ tierName: 'standard', startTime, endTime, greenFeeWeekday: 50, greenFeeWeekend: 60, cartFee: 0, walkingAllowed: true });
(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Ovl', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '1', holes: 18, par: 72, timezone: 'UTC' } });
  const [f, b] = await Promise.all(['Front 9', 'Back 9'].map((name, i) => prisma.nine.create({ data: { courseId: c.id, name, sortOrder: i } })));
  const p18 = await prisma.courseProduct.create({ data: { courseId: c.id, label: '18 holes', holes: 18, nineIds: [f.id, b.id] } });
  const pb9 = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'Back 9 start', holes: 9, nineIds: [b.id] } });
  const p9 = await prisma.courseProduct.create({ data: { courseId: c.id, label: '9 holes', holes: 9, nineIds: [f.id] } });
  const saved18 = await saveSchedulePlan(c.id, { replaces: [], productId: p18.id, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 10, holes: 18, active: true, periods: [period('07:00', '12:00')] } as never);
  ok('the 18s save', Array.isArray(saved18));

  const back = { replaces: [], productId: pb9.id, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 10, holes: 9, active: true, periods: [period('07:00', '10:00')] };
  const pv = await previewScheduleChange(c.id, { op: 'plan', plan: back as never });
  ok('back-nine starts during the turn: preview notes it', !!pv && !pv.refusal && !!pv.warnings?.some(w => /leave a gap around 9:15 AM/.test(w)), JSON.stringify(pv));
  let threw = false; try { await saveSchedulePlan(c.id, back as never); } catch { threw = true; }
  ok('…and it saves (a note, not a block)', !threw && (await prisma.teeTimeSchedule.count({ where: { courseId: c.id, productId: pb9.id } })) === 1);

  const clash = { replaces: [], productId: p9.id, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 10, holes: 9, active: true, periods: [period('11:00', '13:00')] };
  const pv2 = await previewScheduleChange(c.id, { op: 'plan', plan: clash as never });
  ok('9 holes off the front tee at the same minute as the 18s: preview refuses', !!pv2?.refusal && /11:00 AM/.test(pv2.refusal), JSON.stringify(pv2));
  let err: unknown = null; try { await saveSchedulePlan(c.id, clash as never); } catch (e) { err = e; }
  ok('…and the save refuses it too', err instanceof ScheduleConflictError);
  const offGrid = { ...clash, periods: [period('12:05', '15:00')] };
  const pv3 = await previewScheduleChange(c.id, { op: 'plan', plan: offGrid as never });
  ok('starting after the last 18 is fine', !!pv3 && !pv3.refusal, JSON.stringify(pv3));
  const paused = await previewScheduleChange(c.id, { op: 'plan', plan: { ...clash, active: false } as never });
  ok('a paused schedule is never refused', !!paused && !paused.refusal);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('schedule-overlap-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

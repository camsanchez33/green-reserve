// W2-4: saving a whole schedule (price periods) against a real database —
// boundaries, booked times kept, pause, delete, and another course refused.
// Run: npx tsx scripts/schedule-plan-db-test.ts (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { saveSchedulePlan } from '../src/lib/schedule-service';
const TAG = 'w24chk';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
async function cleanup() {
  const cs = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map(c => c.id);
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'W24', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const P = (tierName: string, startTime: string, endTime: string, fee: number, id?: string) => ({ id, tierName, startTime, endTime, greenFeeWeekday: fee, greenFeeWeekend: fee + 20, cartFee: 18, walkingAllowed: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] | null = await saveSchedulePlan(c.id, { replaces: [], daysOfWeek: [0,1,2,3,4,5,6], intervalMinutes: 10, holes: 18, periods: [P('Morning', '07:00', '15:00', 65), P('Twilight', '15:00', '17:00', 40)] });
  ok('created two rows', rows!.length === 2);
  const today = new Date().toISOString().slice(0, 10); // the course runs on UTC
  // P() prices the weekend $20 above the weekday; today's slots carry whichever today is (this failed every Saturday and Sunday).
  const weekend = [0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay());
  const fee = (weekday: number) => (weekday + (weekend ? 20 : 0)) * 100;
  let tts = await prisma.teeTime.findMany({ where: { courseId: c.id, date: today }, orderBy: { time: 'asc' } });
  ok('slots 07:00..17:00 every 10 = 61', tts.length === 61, String(tts.length));
  ok('15:00 is twilight $40', tts.find(t => t.time === '15:00')?.greenFeeCents === fee(40) && tts.find(t => t.time === '14:50')?.greenFeeCents === fee(65));
  ok('17:00 exists', !!tts.find(t => t.time === '17:00'));
  const ids = rows!.map((r: any) => r.id);
  const morning = rows!.find((r: any) => r.tierName === 'Morning') as any;
  // book one twilight slot, then move twilight to 16:00 and reprice
  const t1530 = tts.find(t => t.time === '15:30')!;
  await prisma.teeTime.update({ where: { id: t1530.id }, data: { playersBooked: 2 } });
  rows = await saveSchedulePlan(c.id, { replaces: ids, daysOfWeek: [0,1,2,3,4,5,6], intervalMinutes: 10, holes: 18, periods: [P('Morning', '07:00', '16:00', 70, morning.id), P('Late', '16:00', '17:00', 35)] });
  ok('still two rows, morning kept its id', rows!.length === 2 && rows!.some((r: any) => r.id === morning.id));
  tts = await prisma.teeTime.findMany({ where: { courseId: c.id, date: today } });
  ok('15:30 booked kept old price', tts.find(t => t.time === '15:30')?.greenFeeCents === fee(40));
  ok('15:40 now morning $70, 16:00 late $35', tts.find(t => t.time === '15:40')?.greenFeeCents === fee(70) && tts.find(t => t.time === '16:00')?.greenFeeCents === fee(35));
  const ids2 = rows!.map((r: any) => r.id);
  rows = await saveSchedulePlan(c.id, { replaces: ids2, daysOfWeek: [0,1,2,3,4,5,6], intervalMinutes: 10, holes: 18, active: false, periods: [P('Morning', '07:00', '16:00', 70, ids2[0]), P('Late', '16:00', '17:00', 35, ids2[1])].map((p, i) => ({ ...p, id: rows![i].id, tierName: (rows![i] as any).tierName, startTime: (rows![i] as any).startTime, endTime: (rows![i] as any).endTime })) });
  ok('paused both', rows!.every((r: any) => !r.active));
  tts = await prisma.teeTime.findMany({ where: { courseId: c.id, date: today } });
  ok('only the booked slot remains', tts.length === 1 && tts[0].time === '15:30', String(tts.length));
  const foreign = await saveSchedulePlan('nope', { replaces: ids2, daysOfWeek: [1], intervalMinutes: 10, periods: [] });
  ok('another course cannot touch these rows', foreign === null);
  rows = await saveSchedulePlan(c.id, { replaces: ids2, daysOfWeek: [1], intervalMinutes: 10, periods: [] });
  ok('deleted', rows!.length === 0);
  let threw = false; try { await saveSchedulePlan(c.id, { replaces: [], daysOfWeek: [1], intervalMinutes: 10, periods: [P('a', '07:00', '12:00', 1), P('b', '13:00', '14:00', 1)] }); } catch { threw = true; }
  ok('a gap between periods is refused', threw);
  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('schedule-plan-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

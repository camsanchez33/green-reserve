// CART-1 (Cam 2026-10-24: walking/cart "flexible based on the holes, time…"):
// walking and the cart price per price-table cell, weekday and weekend, saved
// through the Schedule page's own save and onto the tee times it makes.
// Run: npx tsx scripts/cart-walk-db-test.ts (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { saveCoursePlan } from '../src/lib/schedule-service';
import { emptyCell, type CoursePlan } from '../src/lib/course-plan';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { walkingAllowedAt } from '../src/lib/booking-rules';
const TAG = 'cart1chk';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseProduct.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'CART-1', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC',
    // The old course-wide word says carts only; it must no longer decide anything.
    walkingAllowed: 'never', cartRequired: true } });
  const p18 = await prisma.courseProduct.create({ data: { courseId: c.id, label: '18 holes', holes: 18 } });
  const p9 = await prisma.courseProduct.create({ data: { courseId: c.id, label: '9 holes', holes: 9, sortOrder: 1 } });
  const cell = (wd: number, cart: number, cartWeekend: number, walk: boolean, walkWeekend: boolean) => ({ ...emptyCell(), weekday: wd, weekend: wd + 10, cart, cartWeekend, walk, walkWeekend });
  const plan: CoursePlan = {
    rounds: [{ key: p18.id, on: true, from: null, to: null }, { key: p9.id, on: true, from: null, to: null }],
    usual: { days: [], closed: false, first: '07:00', last: '17:00', interval: 10, firstName: null, changes: [{ at: '15:00', name: null }],
      prices: {
        // 18 holes: weekend mornings ride only ($25 cart), weekdays walkable ($20); twilight walkable every day.
        [p18.id]: [cell(65, 20, 25, true, false), cell(40, 15, 15, true, true)],
        // 9 holes: walkable mornings, cart only at twilight.
        [p9.id]: [cell(35, 12, 12, true, true), cell(25, 10, 10, false, false)],
      } },
    different: [],
  };
  await saveCoursePlan(c.id, plan);
  const rows = await prisma.teeTimeSchedule.findMany({ where: { courseId: c.id } });
  const morning18 = rows.find(r => r.productId === p18.id && r.startTime === '07:00');
  ok('the save keeps weekday walking, weekend ride-only and the weekend cart price', morning18?.walkingAllowed === true && morning18?.walkingWeekend === false && morning18?.cartFeeCents === 2000 && morning18?.cartFeeWeekendCents === 2500, JSON.stringify(morning18));
  const twi9 = rows.find(r => r.productId === p9.id && r.startTime === '15:00');
  ok('a cart-only cell is saved cart-only (it used to be saved as walkable)', twi9?.walkingAllowed === false && twi9?.walkingWeekend === false);

  // The tee times it makes over the next week: find a weekday and a Saturday.
  const today = todayIn('UTC');
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(today, i + 1));
  const sat = days.find(d => new Date(d + 'T12:00:00Z').getUTCDay() === 6)!;
  const wed = days.find(d => new Date(d + 'T12:00:00Z').getUTCDay() === 3)!;
  const { generateTeeTimes } = await import('../src/lib/tee-sheet-engine');
  await generateTeeTimes(c.id, sat); await generateTeeTimes(c.id, wed);
  const tt = (date: string, productId: string, time: string) => prisma.teeTime.findFirst({ where: { courseId: c.id, date, productId, time } });
  const satAm = await tt(sat, p18.id, '07:00'), wedAm = await tt(wed, p18.id, '07:00'), satTwi = await tt(sat, p18.id, '15:00'), wed9Twi = await tt(wed, p9.id, '15:00');
  ok('Saturday 7:00, 18 holes: ride only at the weekend cart price', satAm?.walkingAllowed === false && satAm?.cartFeeCents === 2500, JSON.stringify(satAm));
  ok('Wednesday 7:00, 18 holes: walkable, weekday cart price', wedAm?.walkingAllowed === true && wedAm?.cartFeeCents === 2000);
  ok('Saturday twilight, 18 holes: walkable', satTwi?.walkingAllowed === true && satTwi?.cartFeeCents === 1500);
  ok('Wednesday twilight, 9 holes: cart only', wed9Twi?.walkingAllowed === false);
  ok('booking reads the tee time, not the old course-wide "carts only" word', walkingAllowedAt(wedAm!) && !walkingAllowedAt(satAm!));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('cart-walk-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

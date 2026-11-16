// Memberships item 3 (Cam 2026-11-16): member rates set against the course's own price list — each round, weekday
// and weekend, green fee and cart; blank = public, 0 = free, a price or % off — and a booking window of "the
// public window" or N days. Pure rules plus the price list read from a real database.
// Run: npx tsx scripts/tier-line-rates-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { applyTierRates, parseLineRates, readLineRates, tierCartCents, lineKey } from '../src/lib/tier-rates';
import { windowFor } from '../src/lib/booking-window';
import { tierPriceList } from '../src/lib/tier-price-list';
const TAG = 'tierlines3';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };

const WED = '2026-11-18', SAT = '2026-11-21';
const flat = { greenFeeWeekdayCents: null, greenFeeWeekendCents: null, cartFeeWeekdayCents: null, cartFeeWeekendCents: null, discountPct: null };
const tt = (date: string, productId: string | null, green = 6200, cart = 2200) => ({ greenFeeCents: green, cartFeeCents: cart, memberRateCents: null, date, productId });

(async () => {
  // ── Pricing a line ──
  const lines = { [lineKey('green', 'p18', 'wd')]: { cents: 0 }, [lineKey('green', 'p18', 'we')]: { cents: 1500 }, [lineKey('cart', 'p18', 'wd')]: { pct: 50 }, [lineKey('green', 'p9', 'wd')]: { pct: 25 } };
  const tier = { ...flat, discountPct: 30, lineRates: lines };
  ok('0 = free on its line', applyTierRates(tt(WED, 'p18'), tier).greenFeeCents === 0);
  ok('a member price on its line (weekend)', applyTierRates(tt(SAT, 'p18', 7800), tier).greenFeeCents === 1500);
  ok('a % off the public price on its line (the cart)', applyTierRates(tt(WED, 'p18'), tier).cartFeeCents === 1100);
  ok('blank = the public price (weekend cart), never the old % off', applyTierRates(tt(SAT, 'p18', 7800, 2400), tier).cartFeeCents === 2400);
  ok('each round has its own lines', applyTierRates(tt(WED, 'p9', 3600), tier).greenFeeCents === 2700 && applyTierRates(tt(SAT, 'p9', 4400), tier).greenFeeCents === 4400);
  ok('a round not on the membership at all is the public price', applyTierRates(tt(WED, 'tw', 4000), tier).greenFeeCents === 4000);
  ok('a % off follows the tee time’s own price (a twilight or demand price)', applyTierRates(tt(WED, 'p18', 3000, 2000), tier).cartFeeCents === 1000);
  ok('a course with no named rounds uses "-"', applyTierRates(tt(WED, null), { ...flat, lineRates: { [lineKey('green', '', 'wd')]: { cents: 999 } } }).greenFeeCents === 999);
  ok('an empty set of lines = every line public', applyTierRates(tt(WED, 'p18'), { ...flat, discountPct: 30, lineRates: {} }).greenFeeCents === 6200);
  ok('a tier from before (no lines) keeps its % off', applyTierRates(tt(WED, 'p18'), { ...flat, discountPct: 30, lineRates: null }).greenFeeCents === 4340);
  ok('the cart added at check-in prices the same line', tierCartCents({ cartFeeCents: 2200, date: WED, productId: 'p18' }, tier) === 1100);
  ok('malformed stored lines are dropped, never priced', JSON.stringify(readLineRates({ 'green:p18:wd': { cents: -5 }, 'nope': { cents: 1 }, 'cart:p18:we': { pct: 250 } })) === '{}');

  // ── What the setup may send ──
  const okParse = parseLineRates({ 'green:p18:wd': { cents: 0 }, 'cart:p18:we': { pct: 12.5 }, 'green:p18:we': null }, ['p18']);
  ok('the setup: a price, a % off, a blank', okParse.ok && JSON.stringify(okParse.value) === JSON.stringify({ 'green:p18:wd': { cents: 0 }, 'cart:p18:we': { pct: 12.5 } }), okParse);
  ok('another course’s round is refused', !parseLineRates({ 'green:pOther:wd': { cents: 0 } }, ['p18']).ok);
  ok('a negative price, a 0% or 150% off is refused', !parseLineRates({ 'green:p18:wd': { cents: -1 } }, ['p18']).ok && !parseLineRates({ 'green:p18:wd': { pct: 0 } }, ['p18']).ok && !parseLineRates({ 'green:p18:wd': { pct: 150 } }, ['p18']).ok);

  // ── Booking window ──
  const course = { publicAdvanceDays: 7, memberAdvanceDays: 14 };
  ok('"the public window": members book as far ahead as the public', windowFor(course, { tier: { advanceBookingDays: 30, windowPublic: true } }).days === 7);
  ok('N days: their own window, as before', windowFor(course, { tier: { advanceBookingDays: 30, windowPublic: false } }).days === 30 && windowFor(course, { tier: { advanceBookingDays: 30 } }).days === 30);

  // ── Every caller passes the round and the lines (pins) ──
  const src = (p: string) => readFileSync(p, 'utf8');
  ok('check-in prices the cart through tier-rates (no copy of the rules)', src('src/lib/checkin-booking.ts').includes('perPlayer = tierCartCents(booking.teeTime, m.tier);') && src('src/lib/checkin-booking.ts').includes('lineRates: true'));
  ok('a price-list line on a membership switches member pricing on', src('src/lib/pricing-switch.ts').includes('readLineRates(t.lineRates)'));
  ok('the member portal window follows the membership', src('src/app/api/member/[courseSlug]/session/route.ts').includes('windowFor(course, { tier: membership.tier }).days'));

  // ── The price list, from the course's schedule ──
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseProduct.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Lines', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const p18 = await prisma.courseProduct.create({ data: { courseId: c.id, label: '18 holes', holes: 18, sortOrder: 0 } });
  const p9 = await prisma.courseProduct.create({ data: { courseId: c.id, label: '9 holes', holes: 9, sortOrder: 1 } });
  const sched = (productId: string, start: string, wd: number, we: number, cart: number) => prisma.teeTimeSchedule.create({ data: { courseId: c.id, productId, tierName: 'x', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: start, endTime: '19:00', intervalMinutes: 10, greenFeeWeekdayCents: wd, greenFeeWeekendCents: we, cartFeeCents: cart, active: true } });
  await sched(p18.id, '07:00', 6200, 7800, 2200); await sched(p18.id, '15:00', 4000, 4000, 2200); await sched(p9.id, '07:00', 3600, 4400, 1400);
  const list = await tierPriceList(c.id);
  const by = Object.fromEntries(list.lines.map(l => [l.key, l.publicCents]));
  ok('the price list: each round, weekday and weekend, green and cart, at the first price of the day', list.lines.length === 8 && by[`green:${p18.id}:wd`] === 6200 && by[`green:${p18.id}:we`] === 7800 && by[`cart:${p9.id}:wd`] === 1400 && by[`green:${p9.id}:we`] === 4400, list.lines);
  ok('…and only this course’s rounds may be priced', list.roundIds.length === 2 && list.roundIds.includes(p18.id));
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: c.id } });
  await prisma.courseProduct.deleteMany({ where: { courseId: c.id } });
  await prisma.course.delete({ where: { id: c.id } });
  await prisma.courseOperator.delete({ where: { id: op.id } });

  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\ntier-line-rates: all passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

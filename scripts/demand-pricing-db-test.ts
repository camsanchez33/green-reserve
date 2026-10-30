// PRICE-5 (Cam 2026-10-30: prices "based on their analytics … should adjust and not be
// stagnant"; either direction; suggest or automatic and floor/ceiling "course picks"; with a
// last-minute deal the golfer gets the lower one; online public rate only).
// Needs a database. Run: npx tsx scripts/demand-pricing-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { suggestPcts, demandPctAt, demandSeat, onlinePublicSeat, dealWins, demandSettingsError, refreshDemand, loadDemand, demandDue, dowOfDate } from '../src/lib/demand-pricing';
import { normalizeDbTeeTime } from '../src/lib/public-tee-times';
import { createCounterBooking } from '../src/lib/counter-pay';
import { moveBooking } from '../src/lib/move-booking';
import { setBookingResidents } from '../src/lib/booking-residents';
import { addDaysStr, todayIn } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'demandpricingdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.demandPrice.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  // Pure.
  const cells = [
    { dow: 6, hour: 8, sale: 100, booked: 90, dates: 8 },  // packed Saturday morning
    { dow: 2, hour: 14, sale: 100, booked: 10, dates: 8 }, // dead Tuesday afternoon
    { dow: 3, hour: 9, sale: 100, booked: 50, dates: 8 },  // ordinary
    { dow: 4, hour: 9, sale: 12, booked: 12, dates: 3 },   // too little history
  ];
  const s = suggestPcts(cells, new Map(), 80, 125, 56)!;
  const by = (d: number, h: number) => s.rows.find(r => r.dow === d && r.hour === h)!;
  ok('overall fill is worked out', s.courseFillPct === Math.round(162 / 312 * 100), s.courseFillPct);
  ok('a packed hour goes up, a dead one down, by at most 10 points a week', by(6, 8).suggestedPct === 10 && by(2, 14).suggestedPct === -10, s.rows);
  ok('…an ordinary hour stays near its rate, a thin one stays where it is', Math.abs(by(3, 9).suggestedPct) <= 5 && by(4, 9).suggestedPct === 0);
  const s2 = suggestPcts(cells, new Map([['6-8', 20], ['2-14', -15]]), 80, 125, 56)!;
  ok('…from where it is now, toward its target (+20 stays, −15 steps on to −20)', s2.rows.find(r => r.dow === 6)!.suggestedPct === 20 && s2.rows.find(r => r.dow === 2 && r.hour === 14)!.suggestedPct === -20, s2.rows);
  const s3 = suggestPcts(cells, new Map([['6-8', 5]]), 95, 110, 56)!;
  ok('…and never past the floor or ceiling', s3.rows.find(r => r.dow === 6)!.suggestedPct === 10 && s3.rows.find(r => r.dow === 2 && r.hour === 14)!.suggestedPct === -5, s3.rows);
  ok('too little history overall: no suggestions', suggestPcts(cells, new Map(), 80, 125, 20) === null);
  ok('settings are checked', !!demandSettingsError({ demandFloorPct: 40 }, { demandFloorPct: 80, demandCeilingPct: 125 }) && !!demandSettingsError({ demandCeilingPct: 90 }, { demandFloorPct: 80, demandCeilingPct: 125 }) && demandSettingsError({ demandFloorPct: 90, demandCeilingPct: 110 }, { demandFloorPct: 80, demandCeilingPct: 125 }) === null);
  ok('$50 +20% is $60, −10% is $45', demandSeat(20, 5000) === 6000 && demandSeat(-10, 5000) === 4500);
  ok('with a 20% deal: a +10% hour gets the deal ($40); a −30% hour gets $35, not both', onlinePublicSeat(5000, 20, 10) === 4000 && dealWins(5000, 20, 10) && onlinePublicSeat(5000, 20, -30) === 3500 && !dealWins(5000, 20, -30));
  ok('…with no deal, a +20% hour really costs $60', onlinePublicSeat(5000, 0, 20) === 6000 && onlinePublicSeat(5000, 0, 0) === 5000);
  const C = { demandMode: 'auto', demandFloorPct: 90, demandCeilingPct: 110 };
  const sat = { date: '2026-11-07', time: '08:10' };
  ok('the course\'s floor and ceiling hold on read; off means nothing', demandPctAt(C, new Map([['6-8', 25]]), sat) === 10 && demandPctAt({ ...C, demandMode: 'off' }, new Map([['6-8', 25]]), sat) === 0 && dowOfDate(sat.date) === 6);
  ok('a new table is listed for the launch wipe', (WIPED_TABLES as readonly string[]).includes('DemandPrice'));

  // The weekly refresh from the course's own last 8 weeks.
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Demand', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', demandMode: 'suggest' } });
  const today = todayIn('UTC');
  const past = [];
  for (let d = 1; d <= 56; d++) {
    const date = addDaysStr(today, -d);
    past.push({ courseId: c.id, date, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4 });
    past.push({ courseId: c.id, date, time: '15:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0 });
  }
  await prisma.teeTime.createMany({ data: past });
  ok('due: never worked out', (await demandDue()).some(x => x.id === c.id));
  ok('suggest: worked out, nothing applied', (await refreshDemand(c.id)) === 'suggested' && (await prisma.demandPrice.count({ where: { courseId: c.id, pct: { not: 0 } } })) === 0 && (await prisma.demandPrice.count({ where: { courseId: c.id, suggestedPct: { gt: 0 } } })) === 7);
  ok('…and not due again for a week', !(await demandDue()).some(x => x.id === c.id));
  await prisma.course.update({ where: { id: c.id }, data: { demandMode: 'auto' } });
  ok('automatic: the suggestions become the prices — 10 points this week', (await refreshDemand(c.id)) === 'applied' && (await prisma.demandPrice.count({ where: { courseId: c.id, hour: 8, pct: 10 } })) === 7 && (await prisma.demandPrice.count({ where: { courseId: c.id, hour: 15, pct: -10 } })) === 7);
  ok('…and 10 more the next', (await refreshDemand(c.id)) === 'applied' && (await prisma.demandPrice.count({ where: { courseId: c.id, hour: 8, pct: 20 } })) === 7 && (await prisma.demandPrice.count({ where: { courseId: c.id, hour: 15, pct: -20 } })) === 7);

  // Online prices.
  const course = await prisma.course.findUniqueOrThrow({ where: { id: c.id } });
  const demand = await loadDemand(course);
  const day = addDaysStr(today, 3);
  const am = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 8 } });
  const pm = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '15:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 8 } });
  const nAm = normalizeDbTeeTime(am, course, demand), nPm = normalizeDbTeeTime(pm, course, demand);
  ok('the golfer list: a busy hour $60, a slow one $40, neither shown as a deal', nAm.green_fee === 60 && nPm.green_fee === 40 && nAm.list_green_fee === null && nPm.deal_pct === 0, { nAm, nPm });
  ok('…off: the course\'s own $50', normalizeDbTeeTime(am, { ...course, demandMode: 'off' }, demand).green_fee === 50);

  // Counter bookings are never demand priced; an online booking moved gets the new time's.
  const cb = await createCounterBooking(c.id, { teeTimeId: am.id, golferName: 'Walk', players: 2 }, STAFF);
  ok('at the counter: $50 a player, no demand percent', cb.ok && cb.greenFeeTotal === 10000 && (await prisma.booking.findUniqueOrThrow({ where: { id: cb.id } })).demandPct === 0, cb);
  if (cb.ok) await moveBooking({ bookingId: cb.id, newTeeTimeId: pm.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  ok('…moved at the counter: still $50', cb.ok && (await prisma.booking.findUniqueOrThrow({ where: { id: cb.id } })).greenFeeTotal === 10000);
  const ob = await createCounterBooking(c.id, { teeTimeId: am.id, golferName: 'Online', players: 2 }, STAFF);
  if (ob.ok) {
    await prisma.booking.update({ where: { id: ob.id }, data: { source: 'online' } });
    await moveBooking({ bookingId: ob.id, newTeeTimeId: pm.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  }
  const obr = ob.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: ob.id } }) : null;
  ok('an online booking moved to the slow hour: $40 a player, −20% kept', obr?.greenFeeTotal === 8000 && obr.demandPct === -20, obr && { g: obr.greenFeeTotal, d: obr.demandPct });

  // A resident set on a demand-priced online booking never pays more than the strangers beside them.
  await prisma.teeTime.update({ where: { id: pm.id }, data: { residentRateCents: 4500 } });
  if (obr) {
    await prisma.booking.update({ where: { id: obr.id }, data: { paymentStatus: 'pending' } });
    const r = await setBookingResidents(c.id, obr.id, 1, STAFF);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: obr.id } });
    ok('a $45 resident on the −20% ($40) online group: capped at $40, the total unchanged', r.ok && after.greenFeeTotal === 8000 && after.residentPlayers === 1 && after.residentRateCents === 4000, { r, g: after.greenFeeTotal, rr: after.residentRateCents });
  }

  // Wiring.
  const swap = readFileSync('src/app/api/manage/[bookingId]/available-times/route.ts', 'utf8');
  ok('a golfer\'s own swap shows the price the move charges', swap.includes("onlinePublicSeat(t.greenFeeCents, dealPct(course, t, 'online'), demandPctAt(course, demand, t))"));
  const route = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  ok('online booking: the public seat is the lower of the deal and demand; member and resident seats capped at it', route.includes('onlinePublicSeat(teeTimeFull.greenFeeCents, lastMinutePct, demandPct)') && route.includes('Math.min(pubSeat, dealRateSeat(lastMinutePct, greenFeePerPlayerCents') && route.includes('Math.min(pubSeat, dealRateSeat(lastMinutePct, teeTimeFull.residentRateCents') && route.includes('publicGreen: pubSeat') && route.includes('...kept,'));
  const member = readFileSync('src/app/api/member/[courseSlug]/tee-times/route.ts', 'utf8');
  ok('the member list prices as the booking does', member.includes('onlinePublicSeat(t.greenFeeCents, pct, dem)') && member.includes('Math.min(pub, dealRateSeat('));
  ok('the resident-rate check too', readFileSync('src/app/api/bookings/resident-rate/route.ts', 'utf8').includes('Math.min(pub, dealRateSeat('));
  const counter = readFileSync('src/lib/counter-pay.ts', 'utf8');
  ok('counter pricing never reads demand', !/demand/i.test(counter));
  ok('the daily cron works out the weekly suggestions', readFileSync('src/app/api/cron/generate-tee-times/route.ts', 'utf8').includes('refreshDemand(c.id)'));
  const api = readFileSync('src/app/api/operator/demand-pricing/route.ts', 'utf8');
  ok('the settings: schedule.view to read, schedule.edit to change', api.includes("gate('schedule.view')") && (api.match(/gate\('schedule\.edit'\)/g) ?? []).length === 2);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('demand-pricing-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

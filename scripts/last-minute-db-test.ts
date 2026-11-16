// PRICE-2 (Cam 2026-10-30: "Last-minute deals" — who gets it and stacking "up to course";
// the old price struck through): an open tee time inside the course's window costs N%
// less, priced seat by seat, online always and at the counter when the course says so.
// RETIRED (Cam 2026-11-16, Schedule approved): no new price takes a deal, anywhere; a booking
// already made at a deal price keeps it.
// Needs a database. Run: npx tsx scripts/last-minute-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { dealPct, dealSeat, dealRateSeat, DEALS_RETIRED } from '../src/lib/last-minute';
import { createCounterBooking } from '../src/lib/counter-pay';
import { moveBooking } from '../src/lib/move-booking';
import { setBookingResidents } from '../src/lib/booking-residents';
import { normalizeDbTeeTime } from '../src/lib/public-tee-times';
import { addDaysStr, todayIn } from '../src/lib/course-time';

const TAG = 'lastminutedbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.promoCode.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

const at = (ms: number) => { const d = new Date(Date.now() + ms); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };

(async () => {
  await cleanup();
  // A course whose deal was left switched on before it was retired: 20% off inside 3 hours, at the counter too.
  const on = { lastMinuteOn: true, lastMinuteHours: 3, lastMinutePct: 20, lastMinuteCounter: true, lastMinuteStack: true, timezone: 'UTC' };
  const soon = at(2 * 3_600_000);
  ok('retired: a deal left on gives nothing, online or at the counter', DEALS_RETIRED && dealPct(on, soon, 'online') === 0 && dealPct(on, soon, 'counter') === 0);
  ok('the seat math stays, for bookings already made at a deal price', dealSeat(20, 5000) === 4000 && dealRateSeat(20, 3000, 5000, false) === 3000 && dealRateSeat(20, 3000, 5000, true) === 2400);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { hasMemberPricing: true, hasResidentPricing: true, name: 'Last minute', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, ...on } });
  const slot = await prisma.teeTime.create({ data: { courseId: c.id, ...soon, holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 40, residentRateCents: 3000 } });
  const far = await prisma.teeTime.create({ data: { courseId: c.id, date: addDaysStr(todayIn('UTC'), 3), time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 8 } });

  const pub = normalizeDbTeeTime(slot, c);
  ok('the golfer list inside the old window: $50, nothing struck through', pub.green_fee === 50 && pub.list_green_fee === null && pub.deal_pct === 0, pub);

  const two = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Two', players: 2, cartSelected: true }, STAFF);
  const row = two.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: two.id } }) : null;
  ok('a new counter booking: $100 green, no deal on the booking', row?.greenFeeTotal === 10000 && row.lastMinutePct === 0, { two, row });
  const res = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Res', players: 2, rate: 'resident' }, STAFF);
  ok('residents pay their own $30, no stacked deal', res.ok && res.greenFeeTotal === 2 * 3000, res);
  const cb = await createCounterBooking(c.id, { teeTimeId: far.id, golferName: 'Phone', players: 1 }, STAFF);
  if (cb.ok) { await prisma.booking.update({ where: { id: cb.id }, data: { source: 'online' } }); await moveBooking({ bookingId: cb.id, newTeeTimeId: slot.id, courseId: c.id, pricing: 'new_slot', actor: STAFF }); }
  const cbr = cb.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: cb.id } }) : null;
  ok('an online booking repriced onto the old window: $50, no deal', cbr?.greenFeeTotal === 5000 && cbr.lastMinutePct === 0, cbr);

  // Golfers who already booked at a deal price keep it. Made as the old code stored it: 20%, $40 a seat.
  const dealt = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Dealt', players: 2 }, STAFF);
  if (dealt.ok) await prisma.booking.update({ where: { id: dealt.id }, data: { lastMinutePct: 20, greenFeeTotal: 8000, totalAmount: 8000 } });
  if (dealt.ok) await setBookingResidents(c.id, dealt.id, 1, STAFF);
  const dr = dealt.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: dealt.id } }) : null;
  ok('a booking made at a deal price, one resident set later: the deal still off their $30 (stacking was on) + the guest still $40', dr?.greenFeeTotal === 2400 + 4000 && dr.lastMinutePct === 20, dr && { g: dr.greenFeeTotal, p: dr.lastMinutePct });
  const kept = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Keep', players: 1 }, STAFF);
  if (kept.ok) await prisma.booking.update({ where: { id: kept.id }, data: { lastMinutePct: 20, greenFeeTotal: 4000, totalAmount: 4000 } });
  if (kept.ok) await moveBooking({ bookingId: kept.id, newTeeTimeId: far.id, courseId: c.id, pricing: 'keep', actor: STAFF });
  const kr = kept.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: kept.id } }) : null;
  ok('…moved keeping the price: still $40 and the deal on record', kr?.greenFeeTotal === 4000 && kr.lastMinutePct === 20, kr);

  // Wiring: every price path still goes through dealPct, so the one switch covers them all.
  for (const f of ['src/app/api/bookings/route.ts', 'src/app/api/bookings/resident-rate/route.ts', 'src/app/api/member/[courseSlug]/tee-times/route.ts', 'src/app/api/manage/[bookingId]/available-times/route.ts', 'src/lib/public-tee-times.ts', 'src/lib/move-booking.ts', 'src/lib/counter-pay.ts'])
    ok(`${f} prices deals only through dealPct`, readFileSync(f, 'utf8').includes('dealPct('));
  const route = readFileSync('src/app/api/operator/last-minute/route.ts', 'utf8');
  ok('the setting can no longer be changed: schedule.edit, then 410', route.includes("gate('schedule.edit')") && route.includes('status: 410') && !route.includes('prisma.course.update'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('last-minute-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

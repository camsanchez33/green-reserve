// PRICE-2 (Cam 2026-10-30: "Last-minute deals" — who gets it and stacking "up to course";
// the old price struck through): an open tee time inside the course's window costs N%
// less, priced seat by seat, online always and at the counter when the course says so.
// Needs a database. Run: npx tsx scripts/last-minute-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { dealPct, dealSeat, dealRateSeat, dealSettingsError } from '../src/lib/last-minute';
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
  const on = { lastMinuteOn: true, lastMinuteHours: 3, lastMinutePct: 20, lastMinuteCounter: false, lastMinuteStack: false, timezone: 'UTC' };
  const soon = at(2 * 3_600_000), later = at(5 * 3_600_000), gone = at(-60_000);
  ok('inside the window: 20% off', dealPct(on, soon, 'online') === 20);
  ok('outside it, after it has gone off, or turned off: nothing', dealPct(on, later, 'online') === 0 && dealPct(on, gone, 'online') === 0 && dealPct({ ...on, lastMinuteOn: false }, soon, 'online') === 0);
  ok('at the counter only when the course says so', dealPct(on, soon, 'counter') === 0 && dealPct({ ...on, lastMinuteCounter: true }, soon, 'counter') === 20);
  ok('$50 at 20% is $40', dealSeat(20, 5000) === 4000 && dealSeat(0, 5000) === 5000);
  ok('a $30 resident rate: best price keeps $30; stacking makes it $24', dealRateSeat(20, 3000, 5000, false) === 3000 && dealRateSeat(20, 3000, 5000, true) === 2400);
  ok('a $45 member rate: best price is the $40 deal', dealRateSeat(20, 4500, 5000, false) === 4000);
  ok('settings are checked: 1–48 hours, 1–90%', !!dealSettingsError({ lastMinuteHours: 0 }) && !!dealSettingsError({ lastMinutePct: 95 }) && dealSettingsError({ lastMinuteHours: 6, lastMinutePct: 25 }) === null);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Last minute', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, ...on, lastMinuteCounter: true } });
  const slot = await prisma.teeTime.create({ data: { courseId: c.id, ...soon, holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 40, residentRateCents: 3000 } });
  const far = await prisma.teeTime.create({ data: { courseId: c.id, date: addDaysStr(todayIn('UTC'), 3), time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 8 } });

  const pub = normalizeDbTeeTime(slot, c);
  ok('the golfer list shows $40 with $50 struck through', pub.green_fee === 40 && pub.list_green_fee === 50 && pub.deal_pct === 20, pub);
  ok('…and a time outside the window just $50', normalizeDbTeeTime(far, c).list_green_fee === null && normalizeDbTeeTime(far, c).green_fee === 50);

  const two = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Two', players: 2, cartSelected: true }, STAFF);
  const row = two.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: two.id } }) : null;
  ok('two at the counter: $80 green, the cart untouched, 20% kept on the booking', row?.greenFeeTotal === 8000 && row.cartFeeTotal === 4000 && row.lastMinutePct === 20, { two, row });
  await prisma.course.update({ where: { id: c.id }, data: { lastMinuteCounter: false } });
  const full = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Full', players: 1 }, STAFF);
  ok('counter switched off: full price at the counter', full.ok && full.greenFeeTotal === 5000, full);
  await prisma.course.update({ where: { id: c.id }, data: { lastMinuteCounter: true } });

  const res = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Res', players: 1, rate: 'resident' }, STAFF);
  ok('a resident, best price: their $30', res.ok && res.greenFeeTotal === 3000, res);
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', greenFeeWeekdayCents: 2500, greenFeeWeekendCents: 2500, guestsPayMemberRate: false } });
  const mem = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Mem', inviteEmail: `${TAG}+mem@t.local`, status: 'active' } });
  const mb = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Mem', players: 2, rate: `member:${mem.id}` }, STAFF);
  ok('a member and a guest, best price: $25 + $40', mb.ok && mb.greenFeeTotal === 2500 + 4000, mb);
  await prisma.course.update({ where: { id: c.id }, data: { lastMinuteStack: true } });
  const ms = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Mem', players: 2, rate: `member:${mem.id}` }, STAFF);
  const msr = ms.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: ms.id } }) : null;
  ok('stacking: the deal comes off the member rate too — $20 + $40, the member\'s seat stored at $20', ms.ok && ms.greenFeeTotal === 2000 + 4000 && msr?.memberRateCents === 2000, { ms, m: msr?.memberRateCents });
  const rs = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Res', players: 2, rate: 'resident' }, STAFF);
  ok('stacking: two residents at the counter pay $24 each', rs.ok && rs.greenFeeTotal === 2 * 2400, rs);
  await prisma.course.update({ where: { id: c.id }, data: { lastMinuteStack: false } });

  await prisma.promoCode.create({ data: { courseId: c.id, code: 'HALF', kind: 'percent', value: 50 } });
  const pr = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Promo', players: 2, promoCode: 'HALF' }, STAFF);
  const prr = pr.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: pr.id } }) : null;
  ok('a promo code comes off the deal price: half of $40 × 2', prr?.greenFeeTotal === 4000 && prr.promoDiscountCents === 4000, prr);

  if (two.ok) await moveBooking({ bookingId: two.id, newTeeTimeId: far.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  const moved = two.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: two.id } }) : null;
  ok('moved and repriced to a time outside the window: full price, no deal', moved?.greenFeeTotal === 10000 && moved.lastMinutePct === 0, moved);
  const kept = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Keep', players: 1 }, STAFF);
  if (kept.ok) await moveBooking({ bookingId: kept.id, newTeeTimeId: far.id, courseId: c.id, pricing: 'keep', actor: STAFF });
  const kr = kept.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: kept.id } }) : null;
  ok('moved keeping the price: still $40 and the deal on record', kr?.greenFeeTotal === 4000 && kr.lastMinutePct === 20, kr);

  // Residents set at the counter keep the deal (review BLOCK 2): best price = min($30, $40).
  const grp = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Grp', players: 2 }, STAFF);
  if (grp.ok) await setBookingResidents(c.id, grp.id, 1, STAFF);
  const gr = grp.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: grp.id } }) : null;
  ok('one resident set on a deal booking: $30 + $40', gr?.greenFeeTotal === 3000 + 4000 && gr.residentRateCents === 3000, gr);
  // A counter booking repriced onto a deal time gets it only when the counter does (review BLOCK 4).
  await prisma.course.update({ where: { id: c.id }, data: { lastMinuteCounter: false } });
  const cb = await createCounterBooking(c.id, { teeTimeId: far.id, golferName: 'Phone', players: 1 }, STAFF);
  if (cb.ok) await moveBooking({ bookingId: cb.id, newTeeTimeId: slot.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  const cbr = cb.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: cb.id } }) : null;
  ok('counter switched off: a counter booking moved onto a deal time pays $50', cbr?.greenFeeTotal === 5000 && cbr.lastMinutePct === 0, cbr);
  await prisma.course.update({ where: { id: c.id }, data: { lastMinuteCounter: true } });

  // Wiring.
  const book = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  ok('online: priced on the server from the course\'s deal', book.includes("dealPct(teeTimeFull.course, teeTimeFull, 'online')") && book.includes('lastMinutePct,'));
  const preview = readFileSync('src/app/api/bookings/resident-rate/route.ts', 'utf8');
  ok('the member and resident rate shown before booking is the deal-priced one', preview.includes("dealPct(tt.course, tt, 'online')") && preview.includes('rated(rates.greenFeeCents)') && preview.includes('rated(tt.residentRateCents)'));
  const portal = readFileSync('src/app/api/member/[courseSlug]/tee-times/route.ts', 'utf8');
  ok('the member portal list shows the deal-priced public, member and resident prices (review BLOCK 3)', portal.includes("dealPct(course, t, 'online')") && portal.includes('rated(rates.greenFeeCents)') && portal.includes('rated(t.residentRateCents)') && portal.includes('list_green_fee'));
  const route = readFileSync('src/app/api/operator/last-minute/route.ts', 'utf8');
  ok('changing the deal needs schedule.edit, this course only', route.includes("gate('schedule.edit')") && route.includes('where: { id: g.session.courseId }'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('last-minute-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

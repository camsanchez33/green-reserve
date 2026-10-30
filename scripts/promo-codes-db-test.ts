// PRICE-1 (Cam 2026-10-30: "Promo codes"; stacking "Course decides per code"): codes take
// money off the green fee, within their limits, once each, and never on a member or
// resident rate unless the code says so. Needs a database. Run: npx tsx scripts/promo-codes-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { promoDiscount, seatAfter, promoFits, applyPromo, reserveUse, releaseUse, readPromo, type PromoRow } from '../src/lib/promo-codes';
import { partyFees } from '../src/lib/member-rates';
import { changePartySize } from '../src/lib/change-party';
import { setBookingResidents } from '../src/lib/booking-residents';
import { moveBooking } from '../src/lib/move-booking';
import { createCounterBooking } from '../src/lib/counter-pay';
import { addDaysStr, todayIn } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'promocodesdbtest';
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

const route2 = () => readFileSync('src/app/api/operator/promo-codes/route.ts', 'utf8');

(async () => {
  await cleanup();
  const base: PromoRow = { id: 'x', code: 'FALL20', kind: 'percent', value: 20, startsOn: null, endsOn: null, days: [], fromTime: null, toTime: null, maxUses: null, usesCount: 0, onePerGolfer: false, withRates: false, active: true };
  ok('20% off two $50 players is $20', promoDiscount(base, 5000, 2) === 2000);
  ok('$10 off a player; a seat never goes below $0', seatAfter({ kind: 'amount', value: 1000 }, 5000) === 4000 && seatAfter({ kind: 'amount', value: 9000 }, 5000) === 0);
  const tt = { date: '2031-05-13', time: '15:30' }; // a Tuesday
  ok('a code fits inside its dates, days and times', promoFits({ ...base, startsOn: '2031-05-01', endsOn: '2031-05-31', days: [2], fromTime: '14:00', toTime: '18:00' }, tt, { rateApplied: false }) === null);
  ok('…not outside them', !!promoFits({ ...base, days: [6] }, tt, { rateApplied: false }) && !!promoFits({ ...base, toTime: '15:00' }, tt, { rateApplied: false }) && !!promoFits({ ...base, endsOn: '2031-05-01' }, tt, { rateApplied: false }));
  ok('…nor used up, nor turned off', !!promoFits({ ...base, maxUses: 3, usesCount: 3 }, tt, { rateApplied: false }) && !!promoFits({ ...base, active: false }, tt, { rateApplied: false }));
  ok('a member or resident rate refuses a code unless it works with rates (the course decides)', /member, resident/.test(promoFits(base, tt, { rateApplied: true }) ?? '') && promoFits({ ...base, withRates: true }, tt, { rateApplied: true }) === null);
  ok('a code from Settings is checked', readPromo({ code: 'ab', kind: 'percent', value: 10 }).ok === false && readPromo({ code: 'fall 20', kind: 'percent', value: 120 }).ok === false && readPromo({ code: 'fall-20', kind: 'amount', value: 500 }).ok === true);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Promo ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const c = await mk('a'), other = await mk('b');
  const day = addDaysStr(todayIn('UTC'), 3);
  const slot = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 8, residentRateCents: 3000 } });
  const one = await prisma.promoCode.create({ data: { courseId: c.id, code: 'ONCE', kind: 'percent', value: 50, maxUses: 1, onePerGolfer: true } });
  await prisma.promoCode.create({ data: { courseId: other.id, code: 'THEIRS', kind: 'percent', value: 50 } });

  ok('another course\'s code is "not valid here"', !(await applyPromo(c.id, 'THEIRS', { ...slot, rateApplied: false })).ok);
  ok('codes are not case sensitive', (await applyPromo(c.id, ' once ', { ...slot, rateApplied: false })).ok);

  // The counter: 2 players at $50, half off the green fee; the cart is untouched.
  const made = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Pat Promo', golferEmail: `${TAG}+pat@t.local`, players: 2, cartSelected: true, promoCode: 'once' }, STAFF);
  const row = made.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: made.id } }) : null;
  ok('a code at the counter takes half off the green fee only', !!row && row.greenFeeTotal === 5000 && row.cartFeeTotal === 4000 && row.promoDiscountCents === 5000 && row.promoCodeId === one.id && row.totalAmount === 9000, { made, row });
  ok('…and uses it up', (await prisma.promoCode.findUniqueOrThrow({ where: { id: one.id } })).usesCount === 1);
  const again = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Lee', players: 1, promoCode: 'ONCE' }, STAFF);
  ok('a used-up code is refused, and nothing is booked', !again.ok && /used up/.test(again.error), again);
  await prisma.promoCode.update({ where: { id: one.id }, data: { maxUses: null } });
  const twice = await applyPromo(c.id, 'ONCE', { ...slot, rateApplied: false, golferEmail: `${TAG}+PAT@t.local` });
  ok('once per golfer: the same golfer can\'t use it again', !twice.ok && /already used/.test(twice.error), twice);
  const resident = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Res', players: 1, rate: 'resident', promoCode: 'ONCE' }, STAFF);
  ok('a resident rate refuses a code that doesn\'t work with rates', !resident.ok && /member, resident/.test(resident.error), resident);

  // Seat by seat: the discount stays through part of a group checking in and a party change (review BLOCK 1–2).
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', greenFeeWeekdayCents: 2500, greenFeeWeekendCents: 2500, guestsPayMemberRate: false } });
  const half = await prisma.promoCode.create({ data: { courseId: c.id, code: 'HALF', kind: 'percent', value: 50, withRates: true } });
  const pat = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Mem', inviteEmail: `${TAG}+mem@t.local`, status: 'active' } });
  const mb = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Mem', players: 2, rate: `member:${pat.id}`, promoCode: 'HALF' }, STAFF);
  const mrow = mb.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: mb.id } }) : null;
  ok('a member with a guest and a 50% code: $12.50 + $25, the member\'s own seat stored discounted', !!mrow && mrow.greenFeeTotal === 3750 && mrow.memberRateCents === 1250 && mrow.promoDiscountCents === 3750, { mb, mrow });
  ok('…the member alone checking in pays their discounted seat', !!mrow && partyFees(mrow, 1, { greenFeeCents: 5000, cartFeeCents: 0 }).greenFeeTotal === 1250);
  if (mrow) await changePartySize(mrow.id, 3, { by: 'staff', courseId: c.id, actor: STAFF });
  const m3 = mrow ? await prisma.booking.findUniqueOrThrow({ where: { id: mrow.id } }) : null;
  ok('…a third player is added at the guests\' discounted price', m3?.greenFeeTotal === 1250 + 2 * 2500, m3?.greenFeeTotal);
  const rb = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Res', players: 2, promoCode: 'HALF' }, STAFF);
  if (rb.ok) await setBookingResidents(c.id, rb.id, 1, STAFF);
  const rrow = rb.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: rb.id } }) : null;
  ok('residents set at the counter keep the code: $15 + $25', rrow?.greenFeeTotal === 1500 + 2500, rrow);

  // A move to a time the code doesn't fit takes the code off; one it fits keeps it (review BLOCK 5).
  const evening = await prisma.promoCode.create({ data: { courseId: c.id, code: 'EARLY', kind: 'percent', value: 20, toTime: '12:00' } });
  const late = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '15:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 8 } });
  const eb = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Early', players: 1, promoCode: 'EARLY' }, STAFF);
  ok('a morning code: $40', eb.ok && eb.greenFeeTotal === 4000, eb);
  if (eb.ok) await moveBooking({ bookingId: eb.id, newTeeTimeId: late.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  const moved = eb.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: eb.id } }) : null;
  ok('…moved and repriced to the afternoon, the code comes off: $50 and no code', moved?.greenFeeTotal === 5000 && moved.promoCodeId === null && moved.promoDiscountCents === 0, moved);
  void evening;

  // Uses never go over the limit, even at once.
  const race = await prisma.promoCode.create({ data: { courseId: c.id, code: 'RACE', kind: 'percent', value: 10, maxUses: 2 } });
  const got = await Promise.all([1, 2, 3, 4, 5].map(() => reserveUse(race.id)));
  ok('five at once on a 2-use code: exactly two get it', got.filter(Boolean).length === 2 && (await prisma.promoCode.findUniqueOrThrow({ where: { id: race.id } })).usesCount === 2);
  await releaseUse(race.id);
  ok('a use given back is free again', (await prisma.promoCode.findUniqueOrThrow({ where: { id: race.id } })).usesCount === 1);

  // Wiring.
  const book = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  ok('online: the code is checked before any card is saved, and the use given back if the booking isn\'t made', book.indexOf('applyPromo(') < book.indexOf('stripe.setupIntents.retrieve') && /catch \(err\) \{\n    if \(promo\) await releaseUse/.test(book) && /releaseUnpaidBooking\(claimed\.id\);\n      if \(promo\) await releaseUse/.test(book));
  ok('…and priced on the server, seat by seat', book.includes('seat(greenFeePerPlayerCents)') && book.includes('memberSpot(appliedTier, { greenFeeCents: seat(greenFeePerPlayerCents)'));
  const client = readFileSync('src/app/book/BookClient.tsx', 'utf8');
  ok('the wallet button sends the code it shows (no stale render)', client.includes('latest.current.promoCode ? { promoCode: latest.current.promoCode }'));
  ok('an edit never turns a code back on', route2().includes('const { code: _c, active: _a, ...data } = r.data;'));
  const check = readFileSync('src/app/api/promo/check/route.ts', 'utf8');
  ok('the public check is rate limited and never says a code exists at another course', check.includes('rateLimit(`promo-check:') && check.includes('courseId_code: { courseId: tt.courseId'));
  const route = route2();
  ok('making codes needs schedule.edit, this course only', route.includes("gate('schedule.edit')") && route.includes('courseId: g.session.courseId'));
  ok('codes are cleared by the launch wipe', WIPED_TABLES.includes('PromoCode'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('promo-codes-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

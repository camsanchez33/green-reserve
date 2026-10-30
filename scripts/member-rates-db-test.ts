// Cam 2026-10-29 (Revamp 3 audit, fixes 1–3, "up to course"):
//  1. a member's booking gives the member rate to the member only, unless the tier
//     says guests pay it too;
//  2. member rates end the day after a membership's end date, plus the course's
//     grace days;
//  3. a new member's first dues payment pays one term from today, not two.
// Real database. Run: npx tsx scripts/member-rates-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { counterDueCents } from '../src/lib/counter-pay';
import { liveMembershipWhere, membershipLive, memberPlayers, splitTotal, partyFees, memberSpot } from '../src/lib/member-rates';
import { cartAddOnCentsFor } from '../src/lib/checkin-booking';

const TAG = 'memberratestest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const DAY = 86_400_000;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  await cleanup();
  // 1. Who pays the member rate.
  ok('the member alone gets the member rate by default', memberPlayers(4, { guestsPayMemberRate: false }) === 1 && splitTotal(4, 1, 3000, 5000) === 3000 + 3 * 5000);
  ok('a tier with guests at the member rate covers the whole group', memberPlayers(4, { guestsPayMemberRate: true }) === 4 && splitTotal(4, 4, 3000, 5000) === 12000);
  ok('no tier, no member players', memberPlayers(3, null) === 0);

  // 2. When rates end — in the course's own timezone.
  const R0 = { memberGraceDays: 0, timezone: 'America/New_York' };
  const R7 = { memberGraceDays: 7, timezone: 'America/New_York' };
  const endsToday = new Date('2026-10-29T00:00:00Z');
  ok('the whole end date is a member day in the course\'s evening too', membershipLive({ status: 'active', expiresAt: endsToday }, R0, new Date('2026-10-30T03:30:00Z')) && membershipLive({ status: 'active', expiresAt: endsToday }, { memberGraceDays: 0, timezone: 'America/Los_Angeles' }, new Date('2026-10-30T06:30:00Z')));
  ok('…and ends at the course\'s midnight', !membershipLive({ status: 'active', expiresAt: endsToday }, R0, new Date('2026-10-30T04:30:00Z')));
  const now = new Date('2026-10-29T15:00:00Z');
  const endedYesterday = new Date('2026-10-28T00:00:00Z');
  const endedLastWeek = new Date(now.getTime() - 9 * DAY);
  ok('no end date never lapses', membershipLive({ status: 'active', expiresAt: null }, R0, now));
  ok('the end date itself is still a member day', membershipLive({ status: 'active', expiresAt: new Date('2026-10-29T00:00:00Z') }, R0, now));
  ok('the day after the end date, public rates', !membershipLive({ status: 'active', expiresAt: endedYesterday }, R0, now));
  ok('…unless the course keeps rates a few days', membershipLive({ status: 'active', expiresAt: endedYesterday }, R7, now) && !membershipLive({ status: 'active', expiresAt: endedLastWeek }, R7, now));
  ok('an inactive membership never gets rates', !membershipLive({ status: 'inactive', expiresAt: null }, R0, now));

  // 3. A member's group keeps the split when its size changes or part of it shows.
  // Tier $30 green / $10 cart, public $50 / $20; a member books 4 → 30 + 3×50, 10 + 3×20.
  const pub = { greenFeeCents: 5000, cartFeeCents: 2000 };
  const spot = memberSpot({ guestsPayMemberRate: false }, { greenFeeCents: 3000, cartFeeCents: 1000 });
  const four = { players: 4, greenFeeTotal: 3000 + 3 * 5000, cartFeeTotal: 1000 + 3 * 2000, residentPlayers: 0, residentRateCents: null, ...spot };
  const one = partyFees(four, 1, pub), two = partyFees(four, 2, pub);
  ok('down to 1: the member alone', one.greenFeeTotal === 3000 && one.cartFeeTotal === 1000, one);
  ok('2 of 4 show: the member and one guest', two.greenFeeTotal === 3000 + 5000 && two.cartFeeTotal === 1000 + 2000, two);
  const pair = { players: 2, greenFeeTotal: 8000, cartFeeTotal: 0, residentPlayers: 0, residentRateCents: null, ...spot };
  ok('2 up to 4: the new players are guests', partyFees(pair, 4, pub).greenFeeTotal === 3000 + 3 * 5000 && partyFees(pair, 4, pub).cartFeeTotal === 0);
  const solo = { players: 1, greenFeeTotal: 3000, cartFeeTotal: 1000, residentPlayers: 0, residentRateCents: null, ...spot };
  ok('a member alone adding guests: guests at the public price', partyFees(solo, 3, pub).greenFeeTotal === 3000 + 2 * 5000 && partyFees(solo, 3, pub).cartFeeTotal === 1000 + 2 * 2000);
  const all = { players: 4, greenFeeTotal: 12000, cartFeeTotal: 4000, residentPlayers: 0, residentRateCents: null, ...memberSpot({ guestsPayMemberRate: true }, { greenFeeCents: 3000, cartFeeCents: 1000 }) };
  ok('guests at the member rate: plain per player', all.memberRateCents === null && partyFees(all, 2, pub).greenFeeTotal === 6000 && partyFees(all, 2, pub).cartFeeTotal === 2000);
  const res = { players: 4, greenFeeTotal: 2500 + 3 * 5000, cartFeeTotal: 0, residentPlayers: 1, residentRateCents: 2500, memberRateCents: null, memberCartCents: null };
  ok('residents still counted first', partyFees(res, 2, pub).greenFeeTotal === 2500 + 5000);
  // The counter (and the close-out, which re-reads it) keeps range balls whole on a partial party, as card check-in does.
  const counterB = { ...four, totalAmount: 25000 + 800 + 600, accessFeeTotal: 600, rangeBallsTotal: 800, shopTotalCents: 0, shopTaxCents: 0 };
  ok('counter: 2 of a member\'s 4 pay the member spot + a guest, range balls whole', counterDueCents(counterB, 2) === 3000 + 5000 + 1000 + 2000 + 800, counterDueCents(counterB, 2));
  ok('…and the whole group pays the round less the booking fee', counterDueCents(counterB) === 25800);

  const op = await prisma.courseOperator.create({ data: { name: 'Rates Test', email: `${TAG}@t.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Rates GC', slug: `${TAG}-1`, operatorId: op.id, address: 'a', city: 'c', state: 'NY', zipCode: '1', memberGraceDays: 0 } });
  const tier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Full', cartFeeWeekdayCents: 1000, greenFeeWeekdayCents: 3000 } });
  const mk = (email: string, expiresAt: Date | null) => prisma.courseMembership.create({ data: { courseId: course.id, tierId: tier.id, inviteEmail: email, status: 'active', expiresAt } });
  await mk(`${TAG}+live@t.local`, null);
  await mk(`${TAG}+lapsed@t.local`, endedLastWeek);
  const liveRows = await prisma.courseMembership.findMany({ where: { courseId: course.id, ...liveMembershipWhere(R0, now) }, select: { inviteEmail: true } });
  ok('the database filter agrees with the rule', liveRows.length === 1 && liveRows[0].inviteEmail === `${TAG}+live@t.local`, liveRows);

  // A cart added at check-in: a weekday booking of 4, public cart $20, member cart $10.
  const b = (email: string) => ({ golferAccountId: null, golferEmail: email, courseId: course.id, players: 4, cartSelected: false, cartFeeTotal: 0, paymentStatus: 'card_on_file', roundPaymentIntentId: '', teeTime: { date: '2026-11-04', cartFeeCents: 2000 } });
  ok('check-in cart: the member at the member price, guests at the public price', (await cartAddOnCentsFor(b(`${TAG}+live@t.local`))) === 1000 + 3 * 2000);
  ok('…a lapsed member pays the public price for all', (await cartAddOnCentsFor(b(`${TAG}+lapsed@t.local`))) === 4 * 2000);
  await prisma.membershipTier.update({ where: { id: tier.id }, data: { guestsPayMemberRate: true } });
  ok('…and a tier with guests at the member rate covers everyone', (await cartAddOnCentsFor(b(`${TAG}+live@t.local`))) === 4 * 1000);

  // Every place that prices a member uses the same rules.
  ok('party size, partial check-in and cash use partyFees', ['src/lib/change-party.ts', 'src/lib/checkin-booking.ts', 'src/lib/counter-pay.ts', 'src/app/manage/[bookingId]/page.tsx', 'src/app/dashboard/page.tsx'].every(f => readFileSync(f, 'utf8').includes('partyFees(')));
  ok('booking and moves store the member spot', readFileSync('src/app/api/bookings/route.ts', 'utf8').includes(': memberSpot(appliedTier, { greenFeeCents: seat(ownSeat)') && readFileSync('src/lib/move-booking.ts', 'utf8').includes('data.memberRateCents = spot.memberRateCents'));
  const src = (f: string) => readFileSync(f, 'utf8');
  ok('booking charges the split and checks the end date', src('src/app/api/bookings/route.ts').includes('splitTotal(players, memberN, ownSeat, pubSeat)') && src('src/app/api/bookings/route.ts').includes('membershipLive(membership, teeTimeFull.course)') && src('src/app/api/bookings/route.ts').includes('getGolferMembership(teeTimeFull.courseId, teeTimeFull.course)'));
  ok('the member portal shows the same split and window', src('src/app/api/member/[courseSlug]/tee-times/route.ts').includes('membershipLive(membership, course)') && src('src/app/courses/[slug]/member/page.tsx').includes('splitTotal(players, t.guests_member_rate ? players : Math.min(1, players)'));
  ok('the booking page shows a signed-in member their own rate', src('src/app/api/bookings/resident-rate/route.ts').includes('guestsMemberRate: tier.guestsPayMemberRate') && src('src/app/book/BookClient.tsx').includes('splitTotal(players, memberN, c(memberRate.greenFee), c(teeTime.green_fee))'));
  ok("a golfer's own swap reprices the same way", src('src/lib/move-booking.ts').includes('memberPlayers(b.players, tier)'));

  // 3. First dues payment starts today; only a renewal extends from the end date.
  for (const f of ['src/app/api/membership/[id]/route.ts', 'src/app/api/operator/members/route.ts']) {
    ok(`${f.split('/api/')[1]}: a first payment is one term from today`, /lastPaidAt && [\w.]*expiresAt && [\w.]*expiresAt\.getTime\(\) > Date\.now\(\)/.test(src(f)));
  }

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`member-rates: ${failed} failed`); process.exit(1); }
  console.log('member-rates: all passed');
})();

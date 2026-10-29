// Cam 2026-10-29 (Revamp 3 audit, fixes 1–3, "up to course"):
//  1. a member's booking gives the member rate to the member only, unless the tier
//     says guests pay it too;
//  2. member rates end the day after a membership's end date, plus the course's
//     grace days;
//  3. a new member's first dues payment pays one term from today, not two.
// Real database. Run: npx tsx scripts/member-rates-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { liveMembershipWhere, membershipLive, memberPlayers, splitTotal } from '../src/lib/member-rates';
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

  // 2. When rates end.
  const now = new Date('2026-10-29T15:00:00Z');
  const endedYesterday = new Date('2026-10-28T00:00:00Z');
  const endedLastWeek = new Date(now.getTime() - 9 * DAY);
  ok('no end date never lapses', membershipLive({ status: 'active', expiresAt: null }, 0, now));
  ok('the end date itself is still a member day', membershipLive({ status: 'active', expiresAt: new Date('2026-10-29T00:00:00Z') }, 0, now));
  ok('the day after the end date, public rates', !membershipLive({ status: 'active', expiresAt: endedYesterday }, 0, now));
  ok('…unless the course keeps rates a few days', membershipLive({ status: 'active', expiresAt: endedYesterday }, 7, now) && !membershipLive({ status: 'active', expiresAt: endedLastWeek }, 7, now));
  ok('an inactive membership never gets rates', !membershipLive({ status: 'inactive', expiresAt: null }, 0, now));

  const op = await prisma.courseOperator.create({ data: { name: 'Rates Test', email: `${TAG}@t.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Rates GC', slug: `${TAG}-1`, operatorId: op.id, address: 'a', city: 'c', state: 'NY', zipCode: '1', memberGraceDays: 0 } });
  const tier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Full', cartFeeWeekdayCents: 1000, greenFeeWeekdayCents: 3000 } });
  const mk = (email: string, expiresAt: Date | null) => prisma.courseMembership.create({ data: { courseId: course.id, tierId: tier.id, inviteEmail: email, status: 'active', expiresAt } });
  await mk(`${TAG}+live@t.local`, null);
  await mk(`${TAG}+lapsed@t.local`, endedLastWeek);
  const liveRows = await prisma.courseMembership.findMany({ where: { courseId: course.id, ...liveMembershipWhere(0, now) }, select: { inviteEmail: true } });
  ok('the database filter agrees with the rule', liveRows.length === 1 && liveRows[0].inviteEmail === `${TAG}+live@t.local`, liveRows);

  // A cart added at check-in: a weekday booking of 4, public cart $20, member cart $10.
  const b = (email: string) => ({ golferAccountId: null, golferEmail: email, courseId: course.id, players: 4, cartSelected: false, cartFeeTotal: 0, paymentStatus: 'card_on_file', roundPaymentIntentId: '', teeTime: { date: '2026-11-04', cartFeeCents: 2000 } });
  ok('check-in cart: the member at the member price, guests at the public price', (await cartAddOnCentsFor(b(`${TAG}+live@t.local`))) === 1000 + 3 * 2000);
  ok('…a lapsed member pays the public price for all', (await cartAddOnCentsFor(b(`${TAG}+lapsed@t.local`))) === 4 * 2000);
  await prisma.membershipTier.update({ where: { id: tier.id }, data: { guestsPayMemberRate: true } });
  ok('…and a tier with guests at the member rate covers everyone', (await cartAddOnCentsFor(b(`${TAG}+live@t.local`))) === 4 * 1000);

  // Every place that prices a member uses the same rules.
  const src = (f: string) => readFileSync(f, 'utf8');
  ok('booking charges the split and checks the end date', src('src/app/api/bookings/route.ts').includes('splitTotal(players, memberN, greenFeePerPlayerCents, teeTimeFull.greenFeeCents)') && src('src/app/api/bookings/route.ts').includes('membershipLive(membership, teeTimeFull.course.memberGraceDays)') && src('src/app/api/bookings/route.ts').includes('getGolferMembership(teeTimeFull.courseId, teeTimeFull.course.memberGraceDays)'));
  ok('the member portal shows the same split and window', src('src/app/api/member/[courseSlug]/tee-times/route.ts').includes('membershipLive(membership, course.memberGraceDays)') && src('src/app/courses/[slug]/member/page.tsx').includes('splitTotal(players, t.guests_member_rate ? players : Math.min(1, players)'));
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

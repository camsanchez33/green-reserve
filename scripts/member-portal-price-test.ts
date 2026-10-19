// The member portal's tee-time list must show a member exactly what booking
// charges them (Cam 2026-10-19). It used to carry its own copy of the member
// pricing rules — member rate before a % off, no weekday fallback for a flat
// weekend price, no % off the cart, and no "membership is active" check — so 6
// of these 8 cases showed one price and charged another. Each case here signs a
// member in, reads the portal, and compares it to applyTierRates (what
// api/bookings charges), or to the public rate for a lapsed membership.
// Needs the app running (TEST_URL) and its database. Run: npx tsx scripts/member-portal-price-test.ts
import { PrismaClient } from '@prisma/client';
import { signMemberSessionToken } from '../src/lib/member-session';
import { applyTierRates } from '../src/lib/tier-rates';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TAG = 'mportalprice';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Price Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Price Test', slug: `${TAG}-c`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  // The next Saturday inside the members' default window — weekend rules are the ones that differed.
  let date = addDaysStr(todayIn('UTC'), 1);
  while (new Date(date + 'T12:00:00').getDay() !== 6) date = addDaysStr(date, 1);
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '09:00', holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, memberRateCents: 7000, playersAvailable: 4, playersBooked: 0 } });

  const tiers: Record<string, Record<string, unknown>> = {
    '20% off (the schedule also has a member rate)': { discountPct: 20 },
    'a flat weekday price only, on a Saturday': { greenFeeWeekdayCents: 4000 },
    'flat weekend green and cart prices': { greenFeeWeekdayCents: 4000, greenFeeWeekendCents: 5000, cartFeeWeekendCents: 500 },
    'no price of its own (the schedule\'s member rate)': {},
  };
  let n = 0;
  for (const [label, data] of Object.entries(tiers)) {
    for (const status of ['active', 'expired']) {
      const tier = await prisma.membershipTier.create({ data: { courseId: course.id, name: `T${n++}`, ...data } });
      const m = await prisma.courseMembership.create({ data: { courseId: course.id, tierId: tier.id, membershipType: tier.name, status, inviteEmail: `m${n}@x.com`, inviteName: 'Member', payToken: `${TAG}-${n}` } });
      const token = await signMemberSessionToken({ membershipId: m.id, courseId: course.id, email: m.inviteEmail });
      const r = await fetch(`${BASE_URL}/api/member/${course.slug}/tee-times?date=${date}`, { headers: { cookie: `gr_member=${token}` } });
      const body = await r.json();
      const row = Array.isArray(body) ? body.find((x: { id: string }) => x.id === tt.id) : null;
      const want = status === 'active' ? applyTierRates(tt, tier) : { greenFeeCents: tt.greenFeeCents, cartFeeCents: tt.cartFeeCents };
      const shown = row ? { greenFeeCents: Math.round(row.member_green_fee * 100), cartFeeCents: Math.round(row.cart_fee * 100) } : { status: r.status, body };
      check(`${status} membership, ${label}: shows what booking charges`, !!row && shown.greenFeeCents === want.greenFeeCents && shown.cartFeeCents === want.cartFeeCents, { shown, charged: want });
      if (row && status === 'expired') check(`…and a lapsed membership isn't flagged as a member rate`, row.has_member_rate === false, row);
    }
  }

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

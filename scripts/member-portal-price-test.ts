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
import { groupGreenFee } from '../src/lib/residents';

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
  await prisma.bookingEvent.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.courseResident.deleteMany({ where: { courseId } });
  await prisma.golferAccount.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.courseProduct.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.courseGroup.deleteMany({ where: { slug: `${TAG}-g` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Price Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { hasMemberPricing: true, hasResidentPricing: true, publicAdvanceDays: 10, name: 'Price Test', slug: `${TAG}-c`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  // The next Saturday inside the members' default window — weekend rules are the ones that differed.
  let date = addDaysStr(todayIn('UTC'), 1);
  while (new Date(date + 'T12:00:00').getDay() !== 6) date = addDaysStr(date, 1);
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '09:00', holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, memberRateCents: 7000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });

  const tiers: Record<string, Record<string, unknown>> = {
    '20% off (the schedule also has a member rate)': { discountPct: 20 },
    'a flat weekday price only, on a Saturday': { greenFeeWeekdayCents: 4000 },
    'flat weekend green and cart prices': { greenFeeWeekdayCents: 4000, greenFeeWeekendCents: 5000, cartFeeWeekendCents: 500 },
    'no price of its own (the schedule\'s member rate)': {},
    // Memberships item 3: priced by the price list — the weekend green line free, so the schedule's member rate is not used.
    'price-list lines: weekend green free, cart 50% off': { lineRates: { 'green:-:we': { cents: 0 }, 'cart:-:we': { pct: 50 } } },
    'price-list lines: only a weekday line (Saturday is public)': { lineRates: { 'green:-:wd': { cents: 0 } } },
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
      // The course page shows the member price only when has_member_rate is true — it must match what booking charges.
      if (row && status === 'active' && 'lineRates' in data) check(`…${label}: flagged as a member rate exactly when the line is set`, row.has_member_rate === (want.greenFeeCents !== tt.greenFeeCents), row);
    }
  }

  // RES-1: booking charges the signed-in member's own spot the resident rate
  // when no membership price applied and their card is good on the date
  // (api/bookings: loggedInResident + groupGreenFee). The list must show it.
  // Cam 2026-11-18: the member sign-in (gr_member) is the only sign-in; its email is the resident's.
  const memberCookie = async (membershipId: string, email: string) => `gr_member=${await signMemberSessionToken({ membershipId, courseId: course.id, email })}`;
  const portal = async (cookie: string) => {
    const r = await fetch(`${BASE_URL}/api/member/${course.slug}/tee-times?date=${date}`, { headers: { cookie } });
    const body = await r.json();
    return Array.isArray(body) ? body.find((x: { id: string }) => x.id === tt.id) : { status: r.status, body };
  };
  // A tierless member who is also a resident.
  const resEmail = `res@${TAG}.test`;
  const resM = await prisma.courseMembership.create({ data: { courseId: course.id, tierId: null, membershipType: 'Member', status: 'active', inviteEmail: resEmail, inviteName: 'Res', payToken: `${TAG}-res` } });
  // Listed in other letter case: the match is case-insensitive and exact (lib/like-exact).
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'Res', email: resEmail.toUpperCase(), expiresOn: '' } });
  const resRow = await portal(await memberCookie(resM.id, resEmail));
  const charged = groupGreenFee(3, tt.greenFeeCents, 1, tt.residentRateCents).greenFeeTotal;
  check('a tierless member on the resident list sees their own spot at the resident rate',
    resRow?.resident_green_fee === 30 && groupGreenFee(3, Math.round(resRow.member_green_fee * 100), 1, Math.round(resRow.resident_green_fee * 100)).greenFeeTotal === charged, { resRow, charged });
  // A resident whose card expired before the date pays the member price for every spot.
  const oldEmail = `expired@${TAG}.test`;
  const oldM = await prisma.courseMembership.create({ data: { courseId: course.id, tierId: null, membershipType: 'Member', status: 'active', inviteEmail: oldEmail, inviteName: 'Old', payToken: `${TAG}-old` } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'Old', email: oldEmail, expiresOn: addDaysStr(date, -1) } });
  const oldRow = await portal(await memberCookie(oldM.id, oldEmail));
  check('…but not with a card that expired before the date', !!oldRow && oldRow.resident_green_fee == null, oldRow);
  // A resident whose membership has its own price: the member price wins, never both.
  const tierEmail = `tier@${TAG}.test`;
  const pctTier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'ResTier', discountPct: 20 } });
  const tierM = await prisma.courseMembership.create({ data: { courseId: course.id, tierId: pctTier.id, membershipType: 'ResTier', status: 'active', inviteEmail: tierEmail, inviteName: 'Tier', payToken: `${TAG}-tier` } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'Tier', email: tierEmail, expiresOn: '' } });
  const tierRow = await portal(await memberCookie(tierM.id, tierEmail));
  check('…and never on top of a membership price', !!tierRow && tierRow.resident_green_fee == null && Math.round(tierRow.member_green_fee * 100) === 8000, tierRow);

  // Tenant check (Cam 2026-11-18): the online resident rate comes from the member signed in to THIS course. A member
  // of this course who is also on another course's resident list never gets that course's resident rate there —
  // not on its own, and not when the two courses are in one group.
  const resCookie = await memberCookie(resM.id, resEmail);
  const residentRate = async (teeTimeId: string, cookie?: string) => (await (await fetch(`${BASE_URL}/api/bookings/resident-rate?teeTimeId=${teeTimeId}`, cookie ? { headers: { cookie } } : {})).json()) as { residentGreenFee: number | null };
  check('the booking page shows a signed-in member on the list the resident rate here', (await residentRate(tt.id, resCookie)).residentGreenFee === 30);
  check('…and nothing signed out', (await residentRate(tt.id)).residentGreenFee === null);
  const courseB = await prisma.course.create({ data: { hasResidentPricing: true, name: 'Price Test B', slug: `${TAG}-b`, operatorId: op.id, address: '2 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  const ttB = await prisma.teeTime.create({ data: { courseId: courseB.id, date, time: '09:00', holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });
  await prisma.courseResident.create({ data: { courseId: courseB.id, name: 'Res', email: resEmail, expiresOn: '' } });
  check('a member of course A on course B\'s resident list gets no resident rate at B', (await residentRate(ttB.id, resCookie)).residentGreenFee === null);
  const group = await prisma.courseGroup.create({ data: { name: 'Price Test Group', slug: `${TAG}-g` } });
  await prisma.course.updateMany({ where: { id: { in: [course.id, courseB.id] } }, data: { groupId: group.id } });
  check('…nor when A and B are in one group', (await residentRate(ttB.id, resCookie)).residentGreenFee === null);
  await prisma.course.updateMany({ where: { id: { in: [course.id, courseB.id] } }, data: { groupId: null } });

  // RES-1 "moves keep it": an online resident booking (no golfer account now) keeps the resident seat on the golfer's
  // own swap while the member is signed in and the card is good — and loses it without the proof.
  const ttS1 = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '11:00', holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 1 } });
  const ttS2 = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '12:00', holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });
  const swapToken = `${TAG}-swap-token`;
  const rb = await prisma.booking.create({ data: { teeTimeId: ttS1.id, courseId: course.id, golferName: 'Res', golferEmail: resEmail, players: 1, residentPlayers: 1, residentRateCents: 3000, appliedRate: 'resident', greenFeeTotal: 3000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 3150, status: 'confirmed', paymentStatus: 'no_payment_method', checkInToken: swapToken } });
  const swap = (to: string, cookie?: string) => fetch(`${BASE_URL}/api/manage/${rb.id}/swap-time`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ token: swapToken, newTeeTimeId: to, termsAccepted: true }) });
  const s1 = await swap(ttS2.id, resCookie);
  const after1 = await prisma.booking.findUnique({ where: { id: rb.id }, select: { residentPlayers: true, teeTimeId: true } });
  check('an online resident\'s own swap, signed in as the member, keeps the resident seat', s1.ok && after1?.teeTimeId === ttS2.id && after1?.residentPlayers === 1, { status: s1.status, after1 });
  const s2 = await swap(ttS1.id);
  const after2 = await prisma.booking.findUnique({ where: { id: rb.id }, select: { residentPlayers: true, teeTimeId: true } });
  check('…and without the member sign-in the swap reprices at the public rate', s2.ok && after2?.teeTimeId === ttS1.id && after2?.residentPlayers === 0, { status: s2.status, after2 });

  // Memberships item 3: a membership on "the public window" books as far ahead as the public — the course's, and a
  // round's own shorter one.
  const winTier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'PublicWin', windowPublic: true, advanceBookingDays: 60 } });
  const wm = await prisma.courseMembership.create({ data: { courseId: course.id, tierId: winTier.id, membershipType: 'PublicWin', status: 'active', inviteEmail: `win@${TAG}.test`, inviteName: 'Win', payToken: `${TAG}-win` } });
  const wtoken = await signMemberSessionToken({ membershipId: wm.id, courseId: course.id, email: wm.inviteEmail });
  const sess = await (await fetch(`${BASE_URL}/api/member/${course.slug}/session`, { headers: { cookie: `gr_member=${wtoken}` } })).json();
  check('a member on the public window gets the course\'s public window in the portal', sess.windowDays === 10, sess);
  const far = addDaysStr(todayIn('UTC'), 12);
  const farRes = await fetch(`${BASE_URL}/api/member/${course.slug}/tee-times?date=${far}`, { headers: { cookie: `gr_member=${wtoken}` } });
  check('…and no further (refused past it, as booking refuses)', farRes.status === 403, farRes.status);
  const short = await prisma.courseProduct.create({ data: { courseId: course.id, label: 'Twilight', holes: 9, publicAdvanceDays: 1 } });
  const later = addDaysStr(todayIn('UTC'), 4);
  const tw = await prisma.teeTime.create({ data: { courseId: course.id, productId: short.id, date: later, time: '17:00', holes: 9, greenFeeCents: 4000, cartFeeCents: 1000, playersAvailable: 4, playersBooked: 0 } });
  const lateList = await (await fetch(`${BASE_URL}/api/member/${course.slug}/tee-times?date=${later}`, { headers: { cookie: `gr_member=${wtoken}` } })).json();
  check('…and a round\'s own shorter public window holds for them too', Array.isArray(lateList) && !lateList.some((x: { id: string }) => x.id === tw.id), lateList);
  await prisma.teeTime.deleteMany({ where: { productId: short.id } });
  await prisma.courseProduct.delete({ where: { id: short.id } });

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

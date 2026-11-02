// Cam 2026-10-28 ("add a shit ton of test tee times, members and shit to the test
// course … do a lot of fake bookings"); Cam 2026-11-01 chose "Busy season": about six
// months back and a month ahead on a busy sheet (~15,000 bookings), 150 members,
// 60 residents, thousands of shop sales — and every money table a real course fills:
// the money ledger, member accounts and monthly statements, promo codes, golfer notes,
// event payments and the register close-out. Fills a TEST course with realistic sample
// activity so every dashboard page can be judged with data on it. The rows are
// written exactly as the real code paths write them (bookings route, check-in,
// counter cash, cancel, no-show, register), so Analytics, Money, Home and the tee
// sheet read them as they would a real course's.
//
// Safe by construction:
//  • only a course marked as a test (Course.isTest) — and TEST-2 keeps a test
//    course out of every platform-wide number;
//  • only an empty one (no bookings yet) — "Reset activity" clears it all again;
//  • golfers get @noemail.greenreserve.app addresses, which the email sender never
//    sends to, and 555-01xx phone numbers, which are fictional and never texted;
//  • no saved cards (online bookings read "no card yet"), so no cron ever reaches
//    Stripe for these bookings.
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { teeTimeInstant } from './booking-events';
import { generateTeeTimes } from './tee-sheet-engine';
import { policyFrom, lateFeeTotalCents, noShowTotalCents } from './cancel-policy';
import { groupGreenFee } from './residents';
import { splitTotal } from './member-rates';
import { ACCESS_FEE_CENTS, membershipFeeCents } from './stripe';
import { CURRENT_TERMS_VERSION } from './terms';
import { createEvent } from './course-events';
import { PLACEHOLDER_EMAIL_DOMAIN } from './email';
import { randomUUID } from 'crypto';
import { golferKey } from './golfer-key';
import type { Prisma } from '@prisma/client';

export const SAMPLE_PAST_DAYS = 180;
export const SAMPLE_AHEAD_DAYS = 30;
const MEMBERS = 150, RESIDENTS = 60, PEOPLE = 700;
export const SAMPLE_SOLD_BY = 'Sample data';

const FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Karen', 'Chris', 'Sarah', 'Daniel', 'Lisa', 'Matthew', 'Nancy', 'Anthony', 'Sandra', 'Mark', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Donna', 'Andrew', 'Emily', 'Josh', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Tim', 'Deborah', 'Ryan', 'Laura', 'Jake', 'Rebecca', 'Gary', 'Sharon'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Murphy', 'Cook'];
// 555-0100 to 555-0199 is the fictional block in every North American area code.
const AREA = ['518', '315', '607', '212', '716'];

const CATALOGUE: { name: string; category: string; priceCents: number; stock: number | null; sku: string }[] = [
  { name: 'Titleist Pro V1 (dozen)', category: 'Golf balls', priceCents: 5499, stock: 24, sku: '0099-PROV1' },
  { name: 'Callaway Supersoft (dozen)', category: 'Golf balls', priceCents: 2499, stock: 30, sku: '0099-SSOFT' },
  { name: 'Logo hat', category: 'Apparel', priceCents: 2900, stock: 18, sku: '0101-HAT' },
  { name: 'Logo polo', category: 'Apparel', priceCents: 6500, stock: 12, sku: '0102-POLO' },
  { name: 'FootJoy glove', category: 'Accessories', priceCents: 1999, stock: 20, sku: '0201-GLOVE' },
  { name: 'Tees (bag of 50)', category: 'Accessories', priceCents: 599, stock: 40, sku: '0202-TEES' },
  { name: 'Ball markers', category: 'Accessories', priceCents: 499, stock: null, sku: '0203-MARK' },
  { name: 'Range bucket, large', category: 'Range', priceCents: 1200, stock: null, sku: 'RANGE-L' },
  { name: 'Range bucket, small', category: 'Range', priceCents: 800, stock: null, sku: 'RANGE-S' },
  { name: 'Bottled water', category: 'Drinks', priceCents: 300, stock: 96, sku: 'BEV-WATER' },
  { name: 'Sports drink', category: 'Drinks', priceCents: 400, stock: 48, sku: 'BEV-SPORT' },
  { name: 'Hot dog', category: 'Food', priceCents: 550, stock: null, sku: 'FOOD-HOTDOG' },
];

/** A small seeded random source, so a course always gets the same sample. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SampleResult = {
  teeTimes: number; bookings: number; members: number; residents: number;
  shopItems: number; shopSales: number; event: string | null; eventNote: string;
  ledgerRows?: number; accountCharges?: number; statements?: number; notes?: number; promoCodes?: number; closes?: number;
};

/** Whether sample rows are on the course (bookings carry the smp id prefix; sales the sample seller). */
export async function hasSampleData(courseId: string): Promise<boolean> {
  const [b, s] = await Promise.all([
    prisma.booking.count({ where: { courseId, id: { startsWith: 'smp' } } }),
    prisma.shopSale.count({ where: { courseId, soldBy: SAMPLE_SOLD_BY } }),
  ]);
  return b + s > 0;
}

type Person = { name: string; email: string; phone: string; member: { tierId: string; tierName: string; pct: number; account: boolean; annualFeeCents: number } | null; resident: boolean; weight: number; membershipId?: string };

export async function fillTestCourse(courseId: string, now: Date = new Date()): Promise<{ ok: true; made: SampleResult } | { ok: false; status: number; error: string }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true, name: true, isTest: true, timezone: true,
      cancellationHours: true, lateCancellationFeeCents: true, lateFeeBasis: true, lateFeeTiming: true,
      noShowFeeCents: true, noShowFeeBasis: true, autoNoShowMinutes: true, checkInWindowHours: true,
      _count: { select: { bookings: true, schedules: true } },
    },
  });
  if (!course) return { ok: false, status: 404, error: 'That course no longer exists — refresh the page.' };
  if (!course.isTest) return { ok: false, status: 400, error: 'Only a course marked as a test course can be filled with sample data.' };
  if (course._count.bookings > 0) return { ok: false, status: 409, error: 'This course already has bookings. Reset its activity first, then fill it.' };
  const activeSchedules = await prisma.teeTimeSchedule.count({ where: { courseId, active: true } });
  if (activeSchedules === 0) return { ok: false, status: 400, error: 'This course has no tee time schedule. Add one in its settings first.' };

  const r = rng(courseId);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const tz = course.timezone;
  const today = todayIn(tz, now);
  const policy = policyFrom(course);

  // 1. Tee times, 60 days back to 21 ahead. generateTeeTimes is idempotent per day.
  let teeTimes = 0;
  for (let d = -SAMPLE_PAST_DAYS; d <= SAMPLE_AHEAD_DAYS; d++) teeTimes += await generateTeeTimes(courseId, addDaysStr(today, d));

  // 2. Membership tiers (only if the course has none) and the golfer pool.
  const tierSelect = { id: true, name: true, discountPct: true, accountOn: true, annualFeeCents: true } as const;
  let tiers = await prisma.membershipTier.findMany({ where: { courseId, active: true }, select: tierSelect });
  if (tiers.length === 0) {
    await prisma.membershipTier.createMany({ data: [
      // Full members run a monthly account (MEM-ACCT): rounds and shop go on it, a statement each month.
      { courseId, name: 'Full Member', discountPct: 30, annualFeeCents: 180000, advanceBookingDays: 14, color: '#173B2A', accountOn: true, accountSettle: 'link' },
      { courseId, name: 'Senior', discountPct: 20, annualFeeCents: 120000, advanceBookingDays: 10, color: '#4E7A62' },
      { courseId, name: 'Weekday', discountPct: 15, annualFeeCents: 90000, advanceBookingDays: 7, color: '#8A6D3B' },
    ] });
    tiers = await prisma.membershipTier.findMany({ where: { courseId, active: true }, select: tierSelect });
  }
  // The sample sets member and resident prices, so its switches are on (lib/pricing-switch).
  await prisma.course.update({ where: { id: courseId }, data: { hasMemberPricing: true, hasResidentPricing: true } });
  const people: Person[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; people.length < PEOPLE && i < 20000; i++) {
    // 50 × 50 names run out before 700 golfers: a middle initial keeps them apart.
    const base = `${pick(FIRST)} ${pick(LAST)}`;
    const name = usedNames.has(base) ? `${base.split(' ')[0]} ${String.fromCharCode(65 + Math.floor(r() * 26))}. ${base.split(' ')[1]}` : base;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const n = people.length;
    // 555-0100..0199 in each of 7 area codes keeps 700 fictional numbers apart.
    const area = [...AREA, '845', '914'][Math.floor(n / 100) % 7];
    const phone = `(${area}) 555-01${String(n % 100).padStart(2, '0')}`;
    const tier = n < MEMBERS ? tiers[n % tiers.length] : null;
    people.push({
      name, phone,
      email: `sample+${n}${PLACEHOLDER_EMAIL_DOMAIN}`,
      member: tier ? { tierId: tier.id, tierName: tier.name, pct: tier.discountPct ?? 0, account: tier.accountOn, annualFeeCents: tier.annualFeeCents } : null,
      resident: n >= MEMBERS && n < MEMBERS + RESIDENTS,
      // Regulars: members and the next 150 golfers book far more often.
      weight: n < MEMBERS ? 5 : n < MEMBERS + 150 ? 3 : 1,
    });
  }
  const totalWeight = people.reduce((s, p) => s + p.weight, 0);
  const golfer = () => { let x = r() * totalWeight; for (const p of people) { x -= p.weight; if (x <= 0) return p; } return people[people.length - 1]; };

  const members = people.filter(p => p.member);
  // A fill that died part way (it is not one transaction) must not double these on the retry.
  const already = await prisma.courseMembership.count({ where: { courseId, addedBy: SAMPLE_SOLD_BY } });
  if (!already) await prisma.courseMembership.createMany({ data: members.map((p, i) => {
    const paid = i % 5 !== 0;
    // Renewals spread over the year, so Members shows some due soon and some just renewed.
    const started = new Date(now.getTime() - (20 + (i * 37) % 340) * 86_400_000);
    return {
      courseId, tierId: p.member!.tierId, membershipType: p.member!.tierName, inviteName: p.name, inviteEmail: p.email, invitePhone: p.phone,
      status: 'active', addedBy: SAMPLE_SOLD_BY, startedAt: started, expiresAt: new Date(started.getTime() + 365 * 86_400_000),
      paymentStatus: paid ? (i % 3 === 0 ? 'paid_offline' : 'paid') : 'unpaid', lastPaidAt: paid ? started : null, initiationWaived: true,
    };
  }) });
  // Their ids, for account charges, statements and the dues paid (ledger).
  const membershipRows = await prisma.courseMembership.findMany({ where: { courseId, addedBy: SAMPLE_SOLD_BY }, select: { id: true, inviteEmail: true, paymentStatus: true, lastPaidAt: true } });
  const membershipOf = new Map(membershipRows.map(m => [m.inviteEmail, m]));
  for (const p of members) p.membershipId = membershipOf.get(p.email)?.id;
  const residentPeople = people.filter(p => p.resident);
  if (!(await prisma.courseResident.count({ where: { courseId, addedBy: SAMPLE_SOLD_BY } }))) await prisma.courseResident.createMany({ data: residentPeople.map((p, i) => ({
    courseId, name: p.name, email: p.email, cardNumber: `R-${1040 + i}`, expiresOn: `${today.slice(0, 4)}-12-31`, addedBy: SAMPLE_SOLD_BY,
  })) });

  // 3. Shop catalogue (only if the course has none).
  let items = await prisma.shopItem.findMany({ where: { courseId, active: true, parentId: null }, select: { id: true, name: true, priceCents: true } });
  let shopItems = 0;
  if (items.length === 0) {
    await prisma.shopItem.createMany({ data: CATALOGUE.map((c, i) => ({ courseId, name: c.name, category: c.category, priceCents: c.priceCents, stockCount: c.stock, sku: c.sku, sortOrder: i })) });
    items = await prisma.shopItem.findMany({ where: { courseId, active: true, parentId: null }, select: { id: true, name: true, priceCents: true } });
    shopItems = items.length;
  }

  // 4. One outing two weeks out, made the real way so it holds the tee sheet before bookings fill it.
  let eventName: string | null = null;
  let eventNote = '';
  try {
    const eventDate = addDaysStr(today, 13);
    if (await prisma.courseEvent.count({ where: { courseId, createdBy: SAMPLE_SOLD_BY } })) throw new Error('it is already there');
    const first = await prisma.teeTime.findFirst({ where: { courseId, date: eventDate, status: { not: 'blocked' } }, orderBy: { time: 'asc' }, select: { time: true } });
    if (!first) throw new Error(`no tee times on ${eventDate}`);
    const { event } = await createEvent(courseId, {
      name: 'Charity Scramble', kind: 'outing', date: eventDate, format: 'shotgun', startTime: first.time, holes: 18,
      groups: 18, players: 72, organizerName: 'Pat Organizer', organizerEmail: `organizer${PLACEHOLDER_EMAIL_DOMAIN}`, organizerPhone: '(518) 555-0199',
      pricePerPlayer: 95, includes: ['Green fee', 'Cart', 'Lunch'], payer: 'organizer', guaranteeDaysBefore: 7, notes: 'Sample data.',
    }, SAMPLE_SOLD_BY);
    const entrants = people.slice(60, 132);
    await prisma.courseEventPlayer.createMany({ data: entrants.map((p, i) => ({
      eventId: event.id, name: p.name, email: p.email, phone: p.phone, groupNo: Math.floor(i / 4) + 1, startHole: Math.floor(i / 4) + 1,
      status: 'in', source: i % 3 === 0 ? 'signup' : 'staff', sortOrder: i,
    })) });
    eventName = event.name;
  } catch (err) {
    eventNote = `The sample outing was skipped: ${err instanceof Error ? err.message : String(err)}.`;
  }

  // 5. Bookings on every open tee time in the range, in every state a real day produces.
  const slots = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: addDaysStr(today, -SAMPLE_PAST_DAYS), lte: addDaysStr(today, SAMPLE_AHEAD_DAYS) }, status: { not: 'blocked' }, eventId: null },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    select: { id: true, date: true, time: true, playersAvailable: true, greenFeeCents: true, cartFeeCents: true, walkingAllowed: true, memberRateCents: true, residentRateCents: true },
  });

  // Promo codes (only if the course has none), and a few online bookings that used one.
  const promoSelect = { id: true, code: true, kind: true, value: true, fromTime: true, onePerGolfer: true } as const;
  let promos = await prisma.promoCode.findMany({ where: { courseId, active: true }, select: promoSelect });
  let promoCodes = 0;
  if (promos.length === 0) {
    await prisma.promoCode.createMany({ data: [
      { courseId, code: 'SPRING10', kind: 'percent', value: 10, note: 'Sample data', createdBy: SAMPLE_SOLD_BY },
      { courseId, code: 'TWILIGHT5', kind: 'amount', value: 500, fromTime: '15:00', note: 'Sample data', createdBy: SAMPLE_SOLD_BY },
      { courseId, code: 'NEWGOLFER', kind: 'percent', value: 20, onePerGolfer: true, maxUses: 200, note: 'Sample data', createdBy: SAMPLE_SOLD_BY },
    ] });
    promos = await prisma.promoCode.findMany({ where: { courseId, active: true }, select: promoSelect });
    promoCodes = promos.length;
  }
  const promoUses = new Map<string, number>();
  const promoBy = new Set<string>();

  const bookings: (Record<string, unknown> & { id: string })[] = [];
  // LEDGER-1: every dollar a real course moves is a MoneyMove row; the sample writes them the same way.
  const moves: Record<string, unknown>[] = [];
  // MEM-ACCT: rounds full members put on their account.
  const charges: { id: string; membershipId: string; kind: string; amountCents: number; feeCents: number; bookingId: string | null; note: string; createdAt: Date }[] = [];
  const events: Record<string, unknown>[] = [];
  const sales: { sale: Record<string, unknown>; lines: Record<string, unknown>[] }[] = [];
  const booked = new Map<string, number>();
  const nowMs = now.getTime();

  for (const s of slots) {
    const tee = teeTimeInstant(tz, s.date, s.time);
    if (!tee) continue;
    const dayDiff = Math.round((Date.parse(s.date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000);
    const dow = new Date(s.date + 'T12:00:00Z').getUTCDay();
    const hour = Number(s.time.slice(0, 2));
    const weekend = dow === 0 || dow === 6;
    // Busy season: mornings near full, a lighter middle of the day, twilight picking up.
    let p = hour < 11 ? (weekend ? 0.97 : 0.85) : hour < 14 ? 0.65 : hour < 16 ? 0.72 : 0.5;
    if (dow === 1) p *= 0.8; // Mondays run quieter
    // Spring starts slower: the oldest months are lighter than the last two.
    if (dayDiff < -60) p *= 0.75 + 0.25 * (1 + dayDiff / SAMPLE_PAST_DAYS);
    if (dayDiff > 0) p *= Math.max(0.08, 0.8 - dayDiff * 0.03); // the future fills in as it gets closer
    let open = s.playersAvailable;
    for (let g = 0; g < 4 && open > 0 && r() < p * [1, 0.85, 0.6, 0.35][g]; g++) {
      const who = golfer();
      const roll = r();
      const players = Math.min(open, roll < 0.1 ? 1 : roll < 0.45 ? 2 : roll < 0.6 ? 3 : 4);
      open -= players;
      const srcRoll = r();
      const source = srcRoll < 0.72 ? 'online' : srcRoll < 0.86 ? 'phone' : 'walk_in';
      const online = source === 'online';
      const memberRate = who.member ? (s.memberRateCents ?? Math.round(s.greenFeeCents * (1 - who.member.pct / 100))) : null;
      // The member alone at the member rate, guests at the public one (lib/member-rates).
      const fee: { residentPlayers: number; residentRateCents: number | null; greenFeeTotal: number } = memberRate != null
        ? { residentPlayers: 0, residentRateCents: null, greenFeeTotal: splitTotal(players, 1, memberRate, s.greenFeeCents) }
        : groupGreenFee(players, s.greenFeeCents, who.resident && s.residentRateCents != null ? 1 : 0, s.residentRateCents);
      // ~4% of public online bookings used a promo code, taken off the green fee (lib/promo-codes).
      // Only a code that fits, as the booking route checks: TWILIGHT5 from 3 PM, NEWGOLFER once per golfer.
      const fits = promos.filter(c => (!c.fromTime || s.time >= c.fromTime) && !(c.onePerGolfer && promoBy.has(`${c.id}|${who.email}`)));
      const promo = source === 'online' && !who.member && !fee.residentPlayers && fits.length && r() < 0.04 ? pick(fits) : null;
      if (promo?.onePerGolfer) promoBy.add(`${promo.id}|${who.email}`);
      const promoOff = promo ? Math.min(fee.greenFeeTotal, promo.kind === 'percent' ? Math.round(fee.greenFeeTotal * promo.value / 100) : promo.value * players) : 0;
      if (promo) { fee.greenFeeTotal -= promoOff; promoUses.set(promo.id, (promoUses.get(promo.id) ?? 0) + 1); }
      const cart = !s.walkingAllowed || r() < 0.6;
      const cartFeeTotal = cart ? s.cartFeeCents * players : 0;
      const accessFeeTotal = online ? ACCESS_FEE_CENTS * players : 0;
      const totalAmount = fee.greenFeeTotal + cartFeeTotal + accessFeeTotal;
      // Lead time: online books days ahead, phone a little, walk-ins on the spot.
      const leadMs = online ? Math.min(20, Math.floor(-Math.log(1 - r()) * 4)) * 86_400_000 + Math.floor(r() * 10) * 3_600_000
        : source === 'phone' ? Math.floor(r() * 4) * 86_400_000 + 3_600_000 : Math.floor(5 + r() * 40) * 60_000;
      const createdAt = new Date(Math.min(tee.getTime() - leadMs, nowMs - Math.floor(r() * 3_600_000) - 60_000));
      const id = `smp${randomUUID().replace(/-/g, '').slice(0, 22)}`;
      const b: Record<string, unknown> & { id: string } = {
        id, teeTimeId: s.id, courseId, golferName: who.name, golferEmail: who.email, golferPhone: who.phone, players,
        appliedRate: who.member ? who.member.tierName : fee.residentPlayers ? 'resident' : 'standard',
        ...(promo ? { promoCodeId: promo.id, promoDiscountCents: promoOff } : {}),
        residentPlayers: fee.residentPlayers, residentRateCents: fee.residentRateCents,
        ...(memberRate != null ? { memberRateCents: memberRate, memberCartCents: s.cartFeeCents } : {}),
        greenFeeTotal: fee.greenFeeTotal, cartFeeTotal, cartSelected: cart, accessFeeTotal, totalAmount, source, createdAt,
        status: 'confirmed', // No sample booking claims a saved card it doesn't have: staff take payment by pay link, card or cash.
        paymentStatus: online ? 'no_payment_method' : 'manual',
        checkInToken: online ? randomUUID() : null,
        ...(online ? {
          termsAcceptedAt: createdAt, termsVersion: CURRENT_TERMS_VERSION,
          cancellationFeeTotal: lateFeeTotalCents(policy, players), noShowFeeTotal: noShowTotalCents(policy, players),
          lateFeeTimingAtBooking: policy.lateFeeTiming, cancellationHoursAtBooking: course.cancellationHours, autoNoShowMinutesAtBooking: policy.autoNoShowMinutes,
        } : {}),
      };
      const actor = online ? 'golfer' : 'staff';
      events.push({ bookingId: id, courseId, type: 'booking_created', actorType: actor, occurredAt: createdAt, amountCents: totalAmount, playerCount: players, teeTimeAt: tee, metadata: { source } });

      const passed = tee.getTime() + 45 * 60_000 < nowMs;
      const outcome = r();
      const cutoffMs = tee.getTime() - (course.cancellationHours ?? 24) * 3_600_000;
      if (outcome < 0.05 && createdAt.getTime() < Math.min(tee.getTime(), nowMs) - 3_600_000) {
        // Cancelled. Inside the window an online booking at a fee course keeps its fee.
        const cancelledAt = new Date(Math.min(nowMs - 60_000, createdAt.getTime() + r() * (Math.min(tee.getTime(), nowMs) - createdAt.getTime())));
        const late = online && cancelledAt.getTime() > cutoffMs && Number(b.cancellationFeeTotal ?? 0) > 0;
        b.status = 'cancelled'; b.cancelledAt = cancelledAt;
        if (late) Object.assign(b, { paymentStatus: 'cancellation_fee_charged', cancellationFeeApplies: true, cancellationFeeChargedAt: cancelledAt });
        else if (online) b.cancellationFeeTotal = 0;
        events.push({ bookingId: id, courseId, type: 'booking_cancelled', actorType: r() < 0.85 ? 'golfer' : 'staff', occurredAt: cancelledAt, amountCents: late ? b.cancellationFeeTotal : 0, playerCount: players, teeTimeAt: tee, metadata: { feeKept: late, roundRefunded: false } });
        if (late) moves.push({ courseId, what: 'late_fee', direction: 'in', method: 'card', account: 'course', amountCents: Number(b.cancellationFeeTotal), bookingId: id, actor: 'system', at: cancelledAt, note: 'Sample data' });
        if (late) events.push({ bookingId: id, courseId, type: 'fee_charged', actorType: 'system', occurredAt: cancelledAt, amountCents: b.cancellationFeeTotal, playerCount: players, teeTimeAt: tee, metadata: { reason: 'late_cancel' } });
        bookings.push(b);
        continue;
      }
      booked.set(s.id, (booked.get(s.id) ?? 0) + players);
      if (!passed) { bookings.push(b); continue; }
      if (online && outcome < 0.08) {
        // No-show: marked after the time, still confirmed, never checked in.
        const at = new Date(tee.getTime() + 35 * 60_000);
        b.noShowAt = at;
        events.push({ bookingId: id, courseId, type: 'no_show_marked', actorType: 'staff', occurredAt: at, playerCount: players, teeTimeAt: tee, metadata: {} });
      } else if (online && outcome < 0.1) {
        // A card that was declined at check-in: still confirmed, owed, on "Needs you".
        b.checkInFailReason = 'Your card was declined.';
      } else if (outcome < 0.105 && dayDiff === 0) {
        // Today, past its time, not checked in yet — "groups past their time".
      } else {
        const at = new Date(tee.getTime() - Math.floor(10 + r() * 15) * 60_000);
        const short = players > 1 && r() < 0.04;
        const showed = short ? players - 1 : players;
        const counter = !online || r() < 0.18;
        if (short) {
          const k = showed / players;
          Object.assign(b, { checkedInPlayers: showed, greenFeeTotal: Math.round(fee.greenFeeTotal * k), cartFeeTotal: Math.round(cartFeeTotal * k), accessFeeTotal: Math.round(accessFeeTotal * k) });
          b.totalAmount = Number(b.greenFeeTotal) + Number(b.cartFeeTotal) + Number(b.accessFeeTotal);
        }
        Object.assign(b, { status: 'completed', checkedInAt: at, paidAt: at });
        if (who.member?.account && who.membershipId && r() < 0.7) {
          // A full member's round on their account (MEM-ACCT): no money moves now — the statement collects it.
          Object.assign(b, { paymentStatus: 'on_account' });
          charges.push({ id: `smp${randomUUID().replace(/-/g, '').slice(0, 22)}`, membershipId: who.membershipId, kind: 'round', amountCents: Number(b.totalAmount), feeCents: Number(b.accessFeeTotal), bookingId: id, note: `${s.date} ${s.time} round`, createdAt: at });
          events.push({ bookingId: id, courseId, type: 'checked_in', actorType: 'staff', occurredAt: at, amountCents: b.totalAmount, playerCount: showed, teeTimeAt: tee, metadata: { onAccount: true } });
        } else if (counter) {
          // Cash at the counter (CASH-1): a register sale with the round on it; GreenReserve's fee isn't collected.
          Object.assign(b, { paymentStatus: 'paid_offline', paidOffline: true, shopFeeCents: 0 });
          const due = Number(b.totalAmount) - Number(b.accessFeeTotal);
          const [hh, mm] = s.time.split(':').map(Number);
          sales.push({
            sale: { courseId, status: 'paid_cash', totalCents: due, roundsCents: due, paidAt: at, createdAt: at, soldBy: SAMPLE_SOLD_BY, customerName: who.name, customerPhone: who.phone, cashTenderedCents: Math.ceil(due / 2000) * 2000 },
            lines: [{ name: `${hh % 12 || 12}:${String(mm).padStart(2, '0')} round · ${who.name} · ${showed} player${showed === 1 ? '' : 's'} · 18 holes`, unitPriceCents: due, quantity: 1, bookingId: id }],
          });
          events.push({ bookingId: id, courseId, type: 'checked_in', actorType: 'staff', occurredAt: at, amountCents: b.totalAmount, playerCount: showed, teeTimeAt: tee, metadata: { paidOffline: true } });
          // The ledger row is written with the register sale below (it needs the sale's id).
        } else {
          Object.assign(b, { paymentStatus: 'paid', roundChargedCents: b.totalAmount });
          moves.push({ courseId, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: Number(b.totalAmount), platformFeeCents: Number(b.accessFeeTotal), bookingId: id, actor: 'golfer', at, note: 'Sample data' });
          events.push({ bookingId: id, courseId, type: 'checked_in', actorType: r() < 0.3 ? 'golfer' : 'staff', occurredAt: at, amountCents: b.totalAmount, playerCount: showed, teeTimeAt: tee, metadata: { paidOffline: false, alreadyPaid: false } });
        }
      }
      bookings.push(b);
    }
  }

  // 6. Walk-up shop sales over the whole season, busier on weekends.
  for (let d = -SAMPLE_PAST_DAYS; d <= 0; d++) {
    const date = addDaysStr(today, d);
    const dowS = new Date(date + 'T12:00:00Z').getUTCDay();
    const n = Math.floor((dowS === 0 || dowS === 6 ? 10 : 5) + r() * 10);
    for (let i = 0; i < n; i++) {
      const at = teeTimeInstant(tz, date, `${String(8 + Math.floor(r() * 9)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`);
      if (!at || at.getTime() > nowMs) continue;
      const lines = Array.from({ length: 1 + Math.floor(r() * 3) }, () => { const it = pick(items); return { shopItemId: it.id, name: it.name, unitPriceCents: it.priceCents, quantity: r() < 0.2 ? 2 : 1 }; });
      const total = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
      const cash = r() < 0.4;
      const who = r() < 0.5 ? golfer() : null;
      sales.push({ sale: { courseId, status: cash ? 'paid_cash' : 'paid_card', totalCents: total, paidAt: at, createdAt: at, soldBy: SAMPLE_SOLD_BY, customerName: who?.name ?? '', customerPhone: who?.phone ?? '', cashTenderedCents: cash ? Math.ceil(total / 500) * 500 : null }, lines });
    }
  }

  // Write it all. Booking ids are made here so events and register lines can point at them.
  for (let i = 0; i < bookings.length; i += 500) await prisma.booking.createMany({ data: bookings.slice(i, i + 500) as unknown as Prisma.BookingCreateManyInput[] });
  for (let i = 0; i < events.length; i += 1000) await prisma.bookingEvent.createMany({ data: events.slice(i, i + 1000) as unknown as Prisma.BookingEventCreateManyInput[] });
  // Batched, so the fill fits Vercel's time limit against a remote database.
  const saleRows = sales.map(x => ({ ...x.sale, id: `smp${randomUUID().replace(/-/g, '').slice(0, 22)}` }));
  const lineRows = sales.flatMap((x, i) => x.lines.map(l => ({ ...l, saleId: saleRows[i].id })));
  for (let i = 0; i < saleRows.length; i += 500) await prisma.shopSale.createMany({ data: saleRows.slice(i, i + 500) as unknown as Prisma.ShopSaleCreateManyInput[] });
  // The register's ledger rows (lib/shop-sales): a round rung up in cash is a 'round' row, the rest 'shop'.
  for (const sr of saleRows as unknown as { id: string; status: string; totalCents: number; roundsCents?: number; paidAt: Date }[]) {
    const rounds = sr.roundsCents ?? 0;
    const method = sr.status === 'paid_cash' ? 'cash' : 'card';
    if (rounds > 0) moves.push({ courseId, what: 'round', direction: 'in', method, account: 'course', amountCents: rounds, saleId: sr.id, actor: 'staff', at: sr.paidAt, note: SAMPLE_SOLD_BY });
    if (sr.totalCents - rounds > 0) moves.push({ courseId, what: 'shop', direction: 'in', method, account: 'course', amountCents: sr.totalCents - rounds, saleId: sr.id, actor: 'staff', at: sr.paidAt, note: SAMPLE_SOLD_BY });
  }
  for (let i = 0; i < lineRows.length; i += 1000) await prisma.shopSaleLine.createMany({ data: lineRows.slice(i, i + 1000) as unknown as Prisma.ShopSaleLineCreateManyInput[] });
  // Paid walk-up sales take from counted stock, as the register does (never below zero).
  const sold = new Map<string, number>();
  for (const { lines } of sales) for (const l of lines) if (typeof l.shopItemId === 'string') sold.set(l.shopItemId, (sold.get(l.shopItemId) ?? 0) + Number(l.quantity ?? 1));
  for (const it of await prisma.shopItem.findMany({ where: { id: { in: [...sold.keys()] }, stockCount: { not: null } }, select: { id: true, stockCount: true } })) {
    await prisma.shopItem.update({ where: { id: it.id }, data: { stockCount: Math.max(0, (it.stockCount ?? 0) - (sold.get(it.id) ?? 0)) } });
  }
  const full = slots.filter(s => (booked.get(s.id) ?? 0) >= s.playersAvailable).map(s => s.id);
  // One update per distinct count and status, not one per tee time.
  const byCount = new Map<string, string[]>();
  for (const [id, n] of booked) { const k = `${n}|${full.includes(id) ? 'full' : 'available'}`; byCount.set(k, [...(byCount.get(k) ?? []), id]); }
  for (const [k, ids] of byCount) { const [n, status] = k.split('|'); await prisma.teeTime.updateMany({ where: { id: { in: ids } }, data: { playersBooked: Number(n), status } }); }

  // 7. Member accounts: each full member's rounds, closed into a statement per finished month.
  //    Older statements are paid by card (a ledger row each); last month's is still open.
  const thisMonth = today.slice(0, 7);
  const byStatement = new Map<string, typeof charges>();
  for (const c of charges) {
    const period = c.createdAt.toISOString().slice(0, 7);
    if (period >= thisMonth) continue;
    const k = `${c.membershipId}|${period}`;
    byStatement.set(k, [...(byStatement.get(k) ?? []), c]);
  }
  const statementOf = new Map<string, string>();
  const statements: Record<string, unknown>[] = [];
  const lastClosed = addDaysStr(`${thisMonth}-01`, -1).slice(0, 7);
  for (const [k, lines] of byStatement) {
    const [membershipId, period] = k.split('|');
    const id = `smp${randomUUID().replace(/-/g, '').slice(0, 22)}`;
    const closedAt = new Date(`${addDaysStr(`${period}-28`, 4).slice(0, 7)}-01T12:00:00Z`);
    const totalCents = lines.reduce((t, l) => t + l.amountCents, 0);
    const feeCents = lines.reduce((t, l) => t + l.feeCents, 0);
    // Paid a few days after it closed — never later than now (a fill early in a month leaves last month's open).
    const payAt = closedAt.getTime() + Math.floor(1 + r() * 9) * 86_400_000;
    const paidAt = (period === lastClosed && r() < 0.6) || payAt >= nowMs - 60_000 ? null : new Date(payAt);
    statements.push({ id, courseId, membershipId, period, closedAt, dueAt: new Date(closedAt.getTime() + 15 * 86_400_000), totalCents, feeCents, status: paidAt ? 'paid' : 'open', payToken: randomUUID(), paidAt });
    for (const l of lines) statementOf.set(l.id, id);
    if (paidAt) moves.push({ courseId, what: 'account', direction: 'in', method: 'card', account: 'course', amountCents: totalCents, platformFeeCents: feeCents, membershipId, actor: 'golfer', at: paidAt, note: `Statement ${period}` });
  }
  for (let i = 0; i < statements.length; i += 500) await prisma.memberStatement.createMany({ data: statements.slice(i, i + 500) as unknown as Prisma.MemberStatementCreateManyInput[] });
  const chargeRows = charges.map(c => ({ id: c.id, courseId, membershipId: c.membershipId, kind: c.kind, amountCents: c.amountCents, feeCents: c.feeCents, bookingId: c.bookingId, note: c.note, createdBy: SAMPLE_SOLD_BY, createdAt: c.createdAt, statementId: statementOf.get(c.id) ?? null }));
  for (let i = 0; i < chargeRows.length; i += 1000) await prisma.memberCharge.createMany({ data: chargeRows.slice(i, i + 1000) });

  // 8. Dues paid this year: a ledger row per paid membership (card online, or cash/check at the course).
  for (const m of membershipRows) {
    if (m.paymentStatus === 'unpaid' || !m.lastPaidAt) continue;
    const person = members.find(p => p.membershipId === m.id);
    // By card the member pays dues + GreenReserve's 1% (membershipFeeCents), as the dues pay link charges.
    const dues = person?.member?.annualFeeCents ?? 0;
    const card = m.paymentStatus !== 'paid_offline';
    const fee = card ? membershipFeeCents(dues) : 0;
    moves.push({ courseId, what: 'dues', direction: 'in', method: card ? 'card' : 'other', account: 'course', amountCents: dues + fee, platformFeeCents: fee, membershipId: m.id, actor: card ? 'golfer' : 'staff', at: m.lastPaidAt, note: 'Sample data' });
  }

  // 9. The outing's money: the organizer's deposit by check, and part of the balance by card.
  if (eventName) {
    const ev = await prisma.courseEvent.findFirst({ where: { courseId, createdBy: SAMPLE_SOLD_BY }, select: { id: true } });
    if (ev && !(await prisma.courseEventPayment.count({ where: { eventId: ev.id } }))) {
      const depositAt = new Date(nowMs - 20 * 86_400_000), partAt = new Date(nowMs - 3 * 86_400_000);
      const dep = await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId, kind: 'deposit', label: 'Deposit', amountCents: 150000, method: 'check', status: 'paid', paidAt: depositAt, payerName: 'Pat Organizer', createdBy: SAMPLE_SOLD_BY } });
      const bal = await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId, kind: 'balance', label: 'Part of the balance', amountCents: 300000, method: 'link', status: 'paid', paidAt: partAt, payerName: 'Pat Organizer', payToken: randomUUID(), createdBy: SAMPLE_SOLD_BY } });
      await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId, kind: 'balance', label: 'Balance for 72 players', amountCents: 234000, method: 'link', status: 'open', payerName: 'Pat Organizer', payToken: randomUUID(), headcount: 72, createdBy: SAMPLE_SOLD_BY } });
      moves.push({ courseId, what: 'event', direction: 'in', method: 'other', account: 'course', amountCents: 150000, eventPaymentId: dep.id, actor: 'staff', at: depositAt, note: 'check at the course' });
      moves.push({ courseId, what: 'event', direction: 'in', method: 'card', account: 'course', amountCents: 300000, eventPaymentId: bal.id, actor: 'golfer', at: partAt, note: 'Sample data' });
    }
  }

  // 10. Staff notes on regulars (the golfer record, keyed by their phone — the emails are placeholders).
  const noteText = ['Always wants a cart.', 'Prefers the first tee time of the day.', 'Left-handed rentals.', 'Plays with his son on Saturdays.', 'Ask about the member drive.', 'Paid a deposit for the club championship.', 'Needs a single to fill a group.', 'Celebrating a birthday this month.'];
  const notes = people.slice(0, 80).filter(() => r() < 0.5).map(pp => ({ courseId, golferKey: golferKey({ golferPhone: pp.phone })!, body: pick(noteText), createdBy: SAMPLE_SOLD_BY, createdAt: new Date(nowMs - Math.floor(r() * 120) * 86_400_000) }));
  if (notes.length) await prisma.golferNote.createMany({ data: notes });

  // 11. The register close-out for each of the last 60 days: what the drawer should hold, and a count
  //     that is almost always right (lib/register-close).
  const closes: Record<string, unknown>[] = [];
  // Each sale's course day worked out once (a time-zone lookup per sale per day was most of the fill's time).
  const dayTotals = new Map<string, { cash: number; card: number }>();
  for (const x of saleRows as unknown as { status: string; totalCents: number; paidAt: Date }[]) {
    const k = todayIn(tz, x.paidAt); const t = dayTotals.get(k) ?? { cash: 0, card: 0 };
    if (x.status === 'paid_cash') t.cash += x.totalCents; else if (x.status === 'paid_card') t.card += x.totalCents;
    dayTotals.set(k, t);
  }
  for (let d = -60; d < 0; d++) {
    const day = addDaysStr(today, d);
    const { cash, card } = dayTotals.get(day) ?? { cash: 0, card: 0 };
    const expected = 20000 + cash;
    const diff = r() < 0.85 ? 0 : (r() < 0.5 ? -1 : 1) * (100 * Math.floor(1 + r() * 20));
    const at = teeTimeInstant(tz, day, '19:30') ?? new Date(nowMs);
    closes.push({ courseId, day, openingFloatCents: 20000, cashSalesCents: cash, counterRoundsCents: 0, cashRefundsCents: 0, expectedCashCents: expected, countedCashCents: expected + diff, differenceCents: diff, cardCents: card, note: diff ? 'Counted twice.' : '', closedBy: SAMPLE_SOLD_BY, createdAt: at });
  }
  await prisma.registerClose.createMany({ data: closes as unknown as Prisma.RegisterCloseCreateManyInput[] });

  // Promo uses, and the ledger last (it points at bookings, sales, memberships and event payments).
  for (const [id, n] of promoUses) await prisma.promoCode.update({ where: { id }, data: { usesCount: { increment: n } } });
  for (let i = 0; i < moves.length; i += 1000) await prisma.moneyMove.createMany({ data: moves.slice(i, i + 1000) as unknown as Prisma.MoneyMoveCreateManyInput[] });

  return {
    ok: true,
    made: { ledgerRows: moves.length, accountCharges: charges.length, statements: statements.length, notes: notes.length, promoCodes, closes: closes.length,
      teeTimes, bookings: bookings.length, members: members.length, residents: residentPeople.length, shopItems, shopSales: sales.length, event: eventName, eventNote },
  };
}

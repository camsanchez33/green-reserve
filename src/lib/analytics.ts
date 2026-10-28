// AN-1 (Cam 2026-10-01): the operator Analytics tab. Every number is computed
// here, server-side, from Booking / TeeTime / BookingEvent rows — no sample or
// hard-coded figures. Money is integer cents throughout.
//
// One basis for every section: a booking or tee time belongs to the range by
// its TEE-TIME DATE (the course's local calendar day), so "Revenue on the 14th"
// and "fill rate on the 14th" describe the same rounds. Lead time and channel
// use the same set of bookings.
//
// Definitions (the UI repeats the short form of each):
//   course share     green + cart + range balls. GreenReserve's $1.50/player
//                    booking fee is the golfer's, never the course's revenue.
//   expected         course share of every non-cancelled booking whose tee time
//                    has passed. (A partial-party check-in rewrites the booking's
//                    price to the players who came, so before the event log
//                    (EV-1, Oct 1 2026) a partial shortfall is invisible.)
//   collected        course share of completed bookings: paid by card at
//                    check-in ('paid') or at the counter ('paid_offline').
//                    There is no online prepay — cards are charged at check-in.
//   outstanding      non-cancelled, tee time passed, not collected.
//   spots for sale   playersAvailable of every non-blocked tee time.
//   no-show          non-cancelled, never checked in, tee time + grace passed.
//   unfilled slot    non-blocked tee time that passed with open spots; lost
//                    revenue = open spots × that slot's green fee.
//   customer         matched on real email, else phone, else account id. A
//                    walk-in with none of those is "unidentified".
//   earned per spot  (W2-8) collected course share of an hour's past tee times
//                    ÷ every spot offered in them, sold or not.
//   short-show       checked in with fewer players than booked.
//   called off       (W2-8) a booking the course cancelled for weather or a
//                    closure (cancel event metadata.courseCalledOff) — not a
//                    cancellation; left out of the cancellation rate.
//   turned away      tee times that sold out, and TeeTimeAlert sign-ups for a
//                    date in the range (golfers who asked to hear of an opening).
//   residents        RES-1 resident players on paid rounds, from RES_START.
//   beyond the fee   (W2-8) rounds with a cart ÷ paid rounds; shop items added
//                    to paid rounds (before tax); walk-up shop sales paid in the
//                    range (before tax). Never part of revenue.
//   gone quiet       (W2-8) a golfer with 3+ rounds on different days whose last
//                    round is 14+ days and more than twice their usual gap ago,
//                    and who has no booking after that day.
//   rate vs posted   (W2-8) green fees collected on paid rounds, against that
//                    tee time's posted price × the players who paid. Split by
//                    rate: standard, residents, each member tier. "Below
//                    posted" is the difference — an exact figure, not an estimate.
//   pace             (W2-8) for each of the next 14 days, players booked so far
//                    vs the same weekday the same number of days out, averaged
//                    over the last four weeks (bookings made by then and not yet
//                    cancelled by then; a group counts at its size today).
import type { BookingEventType } from '@prisma/client';
import { prisma } from './prisma';
import { DEFAULT_TZ, isValidTimezone, todayIn, addDaysStr } from './course-time';
import { teeToUtcMs } from './tee-time-utils';
import { PLACEHOLDER_EMAIL_DOMAIN } from './email';

/** EV-1's event log went live on this day; metrics that need it start here. */
export const EVENT_LOG_START = '2026-10-01';
export const NO_SHOW_GRACE_MIN = 30;
/** RES-1: resident players and their rate are recorded on bookings from this day. */
export const RES_START = '2026-10-19';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Range = { from: string; to: string };

const share = (b: { greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number }) => b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal;
/** The course's share of a booking — Analytics' revenue definition, also Members' spend (DENSE-5). */
export const courseShareCents = share;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const dowOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

function customerKey(b: { golferEmail: string; golferPhone: string; golferAccountId: string | null }): string | null {
  const email = b.golferEmail.trim().toLowerCase();
  if (email && !email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) return `e:${email}`;
  const digits = b.golferPhone.replace(/\D/g, '');
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  if (b.golferAccountId) return `a:${b.golferAccountId}`;
  return null;
}

/** Monday-start week key for a date string. */
function weekOf(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;
  return addDaysStr(date, -back);
}

export function previousRange(r: Range): Range {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDaysStr(r.from, -len), to: addDaysStr(r.from, -1) };
}

type Loaded = Awaited<ReturnType<typeof load>>;

async function load(courseId: string, range: Range) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, name: true } });
  const tz = course?.timezone && isValidTimezone(course.timezone) ? course.timezone : DEFAULT_TZ;
  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: range.from, lte: range.to } },
    select: {
      id: true, date: true, time: true, status: true, playersAvailable: true, playersBooked: true, greenFeeCents: true, cartFeeCents: true,
      bookings: {
        select: {
          id: true, status: true, paymentStatus: true, players: true, checkedInPlayers: true, checkedInAt: true, noShowAt: true,
          greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, accessFeeTotal: true, cancellationFeeTotal: true,
          cancelledAt: true, createdAt: true, source: true, golferName: true, golferEmail: true, golferPhone: true, golferAccountId: true,
          // W2-8: residents (RES-1) and whether the booking carried a fee policy.
          residentPlayers: true, residentRateCents: true, cancellationFeeApplies: true, appliedRate: true,
          // W2-8 (4): pro-shop items added to the round (POS-1a), before tax.
          shopTotalCents: true,
        },
      },
    },
  });
  return { tz, courseName: course?.name ?? '', teeTimes };
}

/** Compute every section for one range. `now` is injectable for tests. */
export async function computeAnalytics(courseId: string, range: Range, now: Date = new Date()) {
  const L = await load(courseId, range);
  const { tz } = L;
  const nowMs = now.getTime();
  const today = todayIn(tz, now);
  const teeMs = (date: string, time: string) => teeToUtcMs(date, time, tz);

  // ── Flatten ───────────────────────────────────────────────────────────────
  type B = Loaded['teeTimes'][number]['bookings'][number] & { date: string; time: string; teeTimeId: string; teeAt: number; passed: boolean };
  const bookings: B[] = [];
  for (const t of L.teeTimes) {
    const at = teeMs(t.date, t.time);
    for (const b of t.bookings) bookings.push({ ...b, date: t.date, time: t.time, teeTimeId: t.id, teeAt: at, passed: at + NO_SHOW_GRACE_MIN * 60000 < nowMs });
  }
  const live = bookings.filter(b => b.status !== 'cancelled');
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const collectedB = live.filter(b => b.status === 'completed' && (b.paymentStatus === 'paid' || b.paymentStatus === 'paid_offline'));
  const pastLive = live.filter(b => b.passed);
  const collectedSet = new Set(collectedB);

  // ── 1. Revenue ────────────────────────────────────────────────────────────
  const expected = pastLive.reduce((s, b) => s + share(b), 0);
  const collected = collectedB.reduce((s, b) => s + share(b), 0);
  const card = collectedB.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + share(b), 0);
  const counter = collectedB.filter(b => b.paymentStatus === 'paid_offline').reduce((s, b) => s + share(b), 0);
  const outstandingB = pastLive.filter(b => !collectedSet.has(b));
  const outstanding = outstandingB.reduce((s, b) => s + share(b), 0);
  const upcomingB = live.filter(b => !b.passed && !collectedSet.has(b));
  const upcoming = upcomingB.reduce((s, b) => s + share(b), 0);
  // Review (spec): the Money tab's Pending tiles, now here — upcoming rounds
  // with a card saved (charged at check-in), and upcoming rounds paid at the
  // counter / no card needed / cutoff hold already taken.
  const onCard = upcomingB.filter(b => b.paymentStatus === 'card_on_file' || b.paymentStatus === 'no_payment_method');
  const awaiting = upcomingB.filter(b => !onCard.includes(b));
  const lateFeesKept = cancelled.filter(b => b.paymentStatus === 'cancellation_fee_charged').reduce((s, b) => s + b.cancellationFeeTotal, 0);
  const holdsHeld = live.filter(b => b.paymentStatus === 'cancellation_fee_charged').reduce((s, b) => s + b.cancellationFeeTotal, 0);
  const grFees = collectedB.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.accessFeeTotal, 0);
  const greenCollected = collectedB.reduce((s, b) => s + b.greenFeeTotal, 0);
  const cartCollected = collectedB.reduce((s, b) => s + b.cartFeeTotal, 0);
  const roundsPlayed = collectedB.reduce((s, b) => s + (b.checkedInPlayers ?? b.players), 0);
  const pastSlotsForSale = L.teeTimes.filter(t => t.status !== 'blocked' && teeMs(t.date, t.time) < nowMs).length;

  const byWeek = daysBetween(range.from, range.to) > 45;
  const bucketOf = (date: string) => (byWeek ? weekOf(date) : date);
  // DENSE-1: rounds and spots per bucket too, so the chart can plot all four headline numbers.
  const series = new Map<string, { expected: number; collected: number; rounds: number; sale: number; booked: number }>();
  for (let d = range.from; d <= range.to && d <= today; d = addDaysStr(d, 1)) {
    const k = bucketOf(d); if (!series.has(k)) series.set(k, { expected: 0, collected: 0, rounds: 0, sale: 0, booked: 0 });
  }
  for (const b of pastLive) { const r = series.get(bucketOf(b.date)); if (r) r.expected += share(b); }
  for (const b of collectedB) { const r = series.get(bucketOf(b.date)); if (r) { r.collected += share(b); r.rounds += b.checkedInPlayers ?? b.players; } }
  // DENSE-2: the same collected course share, by the tee time's weekday and hour (Money's sales charts).
  const collectedByDow = Array.from({ length: 7 }, () => 0);
  const collectedByHour = new Map<number, number>();
  for (const b of collectedB) {
    collectedByDow[dowOf(b.date)] += share(b);
    const h = Number(b.time.slice(0, 2));
    collectedByHour.set(h, (collectedByHour.get(h) ?? 0) + share(b));
  }

  // ── 2. Utilization ───────────────────────────────────────────────────────
  const forSale = L.teeTimes.filter(t => t.status !== 'blocked');
  const agg = () => ({ sale: 0, booked: 0 });
  const byDay = new Map<string, ReturnType<typeof agg>>();
  const byDow = Array.from({ length: 7 }, agg);
  const byHour = new Map<number, ReturnType<typeof agg>>();
  const heat = new Map<string, ReturnType<typeof agg>>();
  // W2-8 (1): what each hour EARNED per spot offered (revenue per available
  // spot). Past tee times only — upcoming ones haven't had the chance to earn.
  const heatEarned = new Map<string, { spots: number; cents: number }>();
  const collectedByTeeTime = new Map<string, number>();
  for (const b of collectedB) collectedByTeeTime.set(b.teeTimeId, (collectedByTeeTime.get(b.teeTimeId) ?? 0) + share(b));
  let sale = 0, bookedSpots = 0;
  for (const t of forSale) {
    const booked = Math.min(t.playersBooked, t.playersAvailable);
    const h = Number(t.time.slice(0, 2)), w = dowOf(t.date);
    sale += t.playersAvailable; bookedSpots += booked;
    for (const [m, k] of [[byDay, t.date], [byHour, h], [heat, `${w}-${h}`]] as const) {
      const map = m as Map<string | number, ReturnType<typeof agg>>;
      if (!map.has(k)) map.set(k, agg());
      const r = map.get(k)!; r.sale += t.playersAvailable; r.booked += booked;
    }
    byDow[w].sale += t.playersAvailable; byDow[w].booked += booked;
    { const sr = series.get(bucketOf(t.date)); if (sr) { sr.sale += t.playersAvailable; sr.booked += booked; } }
    if (teeMs(t.date, t.time) < nowMs) {
      const e = heatEarned.get(`${w}-${h}`) ?? { spots: 0, cents: 0 };
      e.spots += t.playersAvailable; e.cents += collectedByTeeTime.get(t.id) ?? 0;
      heatEarned.set(`${w}-${h}`, e);
    }
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b);

  // ── 3. Unfilled slots ────────────────────────────────────────────────────
  const unfilled = forSale
    .filter(t => teeMs(t.date, t.time) < nowMs && t.playersBooked < t.playersAvailable)
    .map(t => ({ date: t.date, time: t.time, open: t.playersAvailable - t.playersBooked, lostCents: (t.playersAvailable - t.playersBooked) * t.greenFeeCents }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const lostBy = <K,>(key: (u: typeof unfilled[number]) => K) => {
    const m = new Map<K, { slots: number; open: number; lostCents: number }>();
    for (const u of unfilled) { const k = key(u); const r = m.get(k) ?? { slots: 0, open: 0, lostCents: 0 }; r.slots++; r.open += u.open; r.lostCents += u.lostCents; m.set(k, r); }
    return m;
  };
  const lostByHour = lostBy(u => Number(u.time.slice(0, 2)));
  const lostByDow = lostBy(u => dowOf(u.date));

  // ── 4. No-shows ──────────────────────────────────────────────────────────
  const noShows = pastLive.filter(b => !b.checkedInAt && b.status !== 'completed');
  const repeatNs = new Map<string, { name: string; count: number }>();
  for (const b of noShows) {
    const k = customerKey(b); if (!k) continue;
    const r = repeatNs.get(k) ?? { name: b.golferName, count: 0 }; r.count++; repeatNs.set(k, r);
  }

  // ── 5. Cancellations ─────────────────────────────────────────────────────
  const cancelEvents = await prisma.bookingEvent.findMany({
    where: { courseId, type: 'booking_cancelled' satisfies BookingEventType, bookingId: { in: cancelled.map(b => b.id) } },
    select: { bookingId: true, actorType: true, metadata: true },
  });
  const cancelActor = new Map(cancelEvents.map(e => [e.bookingId, e.actorType]));
  // W2-8 (8): rounds the COURSE called off (weather, a closure) are not golfers
  // cancelling — counted on their own and left out of the cancellation rate.
  const calledOffOf = new Map<string, 'weather' | 'closure'>();
  for (const e of cancelEvents) {
    const m = e.metadata as { courseCalledOff?: unknown } | null;
    if (m && (m.courseCalledOff === 'weather' || m.courseCalledOff === 'closure')) calledOffOf.set(e.bookingId, m.courseCalledOff);
  }
  const calledOff = cancelled.filter(b => calledOffOf.has(b.id));
  const golferCancelled = cancelled.filter(b => !calledOffOf.has(b.id));
  const leadBuckets = { under24h: 0, d1to3: 0, over3d: 0, unknown: 0 };
  let byCustomer = 0, byStaff = 0, actorUnknown = 0, rebooked = 0;
  for (const b of golferCancelled) {
    if (b.cancelledAt) {
      const hrs = (b.teeAt - b.cancelledAt.getTime()) / 3600000;
      if (hrs < 24) leadBuckets.under24h++; else if (hrs < 72) leadBuckets.d1to3++; else leadBuckets.over3d++;
      if (bookings.some(o => o.teeTimeId === b.teeTimeId && o.id !== b.id && o.status !== 'cancelled' && o.createdAt > b.cancelledAt!)) rebooked++;
    } else leadBuckets.unknown++;
    const a = cancelActor.get(b.id);
    if (!a) actorUnknown++; else if (a === 'golfer') byCustomer++; else byStaff++;
  }

  // ── W2-8 (7): short-shows, and no-shows split by the booking's fee policy ──
  const checkedIn = pastLive.filter(b => b.checkedInAt);
  const shortShows = checkedIn.filter(b => b.checkedInPlayers != null && b.checkedInPlayers < b.players);
  const policy = (fee: boolean) => {
    const set = pastLive.filter(b => b.cancellationFeeApplies === fee);
    const ns = noShows.filter(b => b.cancellationFeeApplies === fee).length;
    const players = set.reduce((n, b) => n + b.players, 0);
    // Booked players who didn't play: the whole group for a no-show, the gap for a short-show.
    const missing = set.reduce((n, b) => n + (!b.checkedInAt ? b.players : Math.max(0, b.players - (b.checkedInPlayers ?? b.players))), 0);
    return { bookings: set.length, noShowPct: pct(ns, set.length), didntPlayPct: pct(missing, players) };
  };

  // ── W2-8 (6): demand turned away — full times, and golfers who asked to hear of an opening ──
  const soldOut = forSale.filter(t => t.playersBooked >= t.playersAvailable && t.playersAvailable > 0);
  const alerts = await prisma.teeTimeAlert.findMany({
    where: { courseId, date: { gte: range.from, lte: range.to } },
    select: { date: true, windowStart: true, players: true, notifiedAt: true, teeTime: { select: { time: true } } },
  });
  const soldOutBy = new Map<string, number>();
  for (const t of soldOut) { const k = `${dowOf(t.date)}-${Number(t.time.slice(0, 2))}`; soldOutBy.set(k, (soldOutBy.get(k) ?? 0) + 1); }

  // ── W2-8 (8): days and times the course closed ──
  const [closedDays] = await Promise.all([
    prisma.blackout.findMany({ where: { courseId, date: { gte: range.from, lte: range.to } }, select: { date: true, reason: true } }),
  ]);

  // ── W2-8 (3): residents vs everyone else (RES-1, recorded from Oct 19 2026) ──
  const resRows = new Map<string, { resPlayers: number; otherPlayers: number; resCents: number; otherCents: number }>();
  for (const b of collectedB) {
    if (b.date < RES_START) continue; // residency wasn't recorded before RES-1 — unknown, not "everyone else"
    const players = b.checkedInPlayers ?? b.players;
    const res = Math.min(b.residentPlayers, players);
    const resCents = res > 0 && b.residentRateCents != null ? Math.min(b.greenFeeTotal, res * b.residentRateCents) : 0;
    const r = resRows.get(b.date) ?? { resPlayers: 0, otherPlayers: 0, resCents: 0, otherCents: 0 };
    r.resPlayers += res; r.otherPlayers += players - res; r.resCents += resCents; r.otherCents += b.greenFeeTotal - resCents;
    resRows.set(b.date, r);
  }

  // ── W2-8 (2): the rate golfers actually paid vs the price posted for that tee time ──
  const postedOf = new Map(L.teeTimes.map(t => [t.id, t.greenFeeCents]));
  const rateRows = new Map<string, { players: number; paidCents: number; postedCents: number }>();
  const addRate = (k: string, players: number, paid: number, posted: number) => {
    if (players <= 0) return;
    const r = rateRows.get(k) ?? { players: 0, paidCents: 0, postedCents: 0 };
    r.players += players; r.paidCents += paid; r.postedCents += posted; rateRows.set(k, r);
  };
  for (const b of collectedB) {
    const posted = postedOf.get(b.teeTimeId) ?? 0;
    if (posted <= 0) continue; // a free time has no posted price to compare against
    const players = b.checkedInPlayers ?? b.players;
    if (b.appliedRate !== 'standard' && b.appliedRate !== 'resident') { addRate(`tier:${b.appliedRate}`, players, b.greenFeeTotal, players * posted); continue; }
    const res = Math.min(b.residentPlayers, players);
    const resCents = res > 0 && b.residentRateCents != null ? Math.min(b.greenFeeTotal, res * b.residentRateCents) : 0;
    addRate('resident', res, resCents, res * posted);
    addRate('standard', players - res, b.greenFeeTotal - resCents, (players - res) * posted);
  }
  const rateList = [...rateRows.entries()]
    .map(([k, r]) => ({ rate: k === 'standard' ? 'Standard' : k === 'resident' ? 'Residents' : k.slice(5), kind: k.startsWith('tier:') ? 'member' as const : k as 'standard' | 'resident', ...r, ofPostedPct: pct(r.paidCents, r.postedCents) }))
    .sort((a, b) => b.players - a.players);
  const ratePaid = rateList.reduce((n, r) => n + r.paidCents, 0), ratePosted = rateList.reduce((n, r) => n + r.postedCents, 0);

  // ── W2-8 (5): booking pace — the next 14 days against the same weekday, same days out, over the last four weeks ──
  const pace = await bookingPace(courseId, today, nowMs);

  // ── W2-8 (4): spend beyond the green fee — carts, shop items on rounds, walk-up shop sales ──
  // Pro-shop money is its own line (Cam 2026-10-22): never part of "revenue".
  const cartRounds = collectedB.filter(b => b.cartFeeTotal > 0).length;
  const shopOnRounds = collectedB.reduce((n, b) => n + b.shopTotalCents, 0);
  const walkUps = await prisma.shopSale.findMany({
    where: { courseId, status: { in: ['paid_cash', 'paid_card'] }, paidAt: { gte: new Date(teeMs(range.from, '00:00')), lt: new Date(teeMs(addDaysStr(range.to, 1), '00:00')) } },
    select: { totalCents: true, taxCents: true, refundedCents: true, roundsCents: true },
  });
  const walkUp = walkUpNet(walkUps);

  // ── 6. Customers ─────────────────────────────────────────────────────────
  // History is all-time up to the range end, so "returning" knows the past.
  const history = await prisma.booking.findMany({
    where: { courseId, status: { not: 'cancelled' }, teeTime: { date: { lte: range.to } } },
    select: { golferEmail: true, golferPhone: true, golferAccountId: true, golferName: true, teeTime: { select: { date: true } } },
  });
  const visits = new Map<string, { name: string; dates: string[] }>();
  for (const h of history) {
    const k = customerKey(h); if (!k) continue;
    const r = visits.get(k) ?? { name: h.golferName, dates: [] }; r.dates.push(h.teeTime.date); visits.set(k, r);
  }
  const inRange = new Map<string, { name: string; rounds: number; players: number; spendCents: number }>();
  let unidentified = 0, unidentifiedPlayers = 0;
  for (const b of live) {
    const k = customerKey(b);
    if (!k) { unidentified++; unidentifiedPlayers += b.players; continue; }
    const r = inRange.get(k) ?? { name: b.golferName, rounds: 0, players: 0, spendCents: 0 };
    r.rounds++; r.players += b.players; if (collectedSet.has(b)) r.spendCents += share(b);
    inRange.set(k, r);
  }
  let newC = 0, returningC = 0;
  for (const k of inRange.keys()) {
    const dates = (visits.get(k)?.dates ?? []).sort();
    // Returning = more than one non-cancelled booking with this customer, ever
    // (up to the range end) — Cam's definition; a first visit in the range
    // that came back inside it counts as returning too.
    if (dates.length > 1) returningC++; else newC++;
  }
  const gaps: number[] = [];
  for (const k of inRange.keys()) {
    const ds = [...new Set(visits.get(k)?.dates ?? [])].sort();
    if (ds.length < 2) continue;
    let sum = 0; for (let i = 1; i < ds.length; i++) sum += daysBetween(ds[i - 1], ds[i]);
    gaps.push(sum / (ds.length - 1));
  }
  // W2-8 (9): regulars who've gone quiet — 3+ rounds on different days, and the
  // time since their last round is more than twice their usual gap (and at
  // least two weeks), measured to the end of the range (or today).
  const asOf = range.to < today ? range.to : today;
  const contactOf = new Map<string, { email: string; phone: string }>();
  for (const h of history) {
    const k = customerKey(h); if (!k || contactOf.has(k)) continue;
    const email = h.golferEmail.trim().toLowerCase();
    contactOf.set(k, { email: email && !email.endsWith(PLACEHOLDER_EMAIL_DOMAIN) ? email : '', phone: h.golferPhone.trim() });
  }
  // A golfer who has already booked their next round isn't quiet — leave them off.
  const booked = await prisma.booking.findMany({
    where: { courseId, status: { not: 'cancelled' }, teeTime: { date: { gt: asOf } } },
    select: { golferEmail: true, golferPhone: true, golferAccountId: true },
  });
  const bookedAhead = new Set(booked.map(customerKey).filter((k): k is string => !!k));
  const goneQuiet: { name: string; email: string; phone: string; rounds: number; lastPlayed: string; usualGapDays: number; daysSince: number }[] = [];
  for (const [k, v] of visits) {
    if (bookedAhead.has(k)) continue;
    const ds = [...new Set(v.dates.filter(x => x <= asOf))].sort();
    if (ds.length < 3) continue;
    const usual = daysBetween(ds[0], ds[ds.length - 1]) / (ds.length - 1);
    const since = daysBetween(ds[ds.length - 1], asOf);
    if (since >= 14 && since > 2 * usual) goneQuiet.push({ name: v.name, ...(contactOf.get(k) ?? { email: '', phone: '' }), rounds: ds.length, lastPlayed: ds[ds.length - 1], usualGapDays: Math.round(usual), daysSince: since });
  }
  goneQuiet.sort((a, b) => b.rounds - a.rounds || b.daysSince - a.daysSince);

  // Retention: of the customers who played in the previous equal-length
  // period, the share who played again in this one.
  const prev = previousRange(range);
  const prevKeys = new Set<string>(), thisKeys = new Set(inRange.keys());
  for (const h of history) { const k = customerKey(h); if (k && h.teeTime.date >= prev.from && h.teeTime.date <= prev.to) prevKeys.add(k); }
  const retained = [...prevKeys].filter(k => thisKeys.has(k)).length;
  const top = [...inRange.values()];

  // Members (moved off the Members tab's header, AN-1): current counts, not
  // range-bound — a membership is a standing state, not a dated event.
  const [membersActive, membersOnFile, tiers] = await Promise.all([
    prisma.courseMembership.count({ where: { courseId, status: 'active' } }),
    prisma.courseMembership.count({ where: { courseId } }),
    prisma.membershipTier.count({ where: { courseId } }),
  ]);

  // ── 7. Booking behaviour ─────────────────────────────────────────────────
  const leadDays = live.map(b => Math.max(0, (b.teeAt - b.createdAt.getTime()) / 86400000));
  const leadHist = { sameDay: 0, d1to2: 0, d3to7: 0, d8to14: 0, d15plus: 0 };
  for (const d of leadDays) {
    if (d < 1) leadHist.sameDay++; else if (d < 3) leadHist.d1to2++; else if (d < 8) leadHist.d3to7++; else if (d < 15) leadHist.d8to14++; else leadHist.d15plus++;
  }
  const channel = { online: 0, walk_in: 0, phone: 0 } as Record<string, number>;
  for (const b of live) channel[b.source] = (channel[b.source] ?? 0) + 1;

  const playersLive = live.reduce((s, b) => s + b.players, 0);

  return {
    range, courseName: L.courseName, today, eventLogStart: EVENT_LOG_START, graceMinutes: NO_SHOW_GRACE_MIN,
    revenue: {
      expectedCents: expected, collectedCents: collected, gapCents: expected - collected, gapPct: pct(expected - collected, expected),
      cardCents: card, counterCents: counter, outstandingCents: outstanding, outstandingBookings: outstandingB.length, upcomingCents: upcoming,
      // W2-8 (4): beyond the green fee — rounds with a cart, shop items on rounds, and walk-up shop sales (before tax).
      beyond: {
        cartRounds, rounds: collectedB.length, cartPct: pct(cartRounds, collectedB.length),
        shopOnRoundsCents: shopOnRounds, shopPerRoundCents: roundsPlayed ? Math.round(shopOnRounds / roundsPlayed) : null,
        walkUpSales: walkUp.sales, walkUpCents: walkUp.cents,
      },
      // W2-8 (2): rate paid vs posted, by rate.
      rates: { rows: rateList, paidCents: ratePaid, postedCents: ratePosted, belowPostedCents: ratePosted - ratePaid, ofPostedPct: pct(ratePaid, ratePosted) },
      byDow: collectedByDow.map((cents, i) => ({ dow: DOW[i], collectedCents: cents })),
      byHour: [...collectedByHour.entries()].sort((x, y) => x[0] - y[0]).map(([hour, cents]) => ({ hour, collectedCents: cents })),
      greenCents: greenCollected, cartCents: cartCollected, lateFeesKeptCents: lateFeesKept, holdsHeldCents: holdsHeld, greenReserveFeesCents: grFees,
      pipeline: {
        upcomingBookings: upcomingB.length,
        cardOnFile: { bookings: onCard.length, cents: onCard.reduce((s, b) => s + share(b), 0), noCardRequired: onCard.filter(b => b.paymentStatus === 'no_payment_method').length },
        awaitingCheckIn: { bookings: awaiting.length, cents: awaiting.reduce((s, b) => s + share(b), 0) },
        holdsHeldBookings: live.filter(b => b.paymentStatus === 'cancellation_fee_charged').length,
      },
      roundsPlayed, perRoundCents: roundsPlayed ? Math.round(collected / roundsPlayed) : null,
      perAvailableTeeTimeCents: pastSlotsForSale ? Math.round(collected / pastSlotsForSale) : null,
      bucket: byWeek ? 'week' as const : 'day' as const,
      series: [...series.entries()].map(([key, v]) => ({ key, expectedCents: v.expected, collectedCents: v.collected, gapCents: v.expected - v.collected, gapPct: pct(v.expected - v.collected, v.expected), rounds: v.rounds, perRoundCents: v.rounds ? Math.round(v.collected / v.rounds) : null, fillPct: pct(v.booked, v.sale) })),
    },
    utilization: {
      spotsForSale: sale, spotsBooked: bookedSpots, fillPct: pct(bookedSpots, sale),
      blockedTimes: L.teeTimes.filter(t => t.status === 'blocked').length,
      byDay: [...byDay.entries()].sort().map(([date, r]) => ({ date, sale: r.sale, booked: r.booked, fillPct: pct(r.booked, r.sale) })),
      byDow: byDow.map((r, i) => ({ dow: DOW[i], sale: r.sale, booked: r.booked, fillPct: pct(r.booked, r.sale) })),
      byHour: hours.map(h => ({ hour: h, sale: byHour.get(h)!.sale, booked: byHour.get(h)!.booked, fillPct: pct(byHour.get(h)!.booked, byHour.get(h)!.sale) })),
      heatmap: { hours, rows: DOW.map((d, w) => ({ dow: d, cells: hours.map(h => { const r = heat.get(`${w}-${h}`); return r ? pct(r.booked, r.sale) : null; }) })) },
      // W2-8 (1): cents earned per spot offered, past tee times only (null = none played yet).
      earnedPerSpot: { hours, rows: DOW.map((d, w) => ({ dow: d, cells: hours.map(h => { const e = heatEarned.get(`${w}-${h}`); return e && e.spots ? Math.round(e.cents / e.spots) : null; }) })) },
      // W2-8 (6): demand turned away.
      soldOutTimes: soldOut.length,
      soldOutByHour: [...soldOutBy.entries()].map(([k, n]) => { const [w, h] = k.split('-').map(Number); return { dow: DOW[w], hour: h, times: n }; }).sort((a, b) => b.times - a.times).slice(0, 8),
      alerts: { count: alerts.length, players: alerts.reduce((n, a) => n + a.players, 0), notified: alerts.filter(a => a.notifiedAt).length,
        rows: alerts.map(a => ({ date: a.date, time: a.teeTime?.time ?? (a.windowStart || null), players: a.players, notified: !!a.notifiedAt })) },
      // W2-8 (8): closures, apart from golfers' cancellations.
      closedDays: closedDays.map(c => ({ date: c.date, reason: c.reason })),
      // W2-8 (5): the next 14 days, from today — not bound to the range.
      pace,
    },
    unfilled: {
      slots: unfilled.length, openSpots: unfilled.reduce((s, u) => s + u.open, 0), lostCents: unfilled.reduce((s, u) => s + u.lostCents, 0),
      rows: unfilled,
      worstHours: [...lostByHour.entries()].sort((a, b) => b[1].lostCents - a[1].lostCents).slice(0, 5).map(([hour, r]) => ({ hour, ...r })),
      worstDays: [...lostByDow.entries()].sort((a, b) => b[1].lostCents - a[1].lostCents).slice(0, 7).map(([w, r]) => ({ dow: DOW[w], ...r })),
    },
    noShows: {
      count: noShows.length, ratePct: pct(noShows.length, pastLive.length), impactCents: noShows.reduce((s, b) => s + share(b), 0),
      // W2-8 (7): groups that turned up short, and the rates split by whether the booking carried a fee.
      shortShows: { groups: shortShows.length, missingPlayers: shortShows.reduce((n, b) => n + (b.players - (b.checkedInPlayers ?? b.players)), 0), ofCheckedIn: checkedIn.length },
      byFeePolicy: { withFee: policy(true), withoutFee: policy(false) },
      markedByStaff: noShows.filter(b => b.noShowAt).length,
      rows: noShows.map(b => ({ date: b.date, time: b.time, name: b.golferName, players: b.players, valueCents: share(b), marked: !!b.noShowAt })),
      repeat: [...repeatNs.values()].filter(r => r.count > 1).sort((a, b) => b.count - a.count),
    },
    cancellations: {
      // W2-8 (8): golfers' and staff cancellations only; rounds the course called off are counted below.
      count: golferCancelled.length, ratePct: pct(golferCancelled.length, bookings.length - calledOff.length),
      lostCents: golferCancelled.reduce((s, b) => s + share(b), 0) - lateFeesKept, lateFeesKeptCents: lateFeesKept,
      byCustomer, byStaff, actorUnknown, lead: leadBuckets, rebooked, rebookedPct: pct(rebooked, golferCancelled.filter(b => b.cancelledAt).length),
      calledOff: { bookings: calledOff.length, weather: calledOff.filter(b => calledOffOf.get(b.id) === 'weather').length, closure: calledOff.filter(b => calledOffOf.get(b.id) === 'closure').length, players: calledOff.reduce((n, b) => n + b.players, 0) },
      rows: golferCancelled.map(b => ({ date: b.date, time: b.time, name: b.golferName, players: b.players, valueCents: share(b), cancelledAt: b.cancelledAt?.toISOString() ?? null, by: cancelActor.get(b.id) ?? null })),
    },
    customers: {
      identified: inRange.size, newCustomers: newC, returning: returningC, returningPct: pct(returningC, inRange.size),
      retentionPct: pct(retained, prevKeys.size), retained, previousCustomers: prevKeys.size,
      avgDaysBetweenVisits: gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null,
      unidentifiedBookings: unidentified, unidentifiedPlayers,
      members: { active: membersActive, onFile: membersOnFile, tiers },
      // W2-8 (3): residents vs everyone else, per day of rounds paid (recorded from RES_START).
      goneQuiet: goneQuiet.slice(0, 50),
      residents: { since: RES_START, rows: [...resRows.entries()].sort().map(([date, r]) => ({ date, ...r })) },
      topByRounds: [...top].sort((a, b) => b.rounds - a.rounds || b.spendCents - a.spendCents).slice(0, 10),
      topBySpend: [...top].sort((a, b) => b.spendCents - a.spendCents || b.rounds - a.rounds).slice(0, 10),
    },
    behavior: {
      bookings: live.length, players: playersLive,
      avgGroupSize: live.length ? Math.round((playersLive / live.length) * 10) / 10 : null,
      avgLeadDays: leadDays.length ? Math.round((leadDays.reduce((s, d) => s + d, 0) / leadDays.length) * 10) / 10 : null,
      lead: leadHist, channel,
    },
  };
}

export type Analytics = Awaited<ReturnType<typeof computeAnalytics>>;

/** The headline numbers, for the "compare to previous period" deltas. */
export function headline(a: Analytics) {
  return {
    collectedCents: a.revenue.collectedCents, expectedCents: a.revenue.expectedCents, fillPct: a.utilization.fillPct,
    lostCents: a.unfilled.lostCents, noShowPct: a.noShows.ratePct, cancelPct: a.cancellations.ratePct,
    customers: a.customers.identified, returningPct: a.customers.returningPct, bookings: a.behavior.bookings, avgLeadDays: a.behavior.avgLeadDays,
    // AN-3 (Cam 2026-10-19): the top four are revenue, filled, rounds played and average per round.
    roundsPlayed: a.revenue.roundsPlayed, perRoundCents: a.revenue.perRoundCents,
  };
}

/**
 * POS-3: walk-up shop sales net of refunds, before tax. A refund comes back
 * tax included, so the pre-tax part kept is the sale's pre-tax amount times
 * the share of the sale not refunded. A sale refunded in full counts as none.
 */
export function walkUpNet(sales: { totalCents: number; taxCents: number; refundedCents?: number; roundsCents?: number }[]): { sales: number; cents: number } {
  let n = 0, cents = 0;
  for (const w of sales) {
    const refunded = w.refundedCents ?? 0;
    if (w.totalCents - (w.roundsCents ?? 0) > 0 && refunded >= w.totalCents - (w.roundsCents ?? 0)) continue;
    // POS-3 R2: green fees paid at the register are rounds (counted with the bookings), not shop sales.
    const items = w.totalCents - w.taxCents - (w.roundsCents ?? 0);
    if (items <= 0 && (w.roundsCents ?? 0) > 0) continue;
    n++;
    // Refunds come off the items only (green fees are refunded from the booking), tax included.
    const itemsPaid = w.totalCents - (w.roundsCents ?? 0);
    cents += itemsPaid > 0 ? Math.round(items * (itemsPaid - refunded) / itemsPaid) : 0;
  }
  return { sales: n, cents };
}

export type PaceDay = { date: string; offered: number; booked: number; usual: number | null; weeks: number };

/** W2-8 (5): the next 14 days from `today` — players booked so far against the same weekday the
 *  same number of days out, averaged over the last four weeks (see `pace` at the top). Analytics
 *  and Home (DENSE-3) read this one function. */
export async function bookingPace(courseId: string, today: string, nowMs: number): Promise<PaceDay[]> {
  const paceTo = addDaysStr(today, 13), paceFrom = addDaysStr(today, -28);
  const paceSlots = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: paceFrom, lte: paceTo } },
    select: { date: true, status: true, playersAvailable: true,
      bookings: { select: { players: true, status: true, createdAt: true, cancelledAt: true } } },
  });
  const paceByDate = new Map<string, typeof paceSlots>();
  for (const t of paceSlots) paceByDate.set(t.date, [...(paceByDate.get(t.date) ?? []), t]);
  /** Players booked on `date` as of `at`: made by then, and not cancelled by then. */
  const bookedAsOf = (date: string, at: number) => (paceByDate.get(date) ?? []).reduce((n, t) => n + t.bookings.reduce((m, b) => {
    if (b.createdAt.getTime() > at) return m;
    if (b.status === 'cancelled' && (!b.cancelledAt || b.cancelledAt.getTime() <= at)) return m;
    return m + b.players;
  }, 0), 0);
  const offeredOn = (date: string) => (paceByDate.get(date) ?? []).filter(t => t.status !== 'blocked').reduce((n, t) => n + t.playersAvailable, 0);
  const pace: { date: string; offered: number; booked: number; usual: number | null; weeks: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const date = addDaysStr(today, i);
    const past: number[] = [];
    for (let k = 1; k <= 4; k++) {
      const then = addDaysStr(date, -7 * k);
      if (!offeredOn(then)) continue; // closed or no tee times that day — no comparison
      past.push(bookedAsOf(then, nowMs - 7 * k * 86400000));
    }
    pace.push({ date, offered: offeredOn(date), booked: bookedAsOf(date, nowMs), usual: past.length ? Math.round(past.reduce((n, x) => n + x, 0) / past.length) : null, weeks: past.length });
  }
  return pace;
}

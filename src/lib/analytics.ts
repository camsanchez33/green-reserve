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
import type { BookingEventType } from '@prisma/client';
import { prisma } from './prisma';
import { DEFAULT_TZ, isValidTimezone, todayIn, addDaysStr } from './course-time';
import { teeToUtcMs } from './tee-time-utils';
import { PLACEHOLDER_EMAIL_DOMAIN } from './email';

/** EV-1's event log went live on this day; metrics that need it start here. */
export const EVENT_LOG_START = '2026-10-01';
export const NO_SHOW_GRACE_MIN = 30;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Range = { from: string; to: string };

const share = (b: { greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number }) => b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal;
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
  const upcoming = live.filter(b => !b.passed && !collectedSet.has(b)).reduce((s, b) => s + share(b), 0);
  const lateFeesKept = cancelled.filter(b => b.paymentStatus === 'cancellation_fee_charged').reduce((s, b) => s + b.cancellationFeeTotal, 0);
  const holdsHeld = live.filter(b => b.paymentStatus === 'cancellation_fee_charged').reduce((s, b) => s + b.cancellationFeeTotal, 0);
  const grFees = collectedB.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.accessFeeTotal, 0);
  const greenCollected = collectedB.reduce((s, b) => s + b.greenFeeTotal, 0);
  const cartCollected = collectedB.reduce((s, b) => s + b.cartFeeTotal, 0);
  const roundsPlayed = collectedB.reduce((s, b) => s + (b.checkedInPlayers ?? b.players), 0);
  const pastSlotsForSale = L.teeTimes.filter(t => t.status !== 'blocked' && teeMs(t.date, t.time) < nowMs).length;

  const byWeek = daysBetween(range.from, range.to) > 45;
  const bucketOf = (date: string) => (byWeek ? weekOf(date) : date);
  const series = new Map<string, { expected: number; collected: number }>();
  for (let d = range.from; d <= range.to && d <= today; d = addDaysStr(d, 1)) {
    const k = bucketOf(d); if (!series.has(k)) series.set(k, { expected: 0, collected: 0 });
  }
  for (const b of pastLive) { const r = series.get(bucketOf(b.date)); if (r) r.expected += share(b); }
  for (const b of collectedB) { const r = series.get(bucketOf(b.date)); if (r) r.collected += share(b); }

  // ── 2. Utilization ───────────────────────────────────────────────────────
  const forSale = L.teeTimes.filter(t => t.status !== 'blocked');
  const agg = () => ({ sale: 0, booked: 0 });
  const byDay = new Map<string, ReturnType<typeof agg>>();
  const byDow = Array.from({ length: 7 }, agg);
  const byHour = new Map<number, ReturnType<typeof agg>>();
  const heat = new Map<string, ReturnType<typeof agg>>();
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
    select: { bookingId: true, actorType: true },
  });
  const cancelActor = new Map(cancelEvents.map(e => [e.bookingId, e.actorType]));
  const leadBuckets = { under24h: 0, d1to3: 0, over3d: 0, unknown: 0 };
  let byCustomer = 0, byStaff = 0, actorUnknown = 0, rebooked = 0;
  for (const b of cancelled) {
    if (b.cancelledAt) {
      const hrs = (b.teeAt - b.cancelledAt.getTime()) / 3600000;
      if (hrs < 24) leadBuckets.under24h++; else if (hrs < 72) leadBuckets.d1to3++; else leadBuckets.over3d++;
      if (bookings.some(o => o.teeTimeId === b.teeTimeId && o.id !== b.id && o.status !== 'cancelled' && o.createdAt > b.cancelledAt!)) rebooked++;
    } else leadBuckets.unknown++;
    const a = cancelActor.get(b.id);
    if (!a) actorUnknown++; else if (a === 'golfer') byCustomer++; else byStaff++;
  }

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
      greenCents: greenCollected, cartCents: cartCollected, lateFeesKeptCents: lateFeesKept, holdsHeldCents: holdsHeld, greenReserveFeesCents: grFees,
      roundsPlayed, perRoundCents: roundsPlayed ? Math.round(collected / roundsPlayed) : null,
      perAvailableTeeTimeCents: pastSlotsForSale ? Math.round(collected / pastSlotsForSale) : null,
      bucket: byWeek ? 'week' as const : 'day' as const,
      series: [...series.entries()].map(([key, v]) => ({ key, expectedCents: v.expected, collectedCents: v.collected, gapCents: v.expected - v.collected })),
    },
    utilization: {
      spotsForSale: sale, spotsBooked: bookedSpots, fillPct: pct(bookedSpots, sale),
      byDay: [...byDay.entries()].sort().map(([date, r]) => ({ date, sale: r.sale, booked: r.booked, fillPct: pct(r.booked, r.sale) })),
      byDow: byDow.map((r, i) => ({ dow: DOW[i], sale: r.sale, booked: r.booked, fillPct: pct(r.booked, r.sale) })),
      byHour: hours.map(h => ({ hour: h, sale: byHour.get(h)!.sale, booked: byHour.get(h)!.booked, fillPct: pct(byHour.get(h)!.booked, byHour.get(h)!.sale) })),
      heatmap: { hours, rows: DOW.map((d, w) => ({ dow: d, cells: hours.map(h => { const r = heat.get(`${w}-${h}`); return r ? pct(r.booked, r.sale) : null; }) })) },
    },
    unfilled: {
      slots: unfilled.length, openSpots: unfilled.reduce((s, u) => s + u.open, 0), lostCents: unfilled.reduce((s, u) => s + u.lostCents, 0),
      rows: unfilled,
      worstHours: [...lostByHour.entries()].sort((a, b) => b[1].lostCents - a[1].lostCents).slice(0, 5).map(([hour, r]) => ({ hour, ...r })),
      worstDays: [...lostByDow.entries()].sort((a, b) => b[1].lostCents - a[1].lostCents).slice(0, 7).map(([w, r]) => ({ dow: DOW[w], ...r })),
    },
    noShows: {
      count: noShows.length, ratePct: pct(noShows.length, pastLive.length), impactCents: noShows.reduce((s, b) => s + share(b), 0),
      markedByStaff: noShows.filter(b => b.noShowAt).length,
      rows: noShows.map(b => ({ date: b.date, time: b.time, name: b.golferName, players: b.players, valueCents: share(b), marked: !!b.noShowAt })),
      repeat: [...repeatNs.values()].filter(r => r.count > 1).sort((a, b) => b.count - a.count),
    },
    cancellations: {
      count: cancelled.length, ratePct: pct(cancelled.length, bookings.length),
      lostCents: cancelled.reduce((s, b) => s + share(b), 0) - lateFeesKept, lateFeesKeptCents: lateFeesKept,
      byCustomer, byStaff, actorUnknown, lead: leadBuckets, rebooked, rebookedPct: pct(rebooked, cancelled.filter(b => b.cancelledAt).length),
      rows: cancelled.map(b => ({ date: b.date, time: b.time, name: b.golferName, players: b.players, valueCents: share(b), cancelledAt: b.cancelledAt?.toISOString() ?? null, by: cancelActor.get(b.id) ?? null })),
    },
    customers: {
      identified: inRange.size, newCustomers: newC, returning: returningC, returningPct: pct(returningC, inRange.size),
      retentionPct: pct(retained, prevKeys.size), retained, previousCustomers: prevKeys.size,
      avgDaysBetweenVisits: gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null,
      unidentifiedBookings: unidentified, unidentifiedPlayers,
      members: { active: membersActive, onFile: membersOnFile, tiers },
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
  };
}

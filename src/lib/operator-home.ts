// DASH-C Home (Cam 2026-10-22, "very nice" on the course dashboard mockups): the
// page an owner opens each morning — today's players by hour against the same
// weekday last week, what needs them, and the next tee times. AN-1 keeps every
// other operational tab free of numbers; Home is the one exception Cam approved.
// Money uses computeAnalytics()'s definitions (collected / outstanding), never a
// new sum. The route decides which parts a login may see.
import { paymentsMissing, missingSetup } from './setup-missing';
import { timeSpots } from './day-fill';
import { prisma } from './prisma';
import { todayIn, clockIn, addDaysStr } from './course-time';
import { computeAnalytics, bookingPace, NO_SHOW_GRACE_MIN } from './analytics';
import { roundChargeCents } from './shop';
import { isPlaceholderEmail } from './email';
import { todayByHour, checkedInOf, sameWeekdayAverage } from './home-today';

const LIVE = { status: { in: ['confirmed', 'completed'] } };

/** Players booked on a day and how full it is (players of the spots offered). */
async function dayShape(courseId: string, date: string) {
  const times = await prisma.teeTime.findMany({
    where: { courseId, date },
    select: { time: true, status: true, playersAvailable: true, bookings: { where: LIVE, select: { players: true } } },
  });
  let players = 0, offered = 0;
  for (const t of times) {
    const n = t.bookings.reduce((s, b) => s + b.players, 0);
    players += n;
    offered += timeSpots(t, n); // ACC-1: one rule for spots (lib/day-fill)
  }
  return { players, fillPct: offered ? Math.round((players / offered) * 100) : null };
}

export type DeclinedCard = { id: string; name: string; date: string; time: string; amountCents: number | null; canText: boolean; canEmail: boolean; players?: number; reason?: string };

/** A card that was tried at check-in and declined, and nobody has collected
 *  since — newest first, the first `take`, and how many there are in all. Home
 *  and Money → Needs you read the same list. Every paid path clears
 *  checkInFailReason, so a group that paid another way drops off. canText /
 *  canEmail say which pay link the booking can be sent (the route's own rules). */
export async function declinedCards(courseId: string, withAmounts: boolean, take = 10): Promise<{ rows: DeclinedCard[]; total: number }> {
  // MONEY-1: a card staff took off the list (declineDismissedAt) stays off until it declines again.
  const where = { courseId, checkInFailReason: { not: '' }, checkedInAt: null, status: { not: 'cancelled' as const }, declineDismissedAt: null };
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      // The round's own day, latest first (dead end 16: it was by when the booking was made).
      where, orderBy: [{ teeTime: { date: 'desc' } }, { teeTime: { time: 'desc' } }], take,
      // POS-1a: what the retry will charge — the round plus any shop items on it.
      select: { id: true, golferName: true, golferEmail: true, golferPhone: true, checkInToken: true, players: true, checkInFailReason: true, totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, accessFeeTotal: true, feePaidCents: true, teeTime: { select: { date: true, time: true } } },
    }),
    prisma.booking.count({ where }),
  ]);
  return {
    total,
    rows: rows.map(d => ({
      id: d.id, name: d.golferName, date: d.teeTime.date, time: d.teeTime.time.slice(0, 5),
      // Amounts are money: a login without payments sees who, not how much.
      amountCents: withAmounts ? roundChargeCents(d) : null,
      canText: (d.golferPhone || '').replace(/\D/g, '').length >= 10,
      canEmail: !!d.checkInToken && !!d.golferEmail && !isPlaceholderEmail(d.golferEmail),
      // MONEY-1: what Open shows in place — the group and why the card was declined.
      players: d.players, reason: d.checkInFailReason,
    })),
  };
}

export type HomeGroup = { id: string; name: string; players: number; paymentStatus: string; checkedIn: boolean };
export type HomeSlot = { id: string; time: string; open: number; groups: HomeGroup[] };

export async function operatorHome(courseId: string, opts: { money: boolean; messages: boolean; setup?: boolean; owner?: boolean }, now = new Date()) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: {
    timezone: true, name: true, takesCash: true, logoUrl: true, heroImageUrl: true, description: true, phone: true, holes: true, par: true, stripeAccountActive: true,
    _count: { select: { photos: true, teeSets: true } },
  } });
  const tz = course?.timezone;
  const today = todayIn(tz, now);
  const clock = clockIn(tz, now);
  const lastWeek = addDaysStr(today, -7);

  const [cur, prev, slots, { rows: declined, total: declinedTotal }, unread, pace] = await Promise.all([
    dayShape(courseId, today),
    // HOME-3: the numbers compare with the same weekday last week (the trend lines went with the mockup).
    dayShape(courseId, lastWeek),
    prisma.teeTime.findMany({
      // A blocked time that still holds a group keeps it on Home (late, no-shows, next) — stress test 2026-11-10.
      where: { courseId, date: today, OR: [{ status: { not: 'blocked' } }, { bookings: { some: LIVE } }] },
      orderBy: { time: 'asc' },
      select: { id: true, time: true, status: true, holes: true, playersAvailable: true, playersBooked: true,
        bookings: { where: LIVE, orderBy: { createdAt: 'asc' }, select: { id: true, golferName: true, players: true, checkedInPlayers: true, paymentStatus: true, checkedInAt: true, noShowAt: true, status: true } } },
    }),
    declinedCards(courseId, opts.money),
    // The same count as the menu's Messages badge (/api/operator/messages?unreadCount=1).
    opts.messages ? prisma.message.count({ where: { thread: { courseId }, senderType: 'admin', readAt: null } }) : Promise.resolve(0),
    // DENSE-3 (Cam 2026-10-28): the next 14 days against the usual by now — Analytics' own pace.
    bookingPace(courseId, today, now.getTime()),
  ]);

  // HOME-3 (Cam 2026-11-12): today by hour as played · playing · booked · open (lib/home-today), the players
  // checked in, and the next 14 days' line — the average of the last 4 of the same weekday (final counts).
  const hourSlots = slots.map(s => ({ time: s.time, holes: s.holes, spots: timeSpots(s, s.bookings.reduce((n, b) => n + b.players, 0)), bookings: s.bookings }));
  const byHour = todayByHour(hourSlots, clock);
  const checkedIn = checkedInOf(hourSlots);
  const pastDays = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: addDaysStr(today, -28), lte: addDaysStr(today, -1) } },
    select: { date: true, status: true, bookings: { where: LIVE, select: { players: true } } },
  });
  const finalOn = new Map<string, number | null>();
  for (const t of pastDays) {
    const n = t.bookings.reduce((m, b) => m + b.players, 0);
    // A day counts only when it had tee times on offer (or a group on a blocked one) — a closed day isn't a zero.
    if (t.status === 'blocked' && n === 0) { if (!finalOn.has(t.date)) finalOn.set(t.date, null); continue; }
    finalOn.set(t.date, (finalOn.get(t.date) ?? 0) + n);
  }
  const next14 = pace.map(d => ({ ...d, avg4: sameWeekdayAverage(d.date, today, finalOn) }));

  const declinedIds = new Set(declined.map(d => d.id));
  // Past their tee time plus the no-show grace, still not checked in or marked.
  const graceAgo = minusMinutes(clock, NO_SHOW_GRACE_MIN);
  const late = slots.flatMap(s => s.time.slice(0, 5) <= graceAgo
    // A declined card is listed on its own above, not again here.
    ? s.bookings.filter(b => b.status === 'confirmed' && !b.checkedInAt && !b.noShowAt && !declinedIds.has(b.id)).map(b => ({ id: b.id, teeTimeId: s.id, name: b.golferName, time: s.time.slice(0, 5) }))
    : []);

  // Groups marked no-show today (Home's Needs you count).
  const noShows = slots.reduce((n, s) => n + s.bookings.filter(b => b.noShowAt).length, 0);

  const comingUp: HomeSlot[] = slots.filter(s => s.time.slice(0, 5) >= clock.slice(0, 5)).slice(0, 6).map(s => ({
    id: s.id,
    time: s.time.slice(0, 5),
    open: s.status === 'blocked' ? 0 : Math.max(0, s.playersAvailable - s.playersBooked),
    groups: s.bookings.map(b => ({ id: b.id, name: b.golferName, players: b.players, paymentStatus: b.paymentStatus, checkedIn: !!b.checkedInAt || b.status === 'completed' })),
  }));

  // Money uses computeAnalytics' definitions. Not paid yet is every live group today not yet paid —
  // past their time (marked no-shows and refunded rounds aside, lib/analytics) plus still to play — as on the tee sheet's strip; lateGroups
  // is the part past their time (Cam 2026-10-27, "how have none of them not paid").
  let money: null | { paidCents: number; paidGroups: number; outstandingCents: number; outstandingGroups: number; lateGroups: number } = null;
  if (opts.money) {
    const day = await computeAnalytics(courseId, { from: today, to: today }, now);
    money = {
      // Paid bookings (groups), as Analytics' collected set; Analytics' "rounds" are players.
      paidCents: day.revenue.collectedCents, paidGroups: day.revenue.beyond.rounds,
      // STRESS-1110 #15: the one Not paid yet (lib/analytics notPaid).
      outstandingCents: day.revenue.notPaidCents,
      outstandingGroups: day.revenue.notPaidBookings,
      lateGroups: day.revenue.outstandingBookings,
    };
  }

  // HOME-3: the next tee time from now with a group on it — every slot, not just the next six.
  const nx = slots.find(s => s.time.slice(0, 5) >= clock.slice(0, 5) && s.bookings.some(b => b.status === 'confirmed' || b.status === 'completed'));
  const nextOff = nx ? { id: nx.id, time: nx.time.slice(0, 5), name: nx.bookings[0].golferName, groups: nx.bookings.length, players: nx.bookings.reduce((n, b) => n + b.players, 0) } : null;

  return {
    nextOff,
    courseName: course?.name ?? '', today, lastWeek, clock,
    // HOME-3 (Cam 2026-11-12): "Open the register" shows only when the course says it takes cash (Settings → Pro shop).
    takesCash: !!course?.takesCash,
    players: { today: cur.players, lastWeek: prev.players },
    fillPct: { today: cur.fillPct, lastWeek: prev.fillPct },
    pace: next14,
    byHour,
    checkedIn,
    money,
    declined,
    declinedTotal,
    late,
    noShows,
    unreadMessages: unread,
    comingUp,
    // What is still missing from the booking page (lib/setup-missing), for logins that can fix it in Settings.
    setupMissing: opts.setup && course ? [...(opts.owner ? paymentsMissing(course.stripeAccountActive) : []), ...missingSetup({ ...course, galleryCount: course._count.photos, teeSetCount: course._count.teeSets })] : [],
  };
}

function minusMinutes(hhmm: string, m: number): string {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = Math.max(0, h * 60 + mm - m);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

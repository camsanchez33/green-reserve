// DASH-C Home (Cam 2026-10-22, "very nice" on the course dashboard mockups): the
// page an owner opens each morning — today's players by hour against the same
// weekday last week, what needs them, and the next tee times. AN-1 keeps every
// other operational tab free of numbers; Home is the one exception Cam approved.
// Money uses computeAnalytics()'s definitions (collected / outstanding), never a
// new sum. The route decides which parts a login may see.
import { missingSetup } from './setup-missing';
import { prisma } from './prisma';
import { todayIn, clockIn, addDaysStr } from './course-time';
import { computeAnalytics, bookingPace, NO_SHOW_GRACE_MIN } from './analytics';
import { roundChargeCents } from './shop';
import { isPlaceholderEmail } from './email';

const LIVE = { status: { in: ['confirmed', 'completed'] } };

/** Players booked on a day, per tee-time hour (0–23), and the spots offered that day. */
async function dayShape(courseId: string, date: string) {
  const times = await prisma.teeTime.findMany({
    where: { courseId, date },
    select: { time: true, status: true, playersAvailable: true, bookings: { where: LIVE, select: { players: true } } },
  });
  const hours = Array(24).fill(0) as number[];
  let players = 0, offered = 0;
  for (const t of times) {
    const n = t.bookings.reduce((s, b) => s + b.players, 0);
    hours[Number(t.time.slice(0, 2))] += n;
    players += n;
    if (t.status !== 'blocked') offered += t.playersAvailable;
  }
  return { hours, players, fillPct: offered ? Math.round((players / offered) * 100) : null };
}

export type DeclinedCard = { id: string; name: string; date: string; time: string; amountCents: number | null; canText: boolean; canEmail: boolean };

/** A card that was tried at check-in and declined, and nobody has collected
 *  since — newest first, the first `take`, and how many there are in all. Home
 *  and Money → Needs you read the same list. Every paid path clears
 *  checkInFailReason, so a group that paid another way drops off. canText /
 *  canEmail say which pay link the booking can be sent (the route's own rules). */
export async function declinedCards(courseId: string, withAmounts: boolean, take = 10): Promise<{ rows: DeclinedCard[]; total: number }> {
  const where = { courseId, checkInFailReason: { not: '' }, checkedInAt: null, status: { not: 'cancelled' } };
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where, orderBy: { createdAt: 'desc' }, take,
      // POS-1a: what the retry will charge — the round plus any shop items on it.
      select: { id: true, golferName: true, golferEmail: true, golferPhone: true, checkInToken: true, totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, accessFeeTotal: true, feePaidCents: true, teeTime: { select: { date: true, time: true } } },
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
    })),
  };
}

export type HomeGroup = { id: string; name: string; players: number; paymentStatus: string; checkedIn: boolean };
export type HomeSlot = { time: string; open: number; groups: HomeGroup[] };

export async function operatorHome(courseId: string, opts: { money: boolean; messages: boolean; setup?: boolean }, now = new Date()) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: {
    timezone: true, name: true, logoUrl: true, heroImageUrl: true, description: true, phone: true, holes: true, par: true,
    _count: { select: { photos: true, teeSets: true } },
  } });
  const tz = course?.timezone;
  const today = todayIn(tz, now);
  const clock = clockIn(tz, now);
  const lastWeek = addDaysStr(today, -7);

  // DENSE-3 (Cam 2026-10-28, "yes, add trend lines"): the same weekday for the last seven weeks, oldest first, then today.
  const weeksBack = [7, 6, 5, 4, 3, 2, 1].map(k => addDaysStr(today, -7 * k));
  const [cur, earlier, slots, { rows: declined, total: declinedTotal }, unread, pace] = await Promise.all([
    dayShape(courseId, today),
    Promise.all(weeksBack.map(d => dayShape(courseId, d))),
    prisma.teeTime.findMany({
      where: { courseId, date: today, status: { not: 'blocked' } },
      orderBy: { time: 'asc' },
      select: { time: true, playersAvailable: true, playersBooked: true,
        bookings: { where: LIVE, orderBy: { createdAt: 'asc' }, select: { id: true, golferName: true, players: true, paymentStatus: true, checkedInAt: true, noShowAt: true, status: true } } },
    }),
    declinedCards(courseId, opts.money),
    // The same count as the menu's Messages badge (/api/operator/messages?unreadCount=1).
    opts.messages ? prisma.message.count({ where: { thread: { courseId }, senderType: 'admin', readAt: null } }) : Promise.resolve(0),
    // DENSE-3 (Cam 2026-10-28): the next 14 days against the usual by now — Analytics' own pace.
    bookingPace(courseId, today, now.getTime()),
  ]);
  const prev = earlier[earlier.length - 1];

  const declinedIds = new Set(declined.map(d => d.id));
  // Past their tee time plus the no-show grace, still not checked in or marked.
  const graceAgo = minusMinutes(clock, NO_SHOW_GRACE_MIN);
  const late = slots.flatMap(s => s.time.slice(0, 5) <= graceAgo
    // A declined card is listed on its own above, not again here.
    ? s.bookings.filter(b => b.status === 'confirmed' && !b.checkedInAt && !b.noShowAt && !declinedIds.has(b.id)).map(b => ({ id: b.id, name: b.golferName, time: s.time.slice(0, 5) }))
    : []);

  const comingUp: HomeSlot[] = slots.filter(s => s.time.slice(0, 5) >= clock.slice(0, 5)).slice(0, 6).map(s => ({
    time: s.time.slice(0, 5),
    open: Math.max(0, s.playersAvailable - s.playersBooked),
    groups: s.bookings.map(b => ({ id: b.id, name: b.golferName, players: b.players, paymentStatus: b.paymentStatus, checkedIn: !!b.checkedInAt || b.status === 'completed' })),
  }));

  // Money uses computeAnalytics' definitions. Not paid yet is every live group today not yet paid —
  // past their time (marked no-shows and refunded rounds aside, lib/analytics) plus still to play — as on the tee sheet's strip; lateGroups
  // is the part past their time (Cam 2026-10-27, "how have none of them not paid").
  let money: null | { paidCents: number; paidGroups: number; outstandingCents: number; outstandingGroups: number; lateGroups: number } = null;
  let paidTrend: number[] | null = null;
  if (opts.money) {
    const [day, weeks] = await Promise.all([
      computeAnalytics(courseId, { from: today, to: today }, now),
      // 43 days, so the series stays by day (analytics buckets by week past 45).
      computeAnalytics(courseId, { from: weeksBack[0], to: weeksBack[weeksBack.length - 1] }, now),
    ]);
    money = {
      // Paid bookings (groups), as Analytics' collected set; Analytics' "rounds" are players.
      paidCents: day.revenue.collectedCents, paidGroups: day.revenue.beyond.rounds,
      outstandingCents: day.revenue.outstandingCents + day.revenue.upcomingCents,
      outstandingGroups: day.revenue.outstandingBookings + day.revenue.pipeline.upcomingBookings,
      lateGroups: day.revenue.outstandingBookings,
    };
    const byDate = new Map(weeks.revenue.series.map(x => [x.key, x.collectedCents]));
    paidTrend = [...weeksBack.map(d => byDate.get(d) ?? 0), day.revenue.collectedCents];
  }

  return {
    courseName: course?.name ?? '', today, lastWeek, clock,
    hours: cur.hours.map((n, h) => ({ hour: h, today: n, lastWeek: prev.hours[h] })),
    players: { today: cur.players, lastWeek: prev.players },
    fillPct: { today: cur.fillPct, lastWeek: prev.fillPct },
    trend: {
      dates: [...weeksBack, today],
      players: [...earlier.map(e => e.players), cur.players],
      fillPct: [...earlier.map(e => e.fillPct), cur.fillPct],
      paidCents: paidTrend,
    },
    pace,
    money,
    declined,
    declinedTotal,
    late,
    unreadMessages: unread,
    comingUp,
    // What is still missing from the booking page (lib/setup-missing), for logins that can fix it in Settings.
    setupMissing: opts.setup && course ? missingSetup({ ...course, galleryCount: course._count.photos, teeSetCount: course._count.teeSets }) : [],
  };
}

function minusMinutes(hhmm: string, m: number): string {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = Math.max(0, h * 60 + mm - m);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

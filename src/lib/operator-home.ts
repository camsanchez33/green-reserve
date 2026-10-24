// DASH-C Home (Cam 2026-10-22, "very nice" on the course dashboard mockups): the
// page an owner opens each morning — today's players by hour against the same
// weekday last week, what needs them, and the next tee times. AN-1 keeps every
// other operational tab free of numbers; Home is the one exception Cam approved.
// Money uses computeAnalytics()'s definitions (collected / outstanding), never a
// new sum. The route decides which parts a login may see.
import { prisma } from './prisma';
import { todayIn, clockIn, addDaysStr } from './course-time';
import { computeAnalytics, NO_SHOW_GRACE_MIN } from './analytics';
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

export async function operatorHome(courseId: string, opts: { money: boolean; messages: boolean }, now = new Date()) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, name: true } });
  const tz = course?.timezone;
  const today = todayIn(tz, now);
  const clock = clockIn(tz, now);
  const lastWeek = addDaysStr(today, -7);

  const [cur, prev, slots, { rows: declined, total: declinedTotal }, unread] = await Promise.all([
    dayShape(courseId, today),
    dayShape(courseId, lastWeek),
    prisma.teeTime.findMany({
      where: { courseId, date: today, status: { not: 'blocked' } },
      orderBy: { time: 'asc' },
      select: { time: true, playersAvailable: true, playersBooked: true,
        bookings: { where: LIVE, orderBy: { createdAt: 'asc' }, select: { id: true, golferName: true, players: true, paymentStatus: true, checkedInAt: true, noShowAt: true, status: true } } },
    }),
    declinedCards(courseId, opts.money),
    // The same count as the menu's Messages badge (/api/operator/messages?unreadCount=1).
    opts.messages ? prisma.message.count({ where: { thread: { courseId }, senderType: 'admin', readAt: null } }) : Promise.resolve(0),
  ]);

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
    groups: s.bookings.map(b => ({ id: b.id, name: b.golferName, players: b.players, paymentStatus: b.paymentStatus, checkedIn: !!b.checkedInAt })),
  }));

  let money: null | { paidCents: number; paidGroups: number; outstandingCents: number; outstandingGroups: number; lateFeesWeekCents: number } = null;
  if (opts.money) {
    const [day, week] = await Promise.all([
      computeAnalytics(courseId, { from: today, to: today }, now),
      computeAnalytics(courseId, { from: addDaysStr(today, -6), to: today }, now),
    ]);
    money = {
      // Paid bookings (groups), as Analytics' collected set; Analytics' "rounds" are players.
      paidCents: day.revenue.collectedCents, paidGroups: day.revenue.beyond.rounds,
      outstandingCents: day.revenue.outstandingCents, outstandingGroups: day.revenue.outstandingBookings,
      lateFeesWeekCents: week.revenue.lateFeesKeptCents,
    };
  }

  return {
    courseName: course?.name ?? '', today, lastWeek, clock,
    hours: cur.hours.map((n, h) => ({ hour: h, today: n, lastWeek: prev.hours[h] })),
    players: { today: cur.players, lastWeek: prev.players },
    fillPct: { today: cur.fillPct, lastWeek: prev.fillPct },
    money,
    declined,
    declinedTotal,
    late,
    unreadMessages: unread,
    comingUp,
  };
}

function minusMinutes(hhmm: string, m: number): string {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = Math.max(0, h * 60 + mm - m);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

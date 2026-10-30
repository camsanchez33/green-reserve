// The golfer record (Revamp 3, Cam 2026-10-29): one course's view of one golfer —
// every booking, what they've played, no-shows and late cancels, what they've
// spent, their membership and resident card, their pro-shop sales, and the staff's
// notes — plus whether they may book online.
//
//  • Per course: a course sees only its own history ("Only their own history").
//    Who the golfer is comes from lib/golfer-key.
//  • Notes: anyone on the tee sheet sees and writes them; golfers never do.
//  • Online-booking block: the owner's, with a reason (GolferBlock), or the course's
//    rule — N no-shows or N late cancels in the last M months (Course.onlineBlock*).
//    The counter can always book them.
//
// A late cancel is one the golfer made inside the booking's own free-cancel window,
// never one the course called off (weather, a closure).
import { prisma } from './prisma';
import { golferKey, golferKeys, keyMatch } from './golfer-key';
import { teeTimeInstant } from './booking-events';
import { courseShareCents } from './analytics';
import { membershipLive } from './member-rates';
import { todayIn } from './course-time';
import { groupCourseIds } from './course-group';

const MONTH_MS = 30.44 * 86_400_000;

type Hist = {
  id: string; status: string; paymentStatus: string; players: number; checkedInPlayers: number | null; noShowAt: Date | null;
  cancelledAt: Date | null; cancellationHoursAtBooking: number | null; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  golferName: string; golferEmail: string; golferPhone: string; golferAccountId: string | null; createdAt: Date;
  teeTime: { date: string; time: string };
};

/** A golfer's bookings at a course, newest tee time first (the key's exact matches only). */
async function historyOf(courseId: string, key: string, take = 400): Promise<Hist[]> {
  const rows = await prisma.booking.findMany({
    where: { courseId, ...keyMatch(key) },
    orderBy: [{ teeTime: { date: 'desc' } }, { teeTime: { time: 'desc' } }], take,
    select: {
      id: true, status: true, paymentStatus: true, players: true, checkedInPlayers: true, noShowAt: true, cancelledAt: true, cancellationHoursAtBooking: true,
      greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, golferName: true, golferEmail: true, golferPhone: true, golferAccountId: true, createdAt: true,
      teeTime: { select: { date: true, time: true } },
    },
  });
  // A phone key is matched loosely in SQL (numbers are stored as typed); the key itself decides.
  return rows.filter(b => golferKey(b) === key);
}

/** The cancelled bookings that weren't the golfer's doing: the course called them off (weather, a closure), or staff removed one made by mistake (waived). */
async function calledOff(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const ev = await prisma.bookingEvent.findMany({ where: { bookingId: { in: ids }, type: 'booking_cancelled' }, select: { bookingId: true, metadata: true } });
  return new Set(ev.filter(e => { const m = e.metadata as { courseCalledOff?: unknown; waived?: unknown } | null; return !!m?.courseCalledOff || !!m?.waived; }).map(e => e.bookingId));
}

/** Pure: cancelled by the golfer inside the booking's own free-cancel window. */
export function isLateCancel(b: Pick<Hist, 'status' | 'cancelledAt' | 'cancellationHoursAtBooking'>, teeAt: Date | null, calledOffByCourse: boolean): boolean {
  if (b.status !== 'cancelled' || !b.cancelledAt || !teeAt || calledOffByCourse) return false;
  const hours = b.cancellationHoursAtBooking ?? 0;
  return teeAt.getTime() - b.cancelledAt.getTime() < hours * 3_600_000;
}

/** Pure: does the course's rule stop this golfer booking online? The sentence says why, or null. */
export function autoBlockReason(rule: { onlineBlockNoShows: number | null; onlineBlockLateCancels: number | null; onlineBlockMonths: number }, counts: { noShows: number; lateCancels: number }): string | null {
  if (rule.onlineBlockNoShows && counts.noShows >= rule.onlineBlockNoShows) return `${counts.noShows} no-show${counts.noShows === 1 ? '' : 's'} in the last ${rule.onlineBlockMonths} months`;
  if (rule.onlineBlockLateCancels && counts.lateCancels >= rule.onlineBlockLateCancels) return `${counts.lateCancels} late cancel${counts.lateCancels === 1 ? '' : 's'} in the last ${rule.onlineBlockMonths} months`;
  return null;
}

async function recentCounts(courseId: string, keys: string[], tz: string, months: number, history?: Hist[]) {
  const since = Date.now() - Math.max(1, months) * MONTH_MS;
  // Every key the golfer answers to, each booking once.
  const all = history ?? [...new Map((await Promise.all(keys.map(k => historyOf(courseId, k)))).flat().map(b => [b.id, b])).values()];
  const rows = all.filter(b => b.createdAt.getTime() >= since || (b.cancelledAt?.getTime() ?? 0) >= since);
  const off = await calledOff(rows.filter(b => b.status === 'cancelled').map(b => b.id));
  const noShows = rows.filter(b => b.noShowAt && b.noShowAt.getTime() >= since).length;
  const lateCancels = rows.filter(b => isLateCancel(b, teeTimeInstant(tz, b.teeTime.date, b.teeTime.time), off.has(b.id))).length;
  return { noShows, lateCancels };
}

/**
 * Whether a golfer may book online here: the owner's block, or the course's rule.
 * Null = they may. The counter never asks this.
 */
export async function onlineBookingBlock(courseId: string, who: { golferEmail?: string | null; golferPhone?: string | null; golferAccountId?: string | null }): Promise<string | null> {
  const keys = golferKeys(who);
  if (!keys.length) return null;
  const [block, course] = await Promise.all([
    prisma.golferBlock.findFirst({ where: { courseId, golferKey: { in: keys } }, select: { id: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, onlineBlockNoShows: true, onlineBlockLateCancels: true, onlineBlockMonths: true, phone: true, name: true } }),
  ]);
  if (!course) return null;
  const call = `Please call ${course.name}${course.phone ? ` at ${course.phone}` : ''} to book.`;
  if (block) return `Online booking isn’t available for you here. ${call}`;
  if (!course.onlineBlockNoShows && !course.onlineBlockLateCancels) return null;
  const reason = autoBlockReason(course, await recentCounts(courseId, keys, course.timezone, course.onlineBlockMonths));
  return reason ? `Online booking isn’t available for you here after recent missed rounds. ${call}` : null;
}

export type GolferRecord = Awaited<ReturnType<typeof golferRecord>>;

/** One course's whole view of a golfer. Money and contact only for logins that may see them. */
export async function golferRecord(courseId: string, key: string, opts: { money: boolean; contact: boolean }) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, memberGraceDays: true, onlineBlockNoShows: true, onlineBlockLateCancels: true, onlineBlockMonths: true } });
  if (!course) return null;
  const history = await historyOf(courseId, key);
  const latest = history[0];
  const email = key.startsWith('e:') ? key.slice(2) : (history.find(b => b.golferEmail && !b.golferEmail.includes('@noemail.'))?.golferEmail ?? '');
  const phone = history.find(b => b.golferPhone)?.golferPhone ?? '';
  const accountId = key.startsWith('a:') ? key.slice(2) : history.find(b => b.golferAccountId)?.golferAccountId ?? null;
  const today = todayIn(course.timezone);
  const offIds = await calledOff(history.filter(b => b.status === 'cancelled').map(b => b.id));

  const [membership, resident, sales, notes, block, recent] = await Promise.all([
    email || accountId ? prisma.courseMembership.findFirst({
      where: { courseId, OR: [...(accountId ? [{ golferId: accountId }] : []), ...(email ? [{ inviteEmail: { equals: email, mode: 'insensitive' as const } }] : [])] },
      orderBy: { createdAt: 'desc' }, select: { id: true, status: true, expiresAt: true, paymentStatus: true, tier: { select: { name: true } } },
    }) : null,
    // Residents are one list across a course group (GRP-1).
    email ? groupCourseIds(courseId).then(ids => prisma.courseResident.findFirst({ where: { courseId: { in: ids }, email: { equals: email, mode: 'insensitive' } }, select: { name: true, cardNumber: true, expiresOn: true } })) : null,
    email || phone ? prisma.shopSale.findMany({
      where: { courseId, status: { in: ['paid_cash', 'paid_card'] }, OR: [...(email ? [{ customerEmail: { equals: email, mode: 'insensitive' as const } }] : []), ...(phone ? [{ customerPhone: phone }] : [])] },
      orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, totalCents: true, refundedCents: true, roundsCents: true, createdAt: true },
    }) : [],
    prisma.golferNote.findMany({ where: { courseId, golferKey: key }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, body: true, bookingId: true, createdBy: true, createdAt: true } }),
    prisma.golferBlock.findUnique({ where: { courseId_golferKey: { courseId, golferKey: key } }, select: { reason: true, blockedBy: true, blockedAt: true } }),
    recentCounts(courseId, [key], course.timezone, course.onlineBlockMonths, history),
  ]);

  const played = history.filter(b => b.status === 'completed');
  const bookings = history.slice(0, 100).map(b => {
    const teeAt = teeTimeInstant(course.timezone, b.teeTime.date, b.teeTime.time);
    const late = isLateCancel(b, teeAt, offIds.has(b.id));
    return {
      id: b.id, date: b.teeTime.date, time: b.teeTime.time.slice(0, 5), players: b.players,
      state: b.status === 'cancelled' ? (offIds.has(b.id) ? 'called_off' : late ? 'late_cancel' : 'cancelled') : b.noShowAt ? 'no_show' : b.status === 'completed' ? 'played' : b.teeTime.date >= today ? 'upcoming' : 'not_checked_in',
      ...(opts.money ? { courseShareCents: courseShareCents(b), paymentStatus: b.paymentStatus } : {}),
    };
  });
  return {
    key, name: latest?.golferName ?? '',
    ...(opts.contact ? { email, phone } : {}),
    since: history.length ? history[history.length - 1].teeTime.date : null,
    counts: {
      rounds: played.length,
      playersRounds: played.reduce((n, b) => n + (b.checkedInPlayers ?? b.players), 0),
      upcoming: history.filter(b => b.status === 'confirmed' && !b.noShowAt && b.teeTime.date >= today).length,
      noShows: history.filter(b => b.noShowAt).length,
      lateCancels: history.filter(b => isLateCancel(b, teeTimeInstant(course.timezone, b.teeTime.date, b.teeTime.time), offIds.has(b.id))).length,
      cancels: history.filter(b => b.status === 'cancelled').length,
      lastPlayed: played[0]?.teeTime.date ?? null,
    },
    ...(opts.money ? { spend: { roundsCents: played.reduce((n, b) => n + courseShareCents(b), 0), shopCents: sales.reduce((n, s) => n + s.totalCents - s.roundsCents - s.refundedCents, 0), shopSales: sales.length } } : {}),
    membership: membership ? { tier: membership.tier?.name ?? '', status: membership.status, expiresAt: membership.expiresAt?.toISOString() ?? null, live: membershipLive(membership, course), duesPaid: membership.paymentStatus !== 'unpaid' } : null,
    resident: resident ? { cardNumber: resident.cardNumber, expiresOn: resident.expiresOn } : null,
    notes: notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })),
    bookings,
    onlineBlock: block
      ? { by: 'owner' as const, reason: block.reason, blockedBy: block.blockedBy, blockedAt: block.blockedAt.toISOString() }
      : (() => { const r = autoBlockReason(course, recent); return r ? { by: 'rule' as const, reason: r, blockedBy: '', blockedAt: null } : null; })(),
    recent,
  };
}

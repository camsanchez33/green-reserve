// DASH-C search (the mockups' "Find a golfer, booking or member"): one box in
// the course menu. Bookings by golfer name (and by email or phone for logins
// that may see golfer contact), newest tee date first; members by name (and
// email). Every query is this course's only. The route decides what a login
// may search.
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { groupCourseIds } from './course-group';

export type SearchResult =
  | { kind: 'booking'; id: string; name: string; date: string; time: string; players: number; status: string; noShow: boolean; href: string }
  | { kind: 'member'; id: string; name: string; tier: string; href: string }
  | { kind: 'resident'; id: string; name: string; href: string };

/**
 * Revamp 3 dead end 18 (Cam 2026-10-29): today's bookings first, then the ones still to
 * come (soonest first), then the past (latest first). It used to list the eight
 * furthest-future bookings and miss the golfer standing at the counter.
 */
export function bySearchOrder<T extends { date: string; time: string }>(rows: T[], today: string): T[] {
  const rank = (d: string) => (d === today ? 0 : d > today ? 1 : 2);
  return [...rows].sort((a, b) => rank(a.date) - rank(b.date)
    || (rank(a.date) === 2 ? (b.date + b.time).localeCompare(a.date + a.time) : (a.date + a.time).localeCompare(b.date + b.time)));
}

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

export async function operatorSearch(courseId: string, rawQ: string, opts: { contact: boolean; members: boolean }): Promise<SearchResult[]> {
  const q = rawQ.trim().slice(0, 80);
  if (q.length < 2) return [];
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  // Bookings from 60 days back onward — the ones a counter is asked about.
  const today = todayIn(course?.timezone);
  const since = addDaysStr(today, -60);
  const digits = q.replace(/\D/g, '');
  // Phones are stored as typed ("555-867-5309"), so match on their digits.
  const phoneIds = opts.contact && digits.length >= 4
    ? (await prisma.$queryRaw<{ id: string }[]>`SELECT b."id" FROM "Booking" b JOIN "TeeTime" t ON t."id" = b."teeTimeId" WHERE b."courseId" = ${courseId} AND b."status" IN ('confirmed', 'completed', 'cancelled') AND t."date" >= ${since} AND regexp_replace(b."golferPhone", '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'} ORDER BY t."date" DESC LIMIT 50`).map(r => r.id)
    : [];
  const bookingOr = [
    { golferName: contains(q) },
    ...(opts.contact ? [{ golferEmail: contains(q) }, ...(phoneIds.length ? [{ id: { in: phoneIds } }] : [])] : []),
  ];
  const [bookingRows, members, residents] = await Promise.all([
    prisma.booking.findMany({
      // Cancelled and no-show groups too (dead end 18) — they're what the counter gets asked about.
      where: { courseId, status: { in: ['confirmed', 'completed', 'cancelled'] }, OR: bookingOr, teeTime: { date: { gte: since } } },
      orderBy: [{ teeTime: { date: 'desc' } }, { teeTime: { time: 'asc' } }], take: 60,
      select: { id: true, golferName: true, players: true, status: true, noShowAt: true, teeTime: { select: { date: true, time: true } } },
    }),
    opts.members ? prisma.courseMembership.findMany({
      // Active members only: Members opens on its active list.
      where: { courseId, status: 'active', OR: [
        { inviteName: contains(q) },
        { golfer: { OR: [{ firstName: contains(q) }, { lastName: contains(q) }] } },
        ...(opts.contact ? [{ inviteEmail: contains(q) }, { golfer: { email: contains(q) } }] : []),
      ] },
      take: 5,
      select: { id: true, inviteName: true, membershipType: true, tier: { select: { name: true } }, golfer: { select: { firstName: true, lastName: true } } },
    }) : Promise.resolve([]),
    // RES-1 / GRP-1: residents are shared across a course group, so search the group's list.
    opts.members ? groupCourseIds(courseId).then(ids => prisma.courseResident.findMany({
      where: { courseId: { in: ids }, OR: [{ name: contains(q) }, { cardNumber: contains(q) }, ...(opts.contact ? [{ email: contains(q) }] : [])] },
      take: 3, select: { id: true, name: true },
    })) : Promise.resolve([]),
  ]);
  const bookings = bySearchOrder(bookingRows.map(b => ({ ...b, date: b.teeTime.date, time: b.teeTime.time })), today).slice(0, 8);
  const out: SearchResult[] = bookings.map(b => ({
    kind: 'booking', id: b.id, name: b.golferName, date: b.date, time: b.time.slice(0, 5), players: b.players, status: b.status, noShow: !!b.noShowAt,
    // A cancelled group isn't on the tee sheet: it opens Money → Cancellations.
    href: b.status === 'cancelled' ? `/dashboard/money?tab=cancellations&q=${encodeURIComponent(b.golferName)}` : `/dashboard?date=${b.date}&q=${encodeURIComponent(b.golferName)}`,
  }));
  for (const m of members) {
    const name = (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : m.inviteName).trim() || 'Member';
    out.push({ kind: 'member', id: m.id, name, tier: m.tier?.name || m.membershipType, href: `/dashboard/members?q=${encodeURIComponent(name)}` });
  }
  for (const r of residents) out.push({ kind: 'resident', id: r.id, name: r.name, href: `/dashboard/members?q=${encodeURIComponent(r.name)}` });
  return out;
}

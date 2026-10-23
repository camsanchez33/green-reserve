// DASH-C search (the mockups' "Find a golfer, booking or member"): one box in
// the course menu. Bookings by golfer name (and by email or phone for logins
// that may see golfer contact), newest tee date first; members by name (and
// email). Every query is this course's only. The route decides what a login
// may search.
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';

export type SearchResult =
  | { kind: 'booking'; id: string; name: string; date: string; time: string; players: number; status: string; href: string }
  | { kind: 'member'; id: string; name: string; tier: string; href: string };

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

export async function operatorSearch(courseId: string, rawQ: string, opts: { contact: boolean; members: boolean }): Promise<SearchResult[]> {
  const q = rawQ.trim().slice(0, 80);
  if (q.length < 2) return [];
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  // Bookings from 60 days back onward — the ones a counter is asked about.
  const since = addDaysStr(todayIn(course?.timezone), -60);
  const digits = q.replace(/\D/g, '');
  // Phones are stored as typed ("555-867-5309"), so match on their digits.
  const phoneIds = opts.contact && digits.length >= 4
    ? (await prisma.$queryRaw<{ id: string }[]>`SELECT b."id" FROM "Booking" b JOIN "TeeTime" t ON t."id" = b."teeTimeId" WHERE b."courseId" = ${courseId} AND t."date" >= ${since} AND regexp_replace(b."golferPhone", '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'} ORDER BY t."date" DESC LIMIT 50`).map(r => r.id)
    : [];
  const bookingOr = [
    { golferName: contains(q) },
    ...(opts.contact ? [{ golferEmail: contains(q) }, ...(phoneIds.length ? [{ id: { in: phoneIds } }] : [])] : []),
  ];
  const [bookings, members] = await Promise.all([
    prisma.booking.findMany({
      // Only what the tee sheet shows (it lists confirmed and completed groups).
      where: { courseId, status: { in: ['confirmed', 'completed'] }, OR: bookingOr, teeTime: { date: { gte: since } } },
      orderBy: [{ teeTime: { date: 'desc' } }, { teeTime: { time: 'asc' } }], take: 8,
      select: { id: true, golferName: true, players: true, status: true, teeTime: { select: { date: true, time: true } } },
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
  ]);
  const out: SearchResult[] = bookings.map(b => ({
    kind: 'booking', id: b.id, name: b.golferName, date: b.teeTime.date, time: b.teeTime.time.slice(0, 5), players: b.players, status: b.status,
    href: `/dashboard?date=${b.teeTime.date}&q=${encodeURIComponent(b.golferName)}`,
  }));
  for (const m of members) {
    const name = (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : m.inviteName).trim() || 'Member';
    out.push({ kind: 'member', id: m.id, name, tier: m.tier?.name || m.membershipType, href: `/dashboard/members?q=${encodeURIComponent(name)}` });
  }
  return out;
}

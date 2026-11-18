// PERF-1: the public course page's data, in one place. Both the JSON API
// (/api/courses/[slug]) and the page's server render use it, so the page can
// ship the course in its first HTML instead of a skeleton that swaps out after
// a client fetch (the swap was the page's layout shift and most of its LCP).
import { prisma } from '@/lib/prisma';
import { ROUND_PACKS_ON } from '@/lib/round-packs-switch';
import { centsToDollarsOr0 } from '@/lib/money';
import { normalizeDbCourse, type BookingPageExtras } from '@/lib/normalize-course';
import { hasLivePromo, closedDatesIn } from '@/lib/booking-look';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { DEFAULT_PUBLIC_WINDOW_DAYS, DEFAULT_MEMBER_WINDOW_DAYS } from '@/lib/booking-window';

/**
 * The booking page's extra fields (Golfer lane item 1). Promo: is any code usable on a
 * tee time inside the PUBLIC window (only a boolean leaves here, never a code). Closed
 * days: from the course's today through its widest window (public or member), since the
 * payload is the same for every viewer.
 */
export async function bookingPageExtras(c: { id: string; timezone?: string | null; publicAdvanceDays?: number | null; memberAdvanceDays?: number | null }, now: Date = new Date()): Promise<BookingPageExtras> {
  const today = todayIn(c.timezone, now);
  const publicDays = c.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS;
  // Both ends from the same course-local today (lastBookableDate falls back to UTC without a timezone).
  const lastPublic = addDaysStr(today, Math.max(0, publicDays));
  const lastAny = addDaysStr(today, Math.max(0, publicDays, c.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS));
  const [codes, closed] = await Promise.all([
    prisma.promoCode.findMany({ where: { courseId: c.id, active: true }, select: { active: true, startsOn: true, endsOn: true, maxUses: true, usesCount: true } }),
    prisma.blackout.findMany({ where: { courseId: c.id, date: { gte: today, lte: lastAny } }, select: { date: true, reason: true } }),
  ]);
  return { hasLivePromo: hasLivePromo(codes, today, lastPublic), closedDates: closedDatesIn(closed, today, lastAny) };
}

/** The golfer-visible course, exactly as the API serialises it — or null. */
export async function loadPublicCourse(slug: string) {
  const dbCourse = await prisma.course.findUnique({
    where: { slug },
    include: {
      schedules: { where: { active: true }, select: { greenFeeWeekdayCents: true, walkingAllowed: true, walkingWeekend: true, tierName: true, startTime: true } },
      photos: { orderBy: { sortOrder: 'asc' as const } },
      teeSets: { orderBy: { sortOrder: 'asc' as const }, select: { name: true, yardage: true, rating: true, slope: true } },
      nines: { orderBy: { sortOrder: 'asc' as const }, select: { name: true, par: true } },
      // PRICE-3: whether the page shows round packs at all (so it doesn't ask when there are none).
      _count: { select: { roundPacks: { where: { active: true, sellOnline: true } } } },
    },
  });

  // Only live, onboarded courses are visible to golfers — a draft/building
  // course has no real tee sheet yet, so there's nothing to show or book.
  if (!dbCourse || !dbCourse.active || dbCourse.liveStatus !== 'live' || dbCourse.archivedAt) return null;

  // MP-3 B2d: schedules are cents; the public course page shows a "from $X" price, so convert here.
  const cheapestCents = dbCourse.schedules.length > 0 ? Math.min(...dbCourse.schedules.map((s: { greenFeeWeekdayCents: number }) => s.greenFeeWeekdayCents)) : 0;
  // JSON round trip: the page receives exactly what the API sends (Dates as
  // ISO strings), so the client component sees one shape either way.
  const payable = dbCourse.stripeAccountActive && !!dbCourse.stripeAccountId;
  const sellsPacks = ROUND_PACKS_ON && dbCourse._count.roundPacks > 0 && payable;
  const extras = await bookingPageExtras(dbCourse);
  return JSON.parse(JSON.stringify({ ...normalizeDbCourse(dbCourse, centsToDollarsOr0(cheapestCents), extras), sells_packs: sellsPacks }));
}

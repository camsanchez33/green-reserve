// PERF-1: the public course page's data, in one place. Both the JSON API
// (/api/courses/[slug]) and the page's server render use it, so the page can
// ship the course in its first HTML instead of a skeleton that swaps out after
// a client fetch (the swap was the page's layout shift and most of its LCP).
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { normalizeDbCourse } from '@/lib/normalize-course';

/** The golfer-visible course, exactly as the API serialises it — or null. */
export async function loadPublicCourse(slug: string) {
  const dbCourse = await prisma.course.findUnique({
    where: { slug },
    include: {
      schedules: { where: { active: true }, select: { greenFeeWeekdayCents: true, walkingAllowed: true, walkingWeekend: true } },
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
  const sellsPacks = dbCourse._count.roundPacks > 0 && dbCourse.stripeAccountActive && !!dbCourse.stripeAccountId;
  return JSON.parse(JSON.stringify({ ...normalizeDbCourse(dbCourse, centsToDollarsOr0(cheapestCents)), sells_packs: sellsPacks }));
}

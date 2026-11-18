// PERF-1: the public course page's data, in one place. Both the JSON API
// (/api/courses/[slug]) and the page's server render use it, so the page can
// ship the course in its first HTML instead of a skeleton that swaps out after
// a client fetch (the swap was the page's layout shift and most of its LCP).
import { prisma } from '@/lib/prisma';
import { ROUND_PACKS_ON } from '@/lib/round-packs-switch';
import { centsToDollarsOr0 } from '@/lib/money';
import { normalizeDbCourse, type BookingPageExtras } from '@/lib/normalize-course';
import { hasLivePromo, closedDatesIn } from '@/lib/booking-look';
import { loginGroups } from '@/lib/member-session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { DEFAULT_PUBLIC_WINDOW_DAYS, DEFAULT_MEMBER_WINDOW_DAYS } from '@/lib/booking-window';

/**
 * The booking page's extra fields (Golfer lane item 1). The payload is the same for every
 * viewer, so both use the WIDEST window anyone can book: the public window, the course's
 * member default, or any membership's own window (windowFor in lib/booking-window). Promo:
 * is any code usable on a tee time in that span (only a boolean leaves here, never a code);
 * showing the code box a little too often costs nothing, hiding it costs a golfer the discount.
 * Closed days: every closed day in that span, with staff's reason. Log-in groups: lib/member-session loginGroups.
 */
export async function bookingPageExtras(c: { id: string; timezone?: string | null; publicAdvanceDays?: number | null; memberAdvanceDays?: number | null; residentAdvanceDays?: number | null; hasResidentPricing?: boolean | null; memberLoginOn?: boolean | null }, now: Date = new Date()): Promise<BookingPageExtras> {
  const today = todayIn(c.timezone, now);
  const tiers = await prisma.membershipTier.findMany({ where: { courseId: c.id }, select: { advanceBookingDays: true, windowPublic: true } });
  const widest = Math.max(
    0,
    c.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS,
    c.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS,
    // A resident card's own window (GOLFER-LOGIN-1), when the course has resident pricing.
    c.hasResidentPricing ? c.residentAdvanceDays ?? 0 : 0,
    // A membership on the public window books no further than the public.
    ...tiers.map(t => (t.windowPublic ? 0 : t.advanceBookingDays ?? 0)),
  );
  // Both ends from the same course-local today (lastBookableDate falls back to UTC without a timezone).
  const lastDay = addDaysStr(today, Math.min(366, widest));
  const [codes, closed, groups] = await Promise.all([
    prisma.promoCode.findMany({ where: { courseId: c.id, active: true }, select: { active: true, startsOn: true, endsOn: true, maxUses: true, usesCount: true } }),
    prisma.blackout.findMany({ where: { courseId: c.id, date: { gte: today, lte: lastDay } }, select: { date: true, reason: true } }),
    loginGroups(c),
  ]);
  return { hasLivePromo: hasLivePromo(codes, today, lastDay), closedDates: closedDatesIn(closed, today, lastDay), loginGroups: groups };
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
      // RANGE-1: the bucket list (lib/range-buckets courseBuckets' order); normalizeDbCourse sends it only when sold online.
      shopItems: { where: { rangeBalls: { not: null }, parentId: null, active: true }, orderBy: [{ sortOrder: 'asc' as const }, { priceCents: 'asc' as const }, { name: 'asc' as const }], select: { id: true, name: true, rangeBalls: true, priceCents: true } },
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
  return JSON.parse(JSON.stringify({ ...normalizeDbCourse({ ...dbCourse, rangeBucketItems: dbCourse.shopItems }, centsToDollarsOr0(cheapestCents), extras), sells_packs: sellsPacks }));
}

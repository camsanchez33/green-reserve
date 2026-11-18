import { policyFrom } from './cancel-policy';
import { facilityLines } from '@/lib/facilities';
import { centsToDollarsOr0 } from './money';
import { walkingSummary } from './walking';
import { golferConditionLines } from './course-conditions';
import { onlineRangeOn } from './range-buckets';
import { bookingLookOf } from './booking-look';

/** Booking page fields that need their own queries (lib/public-course bookingPageExtras). */
export type BookingPageExtras = { hasLivePromo: boolean; closedDates: { date: string; reason: string }[]; loginGroups: ('members' | 'residents')[] };
/**
 * Maps a Prisma Course row (camelCase) onto the snake_case shape the golfer-facing
 * UI (CourseCard, /courses, /courses/[slug]) was built against. Used by every public
 * course-facing API route so there's exactly one mapping to keep in sync, instead of
 * each route inventing its own (which is how green_fee/par/image_gradient silently
 * went undefined on real DB courses before).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDbCourse(c: any, startingGreenFee = 0, extras?: BookingPageExtras) {
  const walking = walkingSummary(Array.isArray(c.schedules) ? c.schedules.filter((r: { walkingAllowed?: unknown }) => typeof r?.walkingAllowed === 'boolean') : []);
  // Setup audit 17 (2026-11-01): the golfer page's Twilight filter starts where the course's own
  // twilight price period does (a schedule period named "Twilight"), not at a fixed 4 PM.
  const twilightStarts: string[] = Array.isArray(c.schedules)
    ? c.schedules.filter((r: { tierName?: unknown; startTime?: unknown }) => typeof r?.tierName === 'string' && /twilight/i.test(r.tierName) && typeof r.startTime === 'string' && /^\d{2}:\d{2}$/.test(r.startTime) && r.startTime > '12:00')
        .map((r: { startTime: string }) => r.startTime).sort()
    : [];
  return {
    twilight_start: twilightStarts[0] ?? null,
    id: c.id,
    slug: c.slug,
    name: c.name,
    type: c.type,
    city: c.city,
    state: c.state,
    address: c.address,
    timezone: c.timezone ?? null,
    phone: c.phone,
    website: c.website,
    booking_url: c.bookingUrl ?? '',
    holes: c.holes,
    par: c.par,
    description: c.description,
    // The booking page reads this as a list; a joined string crashed it (.filter on a string).
    amenities: Array.isArray(c.amenities) ? c.amenities.map((a: unknown) => String(a)) : [],
    // Settings rework (Cam 2026-10-19): everything the course ticked under Facilities, in golfers' words.
    facilities: facilityLines(c),
    // CART-1 (Cam 2026-10-24): walking is set per price-table cell, so About sums up the running schedule rows.
    walking_allowed: walking !== 'never',
    cart_required: walking === 'never',
    walking_policy: walking,
    walking_note: c.walkingNote ?? '',
    dress_code: Array.isArray(c.dresscode) ? c.dresscode.map((l: unknown) => String(l).trim()).filter(Boolean) : [],
    rating: c.rating ?? 4.5,
    review_count: c.reviewCount ?? 0,
    image_gradient: c.imageGradient ?? 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
    logo_url: c.logoUrl ?? '',
    conditions: c.conditions ?? '',
    // DASH-D (Cam 2026-11-01, "conditions on the booking page"): carts / range / greens / pins, while fresh.
    conditions_today: golferConditionLines(c.conditionsDetail, c.conditionsDetailAt),
    hero_image_url: c.heroImageUrl ?? '',
    confirmation_note: c.confirmationNote ?? '',
    featured: c.featured ?? false,
    base_green_fee: startingGreenFee,
    cart_fee: 0,
    active: c.active ?? false,
    // Deferred-payment booking flow (range balls / cancellation policy display)
    has_driving_range:       c.hasDrivingRange ?? false,
    range_balls_free:        c.rangeBallsFree ?? true,
    // ALERTS-2: the booking page shows tee time alerts only when this is on.
    tee_time_alerts_on:      c.teeTimeAlertsOn !== false,
    // CART-2: 'per_cart' = the cart price is one cart for two riders.
    cart_pricing:            c.cartPricing === 'per_cart' ? 'per_cart' : 'per_player',
    // MP-3 B2b — THE HOLE IN THE RENAME. This function takes `c: any`, so the
    // renamed columns did NOT produce a compile error here: the old names simply
    // read undefined and fell through to these defaults, which would have shown
    // every golfer a $10 late-cancel fee and free range balls regardless of what
    // the course actually charges. Loose types are where a rename stops
    // protecting you, so these read the cents columns and convert explicitly.
    // The wire contract for this normalizer stays DOLLARS.
    // RANGE-1 (Cam 2026-11-17/18): the course's buckets for the booking page, from its one list — only when it sells
    // them with tee times (loaders that don't include the list send none). The old size prices are no longer read.
    range_buckets: onlineRangeOn({ hasDrivingRange: !!c.hasDrivingRange, sellRangeOnline: !!c.sellRangeOnline, rangeBallsFree: c.rangeBallsFree !== false }) && Array.isArray(c.rangeBucketItems)
      ? (c.rangeBucketItems as { id: string; name: string; rangeBalls: number | null; priceCents: number }[]).map(i => ({ id: i.id, name: i.name, balls: i.rangeBalls, price_cents: i.priceCents }))
      : [],
    cancellation_hours:      c.cancellationHours ?? 24,
    // BOOKING WINDOWS: the picker greys out days the viewer cannot book.
    public_advance_days:     c.publicAdvanceDays ?? 7,
    member_advance_days:     c.memberAdvanceDays ?? 14,
    has_member_pricing:      !!c.hasMemberPricing,
    late_cancellation_fee:   c.lateCancellationFeeCents != null ? centsToDollarsOr0(c.lateCancellationFeeCents) : 10,
    // SP-B: the full cancellation & card policy, in cents — describePolicy() turns it into the golfer's words.
    cancel_policy:           policyFrom({ cancellationHours: c.cancellationHours, lateCancellationFeeCents: c.lateCancellationFeeCents ?? 1000, lateFeeBasis: c.lateFeeBasis, lateFeeTiming: c.lateFeeTiming, noShowFeeCents: c.noShowFeeCents, noShowFeeBasis: c.noShowFeeBasis, autoNoShowMinutes: c.autoNoShowMinutes, checkInWindowHours: c.checkInWindowHours }),
    brand_color:             c.brandColor ?? '#173B2A',
    // Booking page look (Cam 2026-11-18): Light or Dark plus one preset accent, by name; accent null
    // until the course picks one; until then the golfer pages use brand_color (BOOKING-LOOK-1).
    booking_look:            bookingLookOf(c),
    // GOLFER-LOGIN-1: whether the booking page shows the per-course Log in ("Show Log in on your booking
    // page"), and how far ahead a golfer logged in with a resident card can book (null = the public window).
    member_login_on:         c.memberLoginOn !== false,
    // Null too when the course has resident pricing off, so a stale column never shows a window nobody gets.
    resident_advance_days:   c.hasResidentPricing && typeof c.residentAdvanceDays === 'number' ? c.residentAdvanceDays : null,
    // Only on the single-course payload (loadPublicCourse, preview): whether a code box is worth
    // showing (never the codes), and the closed days in the booking window with staff's reason.
    // login_groups: which groups can log in here ('members', 'residents'), for the Log in line; [] when Log in is off.
    ...(extras ? { has_live_promo: extras.hasLivePromo, closed_dates: extras.closedDates, login_groups: extras.loginGroups } : {}),
    gift_card_url:           c.giftCardUrl ?? '',
    hero_photo_url:          c.heroPhotoUrl ?? '',
    photos: Array.isArray(c.photos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? c.photos.map((p: any) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder }))
      : [],
    // Settings rework (Cam 2026-10-19): the tees and named nines the course set
    // up under Course layout, shown in the About section.
    tee_sets: Array.isArray(c.teeSets)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? c.teeSets.map((t: any) => ({ name: String(t.name), yardage: Number(t.yardage) || 0, rating: Number(t.rating) || 0, slope: Number(t.slope) || 0 }))
      : [],
    nines: Array.isArray(c.nines)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? c.nines.map((n: any) => ({ name: String(n.name), par: Number(n.par) || 0 }))
      : [],
  };
}

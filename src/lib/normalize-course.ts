/**
 * Maps a Prisma Course row (camelCase) onto the snake_case shape the golfer-facing
 * UI (CourseCard, /courses, /courses/[slug]) was built against. Used by every public
 * course-facing API route so there's exactly one mapping to keep in sync, instead of
 * each route inventing its own (which is how green_fee/par/image_gradient silently
 * went undefined on real DB courses before).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDbCourse(c: any, startingGreenFee = 0) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    type: c.type,
    city: c.city,
    state: c.state,
    address: c.address,
    phone: c.phone,
    website: c.website,
    booking_url: c.bookingUrl ?? '',
    holes: c.holes,
    par: c.par,
    description: c.description,
    amenities: Array.isArray(c.amenities) ? c.amenities.join(', ') : (c.amenities ?? ''),
    walking_allowed: c.walkingAllowed === 'always' || c.walkingAllowed === 'allowed',
    cart_required: c.cartRequired ?? false,
    rating: c.rating ?? 4.5,
    review_count: c.reviewCount ?? 0,
    image_gradient: c.imageGradient ?? 'linear-gradient(160deg,#071810 0%,#1b4332 60%,#2d6a4f 100%)',
    logo_url: c.logoUrl ?? '',
    conditions: c.conditions ?? '',
    hero_image_url: c.heroImageUrl ?? '',
    featured: c.featured ?? false,
    base_green_fee: startingGreenFee,
    cart_fee: 0,
    active: c.active ?? false,
    // Deferred-payment booking flow (range balls / cancellation policy display)
    has_driving_range:       c.hasDrivingRange ?? false,
    range_balls_free:        c.rangeBallsFree ?? true,
    range_balls_small_price: c.rangeBallsSmallPrice ?? 0,
    range_balls_medium_price: c.rangeBallsMediumPrice ?? 0,
    range_balls_large_price: c.rangeBallsLargePrice ?? 0,
    cancellation_hours:      c.cancellationHours ?? 24,
    late_cancellation_fee:   c.lateCancellationFee ?? 10,
    brand_color:             c.brandColor ?? '#24513B',
    gift_card_url:           c.giftCardUrl ?? '',
    hero_photo_url:          c.heroPhotoUrl ?? '',
    photos: Array.isArray(c.photos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? c.photos.map((p: any) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder }))
      : [],
  };
}

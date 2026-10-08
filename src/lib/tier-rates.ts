// The member-rate rules, shared by booking (api/bookings) and moving a group
// to another time (lib/move-booking.ts) so both price a member the same way.
// Moved verbatim out of src/app/api/bookings/route.ts.

/** Returns true for Sat/Sun given a date string like "2026-06-21" */
export function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

/**
 * Resolves the green fee and cart fee for a golfer based on their membership tier.
 * Falls back to the tee time's standard rates if no membership or no override.
 */
export function applyTierRates(
  teeTime: { greenFeeCents: number; cartFeeCents: number; memberRateCents: number | null; date: string },
  tier: {
    greenFeeWeekdayCents: number | null;
    greenFeeWeekendCents: number | null;
    cartFeeWeekdayCents:  number | null;
    cartFeeWeekendCents:  number | null;
    discountPct:          number | null;
  } | null
): { greenFeeCents: number; cartFeeCents: number } {
  // MP-3 B2c: everything here is CENTS now. The unit boundary this function
  // carried through B2a is gone — TeeTime and MembershipTier finally agree, so
  // there is no conversion left to get wrong. discountPct is still a percentage
  // and is the only non-money number in sight.
  if (!tier) return { greenFeeCents: teeTime.greenFeeCents, cartFeeCents: teeTime.cartFeeCents };

  const weekend = isWeekend(teeTime.date);

  // Flat rate overrides
  if (tier.greenFeeWeekdayCents != null || tier.greenFeeWeekendCents != null) {
    const greenFeeCents = weekend
      ? (tier.greenFeeWeekendCents ?? tier.greenFeeWeekdayCents ?? teeTime.greenFeeCents)
      : (tier.greenFeeWeekdayCents ?? teeTime.greenFeeCents);
    const cartFeeCents = weekend
      ? (tier.cartFeeWeekendCents ?? tier.cartFeeWeekdayCents ?? teeTime.cartFeeCents)
      : (tier.cartFeeWeekdayCents ?? teeTime.cartFeeCents);
    return { greenFeeCents, cartFeeCents };
  }

  // Percentage discount off standard. Rounding in cents is the point: the old
  // version did Math.round(dollars * mult * 100) / 100, i.e. float dollars
  // rounded back to 2dp. This rounds to the nearest cent directly.
  if (tier.discountPct != null) {
    const mult = 1 - tier.discountPct / 100;
    return {
      greenFeeCents: Math.round(teeTime.greenFeeCents * mult),
      cartFeeCents:  Math.round(teeTime.cartFeeCents  * mult),
    };
  }

  // No override — fall back to legacy memberRate if set, else standard
  return {
    greenFeeCents: teeTime.memberRateCents ?? teeTime.greenFeeCents,
    cartFeeCents:  teeTime.cartFeeCents,
  };
}

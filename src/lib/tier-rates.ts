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
  teeTime: { greenFeeCents: number; cartFeeCents: number; memberRateCents: number | null; date: string; productId: string | null },
  tier: {
    greenFeeWeekdayCents: number | null;
    greenFeeWeekendCents: number | null;
    cartFeeWeekdayCents:  number | null;
    cartFeeWeekendCents:  number | null;
    discountPct:          number | null;
    /** Required so every caller's select carries it: a tier on line rates must never be priced by the old flat rates. */
    lineRates:            unknown;
  } | null
): { greenFeeCents: number; cartFeeCents: number } {
  // MP-3 B2c: everything here is CENTS now. The unit boundary this function
  // carried through B2a is gone — TeeTime and MembershipTier finally agree, so
  // there is no conversion left to get wrong. discountPct is still a percentage
  // and is the only non-money number in sight.
  if (!tier) return { greenFeeCents: teeTime.greenFeeCents, cartFeeCents: teeTime.cartFeeCents };

  const weekend = isWeekend(teeTime.date);

  // Memberships item 3 (Cam 2026-11-16): a membership set up against the course's own price list prices each line
  // on its own — blank = the public price, 0 = free, a price, or a % off. The older flat rates below are for tiers
  // made before it (lineRates null).
  const lines = readLineRates(tier.lineRates);
  if (lines) {
    const round = teeTime.productId || NO_ROUND;
    const day = weekend ? 'we' : 'wd';
    return {
      greenFeeCents: priceLine(lines[lineKey('green', round, day)], teeTime.greenFeeCents),
      cartFeeCents:  priceLine(lines[lineKey('cart', round, day)], teeTime.cartFeeCents),
    };
  }

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

// ── Memberships item 3: member rates set against the course's own price list ────────────────────────────────────
// One line per round on the price list (Schedule → What it costs), weekday and weekend, for the green fee and for the
// cart: key "green:<round>:wd", "cart:<round>:we", where <round> is the round's CourseProduct id ("-" on a course
// with no named rounds). A line is { cents } (the member's price; 0 = free) or { pct } (% off the public price);
// a line that isn't there is the public price. The public price is the tee time's own (so price periods and
// demand pricing still apply under a % off).

export const NO_ROUND = '-';
export type LineRate = { cents: number } | { pct: number };
export type LineRates = Record<string, LineRate>;
export const lineKey = (what: 'green' | 'cart', round: string, day: 'wd' | 'we') => `${what}:${round || NO_ROUND}:${day}`;
const KEY = /^(green|cart):[A-Za-z0-9_-]{1,40}:(wd|we)$/;
const MAX_CENTS = 1_000_000;

/** What a member pays on one line. */
export function priceLine(line: LineRate | undefined, publicCents: number): number {
  if (!line) return publicCents;
  if ('cents' in line) return line.cents;
  return Math.max(0, Math.round(publicCents * (1 - line.pct / 100)));
}

/** The stored value, or null for a tier still on the older flat rates. Anything malformed is dropped, never priced. */
export function readLineRates(v: unknown): LineRates | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: LineRates = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!KEY.test(k) || !raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (Number.isInteger(r.cents) && (r.cents as number) >= 0 && (r.cents as number) <= MAX_CENTS) out[k] = { cents: r.cents as number };
    else if (typeof r.pct === 'number' && Number.isFinite(r.pct) && r.pct > 0 && r.pct <= 100) out[k] = { pct: r.pct };
  }
  return out;
}

/**
 * Check what the membership setup sends: { "<key>": { cents } | { pct } | null }. Only keys of rounds the course has
 * (roundIds, plus "-") are accepted. null or a missing key = the public price. Returns the value to store or why not.
 */
export function parseLineRates(input: unknown, roundIds: string[]): { ok: true; value: LineRates } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Rates must be a list of price-list lines.' };
  const rounds = new Set([NO_ROUND, ...roundIds]);
  const out: LineRates = {};
  for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KEY.test(k) || !rounds.has(k.split(':')[1])) return { ok: false, error: 'One of those rates isn’t on your price list — refresh and try again.' };
    if (raw === null || raw === undefined || raw === '') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r !== 'object') return { ok: false, error: 'Each rate is a price or a % off.' };
    if ('cents' in r) {
      if (!Number.isInteger(r.cents) || (r.cents as number) < 0 || (r.cents as number) > MAX_CENTS) return { ok: false, error: 'A member price is an amount from $0 (free) up to $10,000.' };
      out[k] = { cents: r.cents as number };
    } else if ('pct' in r) {
      if (typeof r.pct !== 'number' || !Number.isFinite(r.pct) || r.pct <= 0 || r.pct > 100) return { ok: false, error: 'A % off is more than 0 and at most 100.' };
      out[k] = { pct: Math.round(r.pct * 100) / 100 };
    } else return { ok: false, error: 'Each rate is a price or a % off.' };
  }
  return { ok: true, value: out };
}

/** A member's cart price per rider on a tee time, by the same rules as applyTierRates (check-in adds carts with it). */
export function tierCartCents(teeTime: { cartFeeCents: number; date: string; productId: string | null }, tier: Parameters<typeof applyTierRates>[1]): number {
  return applyTierRates({ ...teeTime, greenFeeCents: 0, memberRateCents: null }, tier).cartFeeCents;
}

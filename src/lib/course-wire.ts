import { centsToDollarsOr0, dollarsToCentsOr0 } from './money';

/**
 * Course money: cents at rest, dollars on the wire.
 *
 * MP-3 run B2b moved Course's eight money columns to integer cents and renamed
 * them `*Cents`. As in B2a the API contract deliberately did not change —
 * operator settings forms still send and receive dollars — so no client code
 * had to be touched and none could be silently missed.
 *
 * Course.rating and Course.courseRating are RATINGS, not money. They are absent
 * from both maps here and must never be scaled.
 */

/** wire field name -> cents column name */
const MONEY_FIELDS = {
  lateCancellationFee:   'lateCancellationFeeCents',
  caddieLooperRate:      'caddieLooperRateCents',
  caddieForeRate:        'caddieForeRateCents',
  rangeBallsSmallPrice:  'rangeBallsSmallPriceCents',
  rangeBallsMediumPrice: 'rangeBallsMediumPriceCents',
  rangeBallsLargePrice:  'rangeBallsLargePriceCents',
  clubRentalRate:        'clubRentalRateCents',
  pushCartRate:          'pushCartRateCents',
} as const;

export const COURSE_MONEY_WIRE_FIELDS = Object.keys(MONEY_FIELDS) as (keyof typeof MONEY_FIELDS)[];

/**
 * Strip the `*Cents` columns off a Course row and re-expose them as dollars
 * under their original names, so existing clients and forms are unchanged.
 */
export function courseToWire<T extends Record<string, unknown>>(course: T) {
  const out: Record<string, unknown> = { ...course };
  for (const [wire, cents] of Object.entries(MONEY_FIELDS)) {
    if (cents in out) {
      out[wire] = centsToDollarsOr0(out[cents] as number | null | undefined);
      delete out[cents];
    }
  }
  return out;
}

/**
 * The inverse, for a PATCH body: any money field present in dollars becomes its
 * `*Cents` column. Returns only the money keys — merge it over the rest of your
 * update payload.
 */
export function courseMoneyFromWire(body: Record<string, unknown>): Record<string, number> {
  const data: Record<string, number> = {};
  for (const [wire, cents] of Object.entries(MONEY_FIELDS)) {
    if (wire in body) data[cents] = dollarsToCentsOr0(body[wire] as number | string | null | undefined);
  }
  return data;
}

import { centsToDollars, centsToDollarsOr0 } from './money';

/**
 * MembershipTier: cents at rest, dollars on the wire.
 *
 * MP-3 run B2a moved the six money columns to integer cents and renamed them
 * `*Cents`. The API contract deliberately did NOT change — clients and forms
 * still send and receive dollars, because that is what a person types and
 * reads, and leaving the wire alone means no client code had to be touched (and
 * therefore no client code could be silently missed).
 *
 * Every route that returns tier data passes it through here, so there is one
 * place where the unit changes back. Anything that returns a raw Prisma tier
 * without this will leak cents to a UI that formats dollars — a 100x display
 * bug — so if you add a route that returns tiers, use this.
 */
type TierCentsShape = {
  greenFeeWeekdayCents: number | null;
  greenFeeWeekendCents: number | null;
  cartFeeWeekdayCents: number | null;
  cartFeeWeekendCents: number | null;
  annualFeeCents: number;
  initiationFeeCents: number;
};

export function tierToWire<T extends TierCentsShape>(tier: T) {
  const {
    greenFeeWeekdayCents, greenFeeWeekendCents,
    cartFeeWeekdayCents, cartFeeWeekendCents,
    annualFeeCents, initiationFeeCents,
    ...rest
  } = tier;
  return {
    ...rest,
    greenFeeWeekday: centsToDollars(greenFeeWeekdayCents),
    greenFeeWeekend: centsToDollars(greenFeeWeekendCents),
    cartFeeWeekday:  centsToDollars(cartFeeWeekdayCents),
    cartFeeWeekend:  centsToDollars(cartFeeWeekendCents),
    annualFee:       centsToDollarsOr0(annualFeeCents),
    initiationFee:   centsToDollarsOr0(initiationFeeCents),
  };
}

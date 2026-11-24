// GOLFER-LOGIN-1 2b, the two-groups price (TWO-GROUPS-PRICE, Cam 2026-11-24). A golfer logged in to the course who is
// in two groups here — a live membership with Members pricing on, and a resident card good on the date with Resident
// pricing on and a resident rate on the time — gets ONE of the two on their own seat: the LOWER after deals, the
// member rate on a tie. The two never stack. No guest passes are involved (GUEST-PASS-OFF).
// Holding a resident card never makes a member pay more (final review, Build 2026-11-24): when the membership gives more
// than its own seat at this time — its guests pay the member rate, or its cart is cheaper than the public cart — the
// member rate stays, as before this rule, because a resident booking would lose those for the whole party. Otherwise the
// own seat is the only difference, so comparing it is comparing the booking's total for any party size.
//
// Pure: callers find the groups (lib/member-session) and the rates (lib/tier-rates applyTierRates, the time's
// residentRateCents); this only prices the two seats the one way every path prices them and picks. Used by
// POST /api/bookings, the member tee-times list, /api/bookings/resident-rate and the golfer's swap (lib/move-booking).
import { dealRateSeat } from './last-minute';

export type OwnSeatGroup = 'member' | 'resident';

/** The deal state of one tee time, as the booking prices it: the online public seat (lib/demand-pricing
 *  onlinePublicSeat), the last-minute deal %, the time's list green fee and whether the deal stacks on a rate. */
export type SeatDeals = { pubSeat: number; dealPct: number; publicCents: number; stack: boolean };

/** A member or resident rate's seat after deals: the deal rule of lib/last-minute, never above the public seat. */
export const ratedSeat = (rateCents: number, d: SeatDeals) =>
  Math.min(d.pubSeat, dealRateSeat(d.dealPct, rateCents, d.publicCents, d.stack));

export type OwnSeat = { group: OwnSeatGroup | null; memberSeat: number | null; residentSeat: number | null; seat: number | null };

/** Whether the member's tier gives more than the own seat at this time (lib/tier-rates applyTierRates' cart). */
export const memberGivesMore = (tier: { guestsPayMemberRate: boolean }, memberCartCents: number, publicCartCents: number) =>
  tier.guestsPayMemberRate || memberCartCents < publicCartCents;

/**
 * The golfer's own seat. `memberCents`: the member green fee at this time (applyTierRates), null when no member price
 * applies. `residentCents`: the time's resident rate, null when the resident rate doesn't apply. Each is priced after
 * deals (ratedSeat) and the lower wins; a tie goes to the member rate. Neither: group null, the public seat applies.
 * `memberMore` (memberGivesMore): the membership gives more than the seat here, so the member rate stays.
 */
export function pickOwnSeat(memberCents: number | null, residentCents: number | null, d: SeatDeals, memberMore = false): OwnSeat {
  const memberSeat = memberCents == null ? null : ratedSeat(memberCents, d);
  const residentSeat = residentCents == null ? null : ratedSeat(residentCents, d);
  const group: OwnSeatGroup | null = memberSeat == null
    ? (residentSeat == null ? null : 'resident')
    : (!memberMore && residentSeat != null && residentSeat < memberSeat ? 'resident' : 'member');
  return { group, memberSeat, residentSeat, seat: group === 'member' ? memberSeat : group === 'resident' ? residentSeat : null };
}

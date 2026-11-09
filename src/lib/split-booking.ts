// SPLIT-1 (Cam 2026-11-02: "if John Smith walks in with three people and they all want
// to pay separately for a tee time he booked, that has to be seamless"). Paying
// separately = splitting the players who pay off into their own booking on the same
// tee time, at the group's own per-player prices; each booking then pays through the
// paths that already exist (card on file, the card reader, a pay link, cash at the
// register), so no charge path learns about partial payments.
//
// Who stays: the booker — and with them the member's own rate, the residents (as many
// as still fit), the range balls and any shop items. The players who leave pay what the
// group's other players pay. The two bookings' totals always add up to the one before:
// nothing is gained or lost by splitting. Nothing is charged or refunded here — no money
// moves, so no ledger row (a split booking's money is recorded when it pays).
import { partyFees } from './member-rates';
import { groupGreenFee, otherPerPlayerCents } from './residents';

export type SplitSource = {
  players: number; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  residentPlayers: number; residentRateCents: number | null; memberRateCents: number | null; memberCartCents: number | null;
  /** CART-3: riders (null = all) and the per-cart price, when set. */
  cartRiders?: number | null; cartUnitCents?: number | null;
};
export type SplitPart = {
  players: number; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  residentPlayers: number; residentRateCents: number | null;
};

/**
 * How a group's money divides when `leave` players pay on their own. Pure, client-safe:
 * the tee sheet previews with it and the server splits with it. Null when it can't split
 * (fewer than 2 players, or a count outside 1 … players − 1).
 */
export function splitShares(b: SplitSource, leave: number, publicRate: { greenFeeCents: number; cartFeeCents: number }): { keep: SplitPart; leave: SplitPart } | null {
  if (!Number.isInteger(leave) || leave < 1 || leave >= b.players) return null;
  const n = b.players - leave;
  // The booker's side is priced exactly as a party-size change to n would price it (lib/change-party).
  const fees = partyFees({ players: b.players, greenFeeTotal: b.greenFeeTotal, cartFeeTotal: b.cartFeeTotal, residentPlayers: b.residentPlayers, residentRateCents: b.residentRateCents, memberRateCents: b.memberRateCents, memberCartCents: b.memberCartCents, cartRiders: b.cartRiders ?? null, cartUnitCents: b.cartUnitCents ?? null }, n, publicRate);
  const keepResidents = b.residentPlayers > 0 ? groupGreenFee(n, otherPerPlayerCents(b) ?? publicRate.greenFeeCents, b.residentPlayers, b.residentRateCents).residentPlayers : 0;
  const leaveResidents = Math.max(0, b.residentPlayers - keepResidents);
  const green = b.greenFeeTotal - fees.greenFeeTotal;
  const cart = b.cartFeeTotal - fees.cartFeeTotal;
  if (green < 0 || cart < 0) return null;
  // The booking fee and anything the pieces don't explain (a promo code, a price staff set) divide by players.
  const access = Math.round(b.accessFeeTotal * leave / b.players);
  const gap = b.totalAmount - (b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal + b.accessFeeTotal);
  const leaveTotal = green + cart + access + Math.round(gap * leave / b.players);
  if (leaveTotal < 0 || leaveTotal > b.totalAmount) return null;
  return {
    leave: { players: leave, greenFeeTotal: green, cartFeeTotal: cart, rangeBallsTotal: 0, accessFeeTotal: access, totalAmount: leaveTotal, residentPlayers: leaveResidents, residentRateCents: leaveResidents > 0 ? b.residentRateCents : null },
    keep: { players: n, greenFeeTotal: fees.greenFeeTotal, cartFeeTotal: fees.cartFeeTotal, rangeBallsTotal: b.rangeBallsTotal, accessFeeTotal: b.accessFeeTotal - access, totalAmount: b.totalAmount - leaveTotal, residentPlayers: keepResidents, residentRateCents: keepResidents > 0 ? b.residentRateCents : null },
  };
}

/** Why a group can't be split right now, or null. Shared by the route and the tee sheet. */
export function splitRefusal(b: {
  status: string; paymentStatus: string; players: number; noShowAt: Date | string | null; roundPaymentIntentId: string;
  shopLockedAt: Date | string | null; readerStartedAt: Date | string | null; feePaidCents: number; appliedRate: string;
}): string | null {
  if (b.status !== 'confirmed') return 'This group has already checked in or was cancelled.';
  if (b.players < 2) return 'One player — nothing to split.';
  if (b.noShowAt) return 'This group is marked a no-show — use “Still coming” first.';
  if (b.paymentStatus === 'paid' || b.paymentStatus === 'paid_offline' || b.paymentStatus === 'on_account' || b.roundPaymentIntentId) return 'This round is already paid.';
  if (b.readerStartedAt) return 'This group is being paid on the card reader — finish or cancel it there first.';
  if (b.shopLockedAt) return 'A payment for this group has been started — refresh and look again.';
  if (b.feePaidCents > 0) return 'Part of this booking was paid when it was made — take payment for the whole group.';
  if (b.appliedRate === 'pack') return 'This group is on a round pack — take payment for the whole group.';
  return null;
}

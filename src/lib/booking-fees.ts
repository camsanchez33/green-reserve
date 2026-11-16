export const ACCESS_FEE_CENTS = 150; // $1.50 per player
export const ACCESS_FEE_PER_PLAYER = 1.5; // dollars

export function serviceFeeLabel(players: number): string {
  return `GreenReserve service fee ($1.50 × ${players})`;
}

export function hoursLabel(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`;
}

/**
 * SHOP-FEE-1 (Cam 2026-11-16, replacing POS-1a's 50¢ per sale): GreenReserve's
 * service fee on pro-shop items paid BY CARD — 1% of the items before tax,
 * rounded half up to the cent, added on top of what the golfer pays and taken
 * as GreenReserve's application fee on the course's direct charge. Never on
 * the round (green fee, cart, the $1.50 per player), never on cash, "paid at
 * the counter", a member's account or a check.
 *
 * No global switch: it charges a course only once that course has accepted an
 * Operator Agreement version that names it, and that version is published
 * (lib/shop-fee.ts shopFeeOn). Client-safe.
 */
export const SHOP_FEE_PERCENT = 1;
/** The first Operator Agreement version that names the 1% shop fee. Versions sort as text (YYYY-MM). */
export const SHOP_FEE_FIRST_VERSION = '2026-12';
export const SHOP_FEE_LABEL = 'GreenReserve service fee (1% of shop items)';

/** 1% of `itemsCents` (shop items before tax), rounded half up to the cent: $66.00 → 66¢, $0.50 → 1¢, $0.49 → 0¢. */
export function shopServiceFeeCents(itemsCents: number): number {
  const c = Math.round(Number(itemsCents) || 0);
  return c > 0 ? Math.floor((c * SHOP_FEE_PERCENT + 50) / 100) : 0;
}

/**
 * W2-9b (Cam 2026-10-21/22): GreenReserve's $1.50 per player on event payments
 * made online — on the organizer's balance it is $1.50 × the confirmed
 * headcount, paid on top by the payer. OFF until Operator Agreement v2026-11
 * and legal/LQ-2_FEE_COPY.md include it (Cam: "don't turn on the $1.50 per-player
 * fee for event payments until …"). Turning it on = this line, the agreement
 * version listing the fee (re-accept), /terms and LQ-2 copy. Payments taken at
 * the course never carry it (like paid_offline).
 */
export const EVENT_FEE_ON = false;
export const EVENT_FEE_LABEL = 'GreenReserve service fee';

/**
 * FEE-AT-BOOKING (Cam 2026-10-24: "Yes" — charge GreenReserve's $1.50/player
 * when the golfer books online, so how they pay for the round never changes
 * whether the fee is collected, and cash at the counter stops losing it).
 * Every online booking then takes a card. Refunded when the golfer cancels
 * before the course's cutoff, when the course calls it off (weather, closure,
 * waived), and for players taken off the party before the cutoff; kept on a
 * late cancel or a no-show. lib/booking-fee.ts owns it.
 * OFF until Operator Agreement v2026-11 and legal/LQ-2_FEE_COPY.md say the fee
 * is charged at booking (courses re-accept; golfer /terms updated).
 * Before turning on, re-check the dup guard (findDoubleTap in lib/claim-tee-time.ts): a repeat
 * can be told booked while the first fee is charging.
 */
export const FEE_AT_BOOKING_ON = false;

/** FEE-AT-BOOKING: how much of a booking's GreenReserve fee the booking-time charge already covers. Pure, client-safe. */
export function feeCoveredCents(b: { accessFeeTotal: number; feePaidCents?: number | null }): number {
  return Math.max(0, Math.min(Math.round(b.feePaidCents ?? 0), Math.round(b.accessFeeTotal)));
}

/**
 * What the round's card charge takes: the round, its shop items, their fee and
 * (W2-7 B2) the sales tax on them. `shopTaxCents` is required in the type so a
 * caller that forgets to load it is a compile error, not a charge without tax.
 */
export function roundChargeCents(b: { totalAmount: number; shopTotalCents?: number | null; shopFeeCents?: number | null; shopTaxCents: number | null | undefined; accessFeeTotal?: number; feePaidCents?: number | null }): number {
  // FEE-AT-BOOKING: the part of GreenReserve's fee already taken when they booked is not charged again.
  return Math.round(b.totalAmount) + (b.shopTotalCents ?? 0) + (b.shopFeeCents ?? 0) + (b.shopTaxCents ?? 0) - feeCoveredCents({ accessFeeTotal: b.accessFeeTotal ?? 0, feePaidCents: b.feePaidCents });
}

export const ACCESS_FEE_CENTS = 150; // $1.50 per player
export const ACCESS_FEE_PER_PLAYER = 1.5; // dollars

export function serviceFeeLabel(players: number): string {
  return `GreenReserve service fee ($1.50 × ${players})`;
}

export function hoursLabel(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`;
}

/** POS-1a (Cam 2026-10-08): GreenReserve's fee on pro-shop items added to a
 *  round — $0.50 per sale, paid by the golfer. Client-safe; lib/shop.ts owns the rules. */
export const SHOP_SALE_FEE_CENTS = 50;
/**
 * OFF until the Operator Agreement names it. v2026-10 lists GreenReserve's fees
 * as the $1.50 booking fee and 1% of dues, and /for-courses calls those "our
 * only revenue" — charging a shop fee before a version that includes it would
 * contradict the contract courses are signing. Turning it on = this line, an
 * agreement version listing the fee (re-accept), /terms and LQ-2 copy.
 */
export const SHOP_FEE_ON = false;
export const SHOP_FEE_LABEL = 'GreenReserve service fee (shop items)';

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

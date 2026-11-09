// CART-2 (Cam 2026-11-06: "some courses charge differently for carts so important to make that somewhere
// in the settings"). A course charges carts per player (each rider pays the cart price — as before) or per
// cart: the schedule's cart price is then ONE cart for two riders, and riders round up (3 riders = 2 carts).
// Cam's picks: the same schedule cell means "a cart"; round-pack seats that include the cart leave the count,
// and a per-cart course charges members the cart price (a tier's own cart price only applies per player).
//
// The rule is copied onto the booking when it is made (Booking.cartUnitCents = the price of one cart,
// Booking.cartRiders = the riders who pay), so a later change in Settings never reaches a booking already
// made. A booking with cartUnitCents null is priced per player, exactly as before this file existed.
// Pure — every path that prices a cart (online, the counter, admin, moves, party changes, splits) calls it.

export type CartRule = 'per_player' | 'per_cart';
export const RIDERS_PER_CART = 2;

export function cartRuleOf(v: unknown): CartRule { return v === 'per_cart' ? 'per_cart' : 'per_player'; }

/** Carts for this many riders: two to a cart, rounded up. */
export function cartsFor(riders: number): number {
  const r = Math.max(0, Math.floor(riders));
  return Math.ceil(r / RIDERS_PER_CART);
}

export type CartCharge = { cartFeeTotal: number; cartUnitCents: number | null; cartRiders: number | null };

/**
 * What a new booking pays for carts.
 *   rule           the course's rule (Course.cartPricing)
 *   cart           a cart is taken (chosen, or the time can't be walked)
 *   players        the group
 *   coveredSeats   seats whose cart is already paid for (a round pack that includes the cart)
 *   unitCents      the time's cart price — per cart under 'per_cart', per player otherwise
 *   perPlayerTotal what the per-player rules already worked out (member rates, packs) — used as is per player
 */
export function cartCharge(o: { rule: CartRule; cart: boolean; players: number; coveredSeats?: number; unitCents: number; perPlayerTotal: number }): CartCharge {
  if (!o.cart) return { cartFeeTotal: 0, cartUnitCents: null, cartRiders: null };
  if (o.rule !== 'per_cart') return { cartFeeTotal: o.perPlayerTotal, cartUnitCents: null, cartRiders: null };
  const riders = Math.max(0, o.players - Math.max(0, o.coveredSeats ?? 0));
  const unit = Math.max(0, Math.round(o.unitCents));
  return { cartFeeTotal: cartsFor(riders) * unit, cartUnitCents: unit, cartRiders: riders };
}

/**
 * A per-cart booking whose group changes size: the riders follow the players (never more riders than
 * players), and the carts are re-counted at the booking's own cart price. Null for a per-player booking —
 * the caller keeps its per-player rules.
 */
export function resizeCart(b: { players: number; cartSelected: boolean; cartUnitCents: number | null; cartRiders: number | null }, newPlayers: number): { cartFeeTotal: number; cartRiders: number } | null {
  if (b.cartUnitCents == null) return null;
  if (!b.cartSelected) return { cartFeeTotal: 0, cartRiders: 0 };
  const before = b.cartRiders ?? b.players;
  const riders = Math.max(0, Math.min(newPlayers, before + (newPlayers - b.players)));
  return { cartFeeTotal: cartsFor(riders) * b.cartUnitCents, cartRiders: riders };
}

/** Splitting a per-cart booking: who leaves takes their riders with them (the money is split by splitShares). */
export function splitRiders(b: { players: number; cartUnitCents: number | null; cartRiders: number | null }, leave: number): { keep: number | null; leave: number | null } {
  // CART-3: a per-player cart where only some ride — the booker's side keeps the riders first (as partyFees prices it).
  if (b.cartUnitCents == null) {
    if (b.cartRiders == null || b.cartRiders >= b.players) return { keep: null, leave: null };
    const keep = Math.min(b.players - leave, b.cartRiders);
    return { keep, leave: b.cartRiders - keep };
  }
  const riders = b.cartRiders ?? b.players;
  // Seats whose cart is covered (a pack) stay with the booker, so everyone who leaves is a paying rider.
  const leaving = Math.max(0, Math.min(riders, leave));
  return { keep: riders - leaving, leave: leaving };
}

/** The golfer- and staff-facing words for a time's cart price. */
export function cartPriceWords(rule: CartRule, unitCents: number): string {
  const d = `$${(unitCents / 100).toFixed(2)}`;
  return rule === 'per_cart' ? `${d} a cart (2 riders)` : `${d} a player`;
}

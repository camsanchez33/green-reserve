// Bump this whenever /terms materially changes so old bookings keep an
// honest record of which version the golfer actually agreed to.
// LEGAL PAGES V2 (RUN_QUEUE) — /terms rewritten with card-authorization
// language, communications consent, and governing law/arbitration.
export const CURRENT_TERMS_VERSION = '2026-11-05'; // A2P: an 'SMS Terms' heading + no selling/sharing opt-in data (Twilio carrier review)

/**
 * SHOP-FEE-1 (Cam 2026-11-16): /terms names the 1% service fee on card pro-shop items only once the
 * Operator Agreement version naming it is in effect (lib/shop-fee.ts shopFeeVersionLive). From then on a
 * golfer agrees to this version; until then to CURRENT_TERMS_VERSION. Stamp bookings with termsVersionNow().
 */
export const SHOP_FEE_TERMS_VERSION = '2026-11-16';

/** The /terms version a golfer is shown right now. Never throws. */
export async function termsVersionNow(): Promise<string> {
  const { shopFeeVersionLive } = await import('./shop-fee');
  return (await shopFeeVersionLive()) ? SHOP_FEE_TERMS_VERSION : CURRENT_TERMS_VERSION;
}
// prior: '2026-11-02'; // SMS-1: texts only with a separate opt-in, up to 4 per booking
// prior: '2026-10-19'; // legal rewrite: GreenReserve LLC (NY), fee timing, card authorizations, SMS terms
// prior: '2026-10-08'; // membership fee: 1% of dues, member-paid (was $0.50)
// prior: '2026-09-29'; // FB-3: booking fee charged on its own on a no-show / counter payment

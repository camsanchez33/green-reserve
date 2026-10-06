/**
 * R-GOLF-011: performCheckIn() speaks to staff ("the operator needs to finish
 * Stripe onboarding", "Collect payment in person"). The golfer on this page
 * gets the same facts in their own words; anything unrecognised passes through.
 */
export function golferCheckInError(error: string): string {
  if (/^Stripe setup incomplete/.test(error)) return 'This course can’t take card payments online yet. Please check in and pay at the pro shop.';
  const declined = /^Payment failed: (.*)\. Collect payment in person/.exec(error);
  if (declined) return `Your card couldn’t be charged (${declined[1]}). Try another card, or pay at the pro shop.`;
  const setup = /^Card setup failed: (.*)$/.exec(error);
  if (setup) return `That card couldn’t be used (${setup[1]}). Try another card, or pay at the pro shop.`;
  if (/^No card on file/.test(error)) return 'Enter your card details to check in.';
  return error;
}

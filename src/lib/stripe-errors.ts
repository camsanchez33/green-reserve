// Friendly-message map for Stripe decline/error strings (REVISE_QUEUE A-06
// item 4: "kill raw API text"). checkInFailReason stores whatever Stripe threw;
// this turns the common ones into plain English an admin can act on. Anything
// unmatched falls back to a generic line rather than leaking raw API prose.
const PATTERNS: { test: RegExp; message: string }[] = [
  { test: /insufficient[_ ]funds/i, message: "Card declined — insufficient funds. The golfer needs to pay in person or use another card." },
  { test: /card[_ ]declined|generic[_ ]decline|do[_ ]not[_ ]honor/i, message: "Card was declined by the bank. Collect payment in person or ask the golfer for another card." },
  { test: /expired[_ ]card/i, message: "Card has expired. The golfer needs to provide a new card." },
  { test: /incorrect[_ ]cvc|invalid[_ ]cvc/i, message: "Card security code (CVC) was wrong. The golfer needs to re-enter their card." },
  { test: /incorrect[_ ]number|invalid[_ ]number/i, message: "Card number was invalid. The golfer needs to re-enter their card." },
  { test: /lost[_ ]card|stolen[_ ]card/i, message: "Card reported lost or stolen — do not retry. Collect payment another way." },
  { test: /processing[_ ]error/i, message: "Temporary processing error on Stripe's side. A retry usually clears this." },
  { test: /authentication[_ ]required|3d[_ ]secure/i, message: "The bank wants extra verification. The golfer needs to re-confirm the card." },
  { test: /rate[_ ]limit/i, message: "Too many attempts too fast. Wait a moment and retry." },
  { test: /no such|resource_missing/i, message: "The saved card is no longer on file with Stripe. The golfer needs to re-enter a card." },
  { test: /account.*(cannot|inactive|disabled|charges)/i, message: "The course's Stripe account can't accept charges right now — check its Stripe connection." },
];

export function friendlyStripeError(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return 'The charge did not go through. Collect payment in person and retry.';
  for (const { test, message } of PATTERNS) {
    if (test.test(raw)) return message;
  }
  return 'The charge did not go through. Collect payment in person, or retry if this looks temporary.';
}

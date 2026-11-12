// Golf Courses (ADMIN-REDO page 2): the definitions behind the labels (DENSE: definitions
// live behind the label, not on the page) and the page's error wording.

export const TERMS = {
  fees: "GreenReserve's service fees on rounds paid this month, less fees refunded",
  missed: 'Service fees not collected because the round was paid in cash at the counter',
  risk: (days: number) => `Live ${days}+ days with no booking in the last ${days}`,
  test: "A test course — never in the platform's numbers",
  vsPrior: 'Last month to the same day',
  online: "Share of this month's bookings made online by golfers, where our service fee is earned",
} as const;

export const SESSION_ENDED = 'Your session ended — sign in again.';
export const loadFailed = (what: string, status?: number) =>
  status ? `${what} didn't load (error ${status}). Try again.` : `${what} didn't load — check your connection and try again.`;
export const STRIPE_STATE = (active: boolean, connected: boolean) =>
  active ? 'Connected, taking payments' : connected ? 'Connected, not taking payments yet' : 'Not connected';
export const NO_CONTACT = "Your role doesn't include contact details.";
export const NO_NOTES = 'No notes yet. Add them on the full profile.';

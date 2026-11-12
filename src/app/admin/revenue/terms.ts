// Revenue (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the labels (DENSE: they live
// behind the label, not on the page) and the page's fixed wording.

export const TERMS = {
  revenue: "GreenReserve's service fees on rounds paid in the period, plus fees charged on their own, less fees given back",
  average: 'Revenue divided by the courses live now (active and not archived; test courses never count)',
  payout: "The next payout from GreenReserve's Stripe balance to our bank",
  vsPrior: 'The same number of days just before this period, up to the same point',
  bookings: 'Bookings made in the period that are still on (confirmed or played)',
  courseRevenue: 'Service fees on rounds paid at this course in the period',
  books: 'Service fees we recorded against what Stripe reports as application fees for the same dates',
  coursePayments: "Only a course that wasn't paid right shows here. Golfer disputes are the course's, with its player",
} as const;

export const NOT_YET = 'Not available yet';
export const OWNER_ONLY = 'Only the owner sees this';
export const SESSION_ENDED = 'Your session ended — sign in again.';
export const loadFailed = (what: string, status?: number) =>
  status ? `${what} didn't load (error ${status}). Try again.` : `${what} didn't load. Check your connection and try again.`;

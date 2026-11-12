// Revenue (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the labels (DENSE: they live
// behind the label, not on the page) and the page's fixed wording.

export const TERMS = {
  revenue: "GreenReserve's own money in the period: every fee we took, less every fee we gave back",
  average: 'Revenue divided by the courses live at the end of the period (test courses never count)',
  payout: "The next payout from GreenReserve's Stripe balance to our bank",
  vsPrior: 'The period before this one, up to the same point when this one is still running',
  bookings: 'Bookings made in the period that are still on (confirmed or played)',
  courseRevenue: "GreenReserve's fees from this course in the period, less fees given back",
  books: 'Service fees we recorded against what Stripe reports as application fees for the same dates',
  ledger: "Every movement of GreenReserve's own money in the period: our fee taken or given back, one row each",
  coursePayments: "Only a course that wasn't paid right shows here. Golfer disputes are the course's, with its player",
} as const;

export const NOT_YET = 'Not available yet';
export const OWNER_ONLY = 'Only the owner sees this';
export const SESSION_ENDED = 'Your session ended — sign in again.';
export const loadFailed = (what: string, status?: number) =>
  status ? `${what} didn't load (error ${status}). Try again.` : `${what} didn't load. Check your connection and try again.`;

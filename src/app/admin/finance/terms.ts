// Financial analytics (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the labels (DENSE:
// they live behind the label, not on the page) and the page's fixed wording.

export const TERMS = {
  revenue: "GreenReserve's own money: every fee we took, less every fee we gave back",
  expenses: 'What GreenReserve paid to run, from Expenses: running costs counted by the day, one-time costs in their month',
  profit: 'Revenue less expenses',
  margin: 'Profit as a share of revenue. Its change is in points',
  vsPrior: 'The same stretch just before; up to the same day while this one is still running',
  bookings: 'Bookings made in the month that are still on (test courses never count)',
  liveCourses: 'Courses live at the end of the month',
  newLive: 'Courses that went live in the month',
} as const;

/** What each revenue source is (behind its label). GreenReserve takes no cut of a course's own no-show or late fee. */
export const SOURCE_TERMS: Record<string, string> = {
  serviceFees: "GreenReserve's service fee on rounds that were played and paid, member house-account payments included",
  noShowLateFees: "GreenReserve's service fee on bookings charged as a no-show or a late cancel (not the course's own fee)",
  membershipDues: 'The 1% fee on membership dues paid through GreenReserve',
  other: 'Fees on pro shop sales and event payments',
} as const;

export const SESSION_ENDED = 'Your session ended — sign in again.';
export const loadFailed = (status?: number) =>
  status ? `Financial analytics didn't load (error ${status}). Try again.` : "Financial analytics didn't load. Check your connection and try again.";
export const NOT_YET = 'Not available yet';

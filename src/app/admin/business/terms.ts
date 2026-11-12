// Business analytics (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the labels (DENSE:
// they live behind the label, not on the page) and the page's fixed wording.

export const TERMS = {
  live: 'Courses live at the end of the period (test courses never count)',
  online: 'Bookings golfers made online in the period that are still on: what earns our fee',
  fill: 'Players booked of the spots on every tee time that has gone off in the period, per live course, then averaged across courses. Its change is in points',
  vsPrior: 'The same stretch just before; up to the same day while this one is still running',
  greenFees: 'Green fees on online bookings: money that came in without staff on the phone',
  afterHours: "Online bookings made while the course's shop was closed",
  paidBefore: 'Rounds paid online, by card at booking or pay link, before the golfer arrived',
  noShowFees: "The course's own no-show and late-cancel fees, collected for it",
  joining: 'Each step: courses, the share of the step before, and the average days at that step',
  reachedToLive: 'Courses reached out to that went live, and the average days it took',
  waitingOnUs: 'Courses in onboarding whose next step is ours',
  ourRevenue: "GreenReserve's fees from this course in the period, less fees given back",
  fillCourse: 'Players booked of the spots on tee times that have gone off in the period',
  share: 'Online bookings as a share of all bookings',
} as const;

export const SESSION_ENDED = 'Your session ended — sign in again.';
export const NOT_YET = 'Not available yet';
export const loadFailed = (status?: number) =>
  status ? `Business analytics didn't load (error ${status}). Try again.` : "Business analytics didn't load. Check your connection and try again.";

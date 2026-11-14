// Business analytics (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the labels (DENSE:
// they live behind the label, not on the page) and the page's fixed wording.

export const TERMS = {
  live: 'Courses live at the end of the period (test courses never count)',
  online: 'Bookings golfers made online in the period that are still on: what earns our fee',
  fill: 'Players booked of the spots on every tee time that has gone off in the period, per live course, then averaged across courses. Its change is in points',
  vsPrior: 'The same stretch just before; up to the same day while this one is still running',
  greenFees: 'Green fees on online bookings, booked (not collected): money that came in without staff on the phone',
  afterHours: "Online bookings made before that day's first tee time, after its last, or on a day with no tee times, in the course's time zone",
  paidBefore: "Rounds the golfer paid themselves by pay link before the tee time: the course's share, our fee taken out",
  noShowFees: "The course's own no-show and late-cancel fees, collected for it",
  joining: 'Each step: courses, the share of the step before, and the average days at that step',
  reachedToLive: 'Every course in the period from its first contact, inbound or ours, that went live, and the average days it took',
  waitingOnUs: 'Courses in onboarding whose next step is ours',
  ourRevenue: "GreenReserve's fees from this course in the period, less fees given back",
  fillCourse: 'Players booked of the spots on tee times that have gone off in the period',
  share: 'Online bookings as a share of all bookings',
} as const;

export const SESSION_ENDED = 'Your session ended — sign in again.';
export const NOT_YET = 'Not available yet';
export const SHORT_PERIOD = 'Courses that came in recently may not have had time to go live yet.';
export const loadFailed = (status?: number) =>
  status ? `Business analytics didn't load (error ${status}). Try again.` : "Business analytics didn't load. Check your connection and try again.";

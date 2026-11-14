// Course support (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the dots and the page's
// fixed wording.

export const TERMS = {
  answered: 'Answered: the last message is ours',
  notAnswered: 'Not answered yet: the course wrote last',
  overdue: 'Waiting more than two business days for our answer',
} as const;

export const SESSION_ENDED = 'Your session ended — sign in again.';
export const NOT_YET = 'Not available yet';
export const TOO_LONG = 'The reply is too long. Keep it under 5,000 characters.';
export const loadFailed = (what: string, status?: number) =>
  status ? `${what} didn't load (error ${status}). Try again.` : `${what} didn't load. Check your connection and try again.`;
export const sendFailed = (status?: number) =>
  status ? `The reply wasn't sent (error ${status}). Try again.` : "The reply wasn't sent. Check your connection and try again.";

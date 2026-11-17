// Settings → Security: the page's sentences (the approved mockup's words), kept out of the components as Goals does.
export const NETWORK = 'Couldn’t reach the server. Check your connection and try again.';
export const CHECKER_NETWORK = 'Couldn’t reach the security checker. Check your connection and try again.';
export const TOAST = {
  undo: 'Undone. The checker will keep watching.',
  approve: 'Approved. Recorded for a person to do; nothing changes on its own.',
  dismiss: 'Not now. Recorded; nothing changes on its own.',
};
export const AI_UNAVAILABLE = 'AI summary unavailable.';
export const NO_CHECK_YET = 'No check yet';
/** What set off an early check (lastTrigger 'spike:<kind>'), in plain words. */
export const SPIKE: Record<string, string> = {
  signins: 'a burst of failed sign-ins',
  owner_device: 'a new owner device',
  errors: 'a jump in site errors',
};
export const SPIKE_OTHER = 'something spiked';
export const NEXT_RUN = ', or right away if something spikes';
export const INCIDENTS_LEAD = 'Everything the checker noticed, newest first, and whether it’s fixed. Tap one for the full story. Kept a year.';
export const RULES_LEAD = 'Only things that are safe and can be undone.';
/** What the checker may do on its own: the approved policy (lanes/admin.md), not data. */
export const RULES: ['ok' | 'warn' | 'bad', string, string][] = [
  ['ok', 'Block an address that is guessing passwords', 'For up to 24 hours. Undo any time.'],
  ['ok', 'Lock an account under attack', 'Same 15-minute lock a person gets after wrong tries. Never your own account.'],
  ['warn', 'Sign out a suspicious session', 'Asks you first, because it can’t be undone.'],
  ['ok', 'Open a bug report', 'With the error and who it hit.'],
  ['bad', 'Never on its own', 'Change code, money, refunds, settings, or anyone’s access for good. It drafts those as a fix you approve, and a person still reviews the code before it ships.'],
];
export const SIGNINS_LEAD = 'Every failed or unusual sign-in on every door in the last 30 days, newest first.';
export const SIGNINS_FOOT = 'Kept 90 days. 20 failures from one address in an hour, or an admin lockout, becomes a Problem and an email. Remove an owner device you don’t recognise on My profile.';
export const ERRORS_LEAD = 'Things that broke for someone in the last 14 days, from Sentry.';

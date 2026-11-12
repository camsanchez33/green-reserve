// ADMIN-REDO Announcements (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Admin Announcements"). Pure helpers
// for the page, pinned by scripts/admin-announcements-test.ts. Every number shown comes from the route, never a guess.

export interface Broadcast {
  id: string; title: string; body: string; emailSent: boolean;
  sentByName: string; createdAt: string; dismissalCount: number;
}
export interface SendOutcome {
  courses: number;
  emailRequested: boolean; emailRecipients: number; emailsSent: number; emailFailures: string[];
}
export interface Reach { courses: number; operators: number }

export const pl = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The list's preview: the message's first non-empty line. */
export const firstLine = (body: string) => body.split('\n').map(l => l.trim()).find(Boolean) ?? '';

/** The wordless search: title or message, any case. */
export function matches(b: Broadcast, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || `${b.title}\n${b.body}`.toLowerCase().includes(s);
}

export function isBroadcasts(v: unknown): v is Broadcast[] {
  return Array.isArray(v) && v.every(b => b && typeof b === 'object' && typeof (b as Broadcast).id === 'string'
    && typeof (b as Broadcast).title === 'string' && typeof (b as Broadcast).body === 'string');
}

/** The result line on the list — counted from what the send reports, never from the recipient list. */
export function outcomeLine(o: SendOutcome): string {
  return `Posted to ${pl(o.courses, 'course dashboard')}`
    + (o.emailRequested ? ` · ${o.emailsSent} of ${pl(o.emailRecipients, 'email')} delivered to Resend` : ' · no email');
}
/** Amber when an email was asked for and any (or all) failed. */
export const outcomeBad = (o: SendOutcome) => o.emailFailures.length > 0 || (o.emailRequested && o.emailsSent < o.emailRecipients);

/** The review step's reach line (the cannot-be-recalled warning is shown beside it). */
export function reachLine(reach: Reach | null, email: boolean): string {
  const dash = reach ? pl(reach.courses, 'course dashboard') : 'every live course’s dashboard';
  return `Shows on ${dash}${email ? ` and emails ${reach ? pl(reach.operators, 'operator') : 'their operators'}.` : '. No email.'}`;
}

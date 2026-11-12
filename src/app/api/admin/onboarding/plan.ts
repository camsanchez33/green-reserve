// ADMIN-REDO page 3 — Onboarding (Cam approved the mockup 2026-11-12). Pure, so
// scripts/admin-onboarding-test.ts can pin it: which courses are listed, the order
// (what each needs), the 8-step checklist, the next step in plain words, and
// the history wording. No database, no server imports.
//
// ONE HOME PER COURSE (Cam 2026-11-12): a course is listed here from its first inquiry until it goes live. The
// day it goes live it leaves this page and shows on Golf Courses (onGolfCourses in ../courses/directory/status.ts).
// Leads (courses we added that never inquired) and closed inquiries are not onboarding. They stay on the
// pipeline page.

import { BOARD_STUCK_DAYS, nextStep, type BoardInquiry } from '@/lib/inquiry-board';
import { REPLY_EVENT_PREFIX } from '@/lib/inquiry-status';

/** The statuses that are onboarding, in order, with the stage name the page shows. */
export const STAGES = [
  ['pending', 'New inquiry'],
  ['in_review', 'Reviewing'],
  ['details_requested', 'Waiting on them'],
  ['details_submitted', 'Details in'],
  ['building', 'Building'],
] as const;
export type OnboardingStatus = (typeof STAGES)[number][0];
const STAGE_NAME: Record<string, string> = Object.fromEntries(STAGES);
export const isOnboardingStatus = (s: string): s is OnboardingStatus => s in STAGE_NAME;
/** A course built by hand (no inquiry) is in our setup. */
export const BY_HAND_STAGE = 'Built by hand';
export const stageName = (status: string) => STAGE_NAME[status] ?? (status === 'live' ? 'Live' : status === 'lead' ? 'Lead' : status === 'rejected' || status === 'archived' ? 'Closed' : status);

/** Overdue: waiting this many days or more in the same stage (the board's and Today's "stuck"). */
export const OVERDUE_DAYS = BOARD_STUCK_DAYS;

/** What a course needs from us: call or email them, or finish our part of the setup. */
export type Need = 'call' | 'setup';
export function needOf(status: string | null): Need {
  return status === 'pending' || status === 'in_review' || status === 'details_requested' ? 'call' : 'setup';
}

export type Sortable = { name: string; status: string | null; daysWaiting: number; snoozed: boolean };
export const isOverdue = (r: Sortable) => !r.snoozed && r.daysWaiting >= OVERDUE_DAYS;
/** 0 overdue · 1 call or email · 2 our setup. */
export const rankOf = (r: Sortable) => (isOverdue(r) ? 0 : needOf(r.status) === 'call' ? 1 : 2);
/** Sorted by what it needs, then the longest wait first, then by name. */
export function compareRows(a: Sortable, b: Sortable) {
  return rankOf(a) - rankOf(b) || b.daysWaiting - a.daysWaiting || a.name.localeCompare(b.name);
}

// ── The 8-step setup checklist ─────────────────────────────────────────────────
// Every step is a fact the product already keeps; none is ticked by hand. The steps are independent (the agreement
// can be signed before the schedule is built). "Step N of 8" is the first one not done.
export type StepFacts = {
  /** The setup sheet came back (details_submitted or later), or a course was built (it has the information). */
  infoIn: boolean;
  built: boolean;
  schedule: boolean;
  approved: boolean;
  login: boolean;
  agreement: boolean;
  stripe: boolean;
  live: boolean;
};
export const STEPS: { key: keyof StepFacts; label: string; todo: string }[] = [
  { key: 'infoIn', label: 'Course information in', todo: 'Get their setup sheet back' },
  { key: 'built', label: 'Course page built', todo: 'Build their course page' },
  { key: 'schedule', label: 'Tee sheet schedule built', todo: 'Build the tee sheet schedule' },
  { key: 'approved', label: 'Course approved their page', todo: 'Get the course to approve their page' },
  { key: 'login', label: 'Owner login set up', todo: 'Get the owner to set their password' },
  { key: 'agreement', label: 'Agreement signed', todo: 'Get the agreement signed' },
  { key: 'stripe', label: 'Stripe payments connected', todo: 'Get Stripe payments connected' },
  { key: 'live', label: 'Live on the booking site', todo: 'Make the course live' },
];
export function checklist(f: StepFacts) {
  const steps = STEPS.map(s => ({ label: s.label, done: !!f[s.key] }));
  const at = steps.findIndex(s => !s.done);
  return { steps, done: steps.filter(s => s.done).length, total: STEPS.length, current: at === -1 ? null : at, todo: at === -1 ? null : STEPS[at].todo };
}

// ── The next step, one plain sentence ──────────────────────────────────────────
const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
const fmtClock = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

/** An inquiry's next step: the pipeline's own nextStep(), reworded without jargon. */
export function inquiryNext(inq: BoardInquiry & { snoozeUntil?: Date | string | null }, now = new Date()): string {
  const step = nextStep(inq, undefined, now);
  if (!step) return 'Nothing left';
  const upcoming = (inq.calls ?? [])
    .filter(c => c.outcome === 'scheduled' && new Date(c.scheduledAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
  switch (step.key) {
    case 'log_call': return 'Write down how the call went';
    case 'call_today': return step.label;
    case 'prep_call': return upcoming ? `Call on ${fmtDay(new Date(upcoming.scheduledAt))} at ${fmtClock(new Date(upcoming.scheduledAt))}` : 'Get ready for the call';
    case 'review_resubmit': return 'Look over the form they sent again';
    case 'snoozed': return inq.snoozeUntil ? `Snoozed until ${fmtDay(new Date(inq.snoozeUntil))}` : 'Snoozed';
    case 'reply': return 'Reply to their question';
    case 'book_call': return 'Book a call with them';
    case 'send_sheet': return 'Send them the setup sheet';
    case 'resend_sheet': return 'Follow up on the setup sheet';
    case 'build': return 'Build their course page';
    case 'send_preview': return 'Send them the preview of their page';
    case 'go_live': return 'Finish the setup and make it live';
    case 'make_changes': return 'Make the changes they asked for';
    case 'send_updated_preview': return 'Send them the updated preview';
    case 'resend_preview': return 'Follow up on the preview';
    default: return 'Open the inquiry';
  }
}

// ── History ────────────────────────────────────────────────────────────────────
export type HistoryEvent = { fromStatus: string; toStatus: string; actorName: string | null; createdAt: Date | string };
/** Encoded payloads (re-submissions, change requests) carry data after '::' — the words before it are the event. */
const clean = (s: string | null) => (s ?? '').split('::')[0].trim().slice(0, 160);
/** Pseudo statuses some writers log a marker under. */
const MARKER_STATUS: Record<string, string> = { contact_updated: 'Contact details updated' };

export function historyLine(e: HistoryEvent): { text: string; detail: string | null } | null {
  const actor = clean(e.actorName);
  if (e.fromStatus !== e.toStatus) {
    // A bare name ("Cam") reads "by Cam"; a sentence ("Stage overridden by Cam") is shown as written.
    const detail = !actor ? null : /\s(by|—)\s|^(Moved|Restored|Stage|Call|Course|Preview|Setup|Replied)\b/.test(actor) ? actor : `by ${actor}`;
    return { text: `Moved to ${stageName(e.toStatus)}`, detail };
  }
  if (MARKER_STATUS[e.toStatus]) return { text: MARKER_STATUS[e.toStatus], detail: actor ? `by ${actor}` : null };
  if (!actor) return null;
  if (actor.startsWith(REPLY_EVENT_PREFIX)) return { text: 'Replied by email', detail: actor.slice(REPLY_EVENT_PREFIX.length).trim() || null };
  return { text: actor, detail: null };
}

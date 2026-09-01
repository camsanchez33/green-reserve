// Single source of truth for what every inquiry status means and which pipeline
// segment it belongs to. Used by /admin/inquiries (list + funnel), the inquiry
// detail page, the Overview strip, and the action queue — so counts can never
// disagree and no status can silently fall off the pipeline (A-02c).
import { latestPageDecision } from './change-requests';


export type InquiryStatus =
  | 'pending' | 'in_review' | 'details_requested' | 'details_submitted'
  | 'building' | 'live' | 'rejected' | 'archived';

// Statuses that count as "in the active pipeline" (not live, not archived/rejected).
export const ACTIVE_STATUSES: InquiryStatus[] = [
  'pending', 'in_review', 'details_requested', 'details_submitted', 'building',
];

export const ARCHIVED_STATUSES: InquiryStatus[] = ['rejected', 'archived'];

// A-02d "alive vs closed never mix": every inquiry is either somewhere on
// the funnel (ALIVE) or out of the pipeline for good (CLOSED — rejected or
// archived-via-the-lifecycle-parity-law). "All" means every ALIVE inquiry
// (the funnel total) — closed records live only in the Closed tab.
export const ALIVE_STATUSES: InquiryStatus[] = [...ACTIVE_STATUSES, 'live'];

// Every status the app knows about. Anything outside this set is "unmapped" —
// a bug, not a silent omission.
export const KNOWN_STATUSES: InquiryStatus[] = [...ACTIVE_STATUSES, 'live', ...ARCHIVED_STATUSES];

export const STATUS_DOT_MAP: Record<string, string> = {
  pending: 'warn', in_review: 'neutral', details_requested: 'neutral',
  details_submitted: 'neutral', building: 'warn', live: 'ok', rejected: 'bad', archived: 'neutral',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review', details_requested: 'Sheet Sent',
  details_submitted: 'Sheet In', building: 'Building', live: 'Live', rejected: 'Rejected',
  archived: 'Archived',
};

// The funnel: every active/live status maps to EXACTLY one segment, in stage
// order. If a new status is ever introduced, it must be added here or the
// completeness check below will flag it.
export const FUNNEL_SEGMENTS = [
  { key: 'new', label: 'New', statuses: ['pending'] as InquiryStatus[] },
  { key: 'in-review', label: 'In review', statuses: ['in_review'] as InquiryStatus[] },
  { key: 'sheet-sent', label: 'Sheet sent', statuses: ['details_requested'] as InquiryStatus[] },
  { key: 'sheet-in', label: 'Sheet in', statuses: ['details_submitted'] as InquiryStatus[] },
  { key: 'building', label: 'Building', statuses: ['building'] as InquiryStatus[] },
  { key: 'live', label: 'Live', statuses: ['live'] as InquiryStatus[] },
] as const;

export function statusToSegmentKey(status: string): string | null {
  for (const seg of FUNNEL_SEGMENTS) {
    if ((seg.statuses as readonly string[]).includes(status)) return seg.key;
  }
  return null;
}

// ─── "Your move" ─────────────────────────────────────────────────────────────
// "Your move" = this inquiry is waiting on US, not on the course. Two things
// that has to get right, both of which it previously got wrong:
//
// 1. HOW LONG IT HAS SAT. The stall thresholds measure time in the CURRENT
//    stage, so they need the moment the inquiry entered that stage. Callers
//    passed `updatedAt` — but CourseInquiry.updatedAt moves on EVERY write, so
//    saving an admin note or fixing a typo reset the clock and made a
//    three-week-old stalled inquiry look like it arrived today. The event
//    ledger is the only honest record of when a stage began.
//
// 2. WHOSE TURN IT IS IN `building`. That was unconditionally "your move",
//    which is true only until the preview goes out. After that the ball is in
//    the course's court, yet every waiting-on-them inquiry kept sitting in the
//    queue as if it needed work — the exact noise that makes a queue stop
//    being read.
const PENDING_STALL_DAYS = 3;    // pending/in_review — "waiting on us"
const SHEET_SENT_STALL_DAYS = 7; // details_requested — "sheet sent, no response"
const PREVIEW_STALL_DAYS = 5;    // building — "preview sent, course has gone quiet"

// The subset of an InquiryStatusEvent these derivations read. Structurally
// compatible with change-requests' own event shape, so the same rows feed both
// and there is no second definition of "whose move is it" to drift.
export type InquiryEventLike = {
  fromStatus: string;
  toStatus: string;
  actorName: string | null;
  createdAt: string | Date;
};

/**
 * When the inquiry entered the stage it is in NOW.
 *
 * The last real transition into the current status. Self-loop events
 * (fromStatus === toStatus) are markers, not transitions — "Preview sent by
 * X", "Course approved their page", a changes-requested payload — and counting
 * them would restart the stage clock every time one was written, which is the
 * same bug as trusting updatedAt.
 *
 * Falls back to createdAt: an inquiry still in its birth status ('pending')
 * has no transition event, and createdAt is the right answer for it anyway.
 */
export function stageEnteredAt(
  status: string,
  createdAt: string | Date,
  events: InquiryEventLike[] | undefined,
): Date {
  let entered: Date | null = null;
  for (const ev of events || []) {
    if (ev.toStatus !== status || ev.fromStatus === ev.toStatus) continue;
    const at = new Date(ev.createdAt);
    if (!entered || at.getTime() > entered.getTime()) entered = at;
  }
  return entered || new Date(createdAt);
}

/** Whole days elapsed since `from`, floored at 0. */
export function daysSince(from: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86400000));
}

/** The most recent "Preview sent" marker, or null if none has ever been sent. */
function lastPreviewSent(events: InquiryEventLike[]): InquiryEventLike | null {
  let latest: InquiryEventLike | null = null;
  for (const ev of events) {
    if (!ev.actorName?.startsWith('Preview sent')) continue;
    if (!latest || new Date(ev.createdAt).getTime() > new Date(latest.createdAt).getTime()) latest = ev;
  }
  return latest;
}

/**
 * Is this inquiry waiting on us?
 *
 * Pass the inquiry's FULL event history — these derivations scope it
 * themselves (see change-requests.scopeToCurrentRound). Pre-filtering is how
 * two callers end up with two different answers to the same question.
 */
export function isYourMove(
  status: string,
  createdAt: string | Date,
  events: InquiryEventLike[] | undefined,
  now: Date = new Date(),
): boolean {
  const evs = events || [];

  // The course sent their sheet back and nobody has picked it up yet.
  if (status === 'details_submitted') return true;

  if (status === 'building') {
    const preview = lastPreviewSent(evs);
    // Nothing sent yet — the build itself is ours to do.
    if (!preview) return true;
    // Sent, so their answer decides. Any decision hands it back to us: fix
    // what they asked for, or flip an approved page live. No decision means we
    // are waiting on them — until they go quiet long enough to need a nudge.
    // (latestPageDecision scopes to the current preview round itself, and
    // returns null for an admin-requested re-review, which is also their turn.)
    if (latestPageDecision(evs)) return true;
    return daysSince(new Date(preview.createdAt), now) > PREVIEW_STALL_DAYS;
  }

  const ageDays = daysSince(stageEnteredAt(status, createdAt, evs), now);
  if ((status === 'pending' || status === 'in_review') && ageDays > PENDING_STALL_DAYS) return true;
  if (status === 'details_requested' && ageDays > SHEET_SENT_STALL_DAYS) return true;
  return false;
}

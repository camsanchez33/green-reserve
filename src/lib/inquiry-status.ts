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

/** How deep in the funnel a status sits. Deeper = closer to revenue, so it
 *  wins ties in the queue. -1 for anything off the funnel (closed). */
export function stageDepth(status: string): number {
  return FUNNEL_SEGMENTS.findIndex(s => (s.statuses as readonly string[]).includes(status));
}

// Written by POST /api/inquiries when a course fills the interest form for an
// inquiry that is already alive (MP-4a's duplicate guard). Exported so the
// writer and every reader share one string — a magic literal in two files is
// a silent break waiting for a typo.
export const RESUBMIT_ACTOR = 'Course submitted the interest form again';

// MP-4c vocabularies. Defined once so the admin UI's options and the API's
// validation can never drift into "the dropdown offers a value the server
// rejects" — and so the answers stay countable instead of becoming free text
// nobody can aggregate. Both are nullable in the schema: "not recorded" is an
// honest state and must not masquerade as a category.
export const INQUIRY_SOURCES = [
  'Inbound form', 'Cold outreach', 'Referral', 'Event or conference', 'Partner', 'Other',
] as const;

export const CLOSED_REASONS = [
  'Price', 'Timing — not ready', 'Uses another platform', 'Never responded',
  'Not a fit', 'Duplicate', 'Other',
] as const;


/**
 * Everything the work queue needs to know about one inquiry, from one pass
 * over its event ledger.
 *
 * `waitingOn` is whose court the ball is in. `yourMove` is whether it needs
 * action NOW — those are different questions: a lead that arrived an hour ago
 * is waiting on us but is not yet due. `pressureDays` is how far past due it
 * is (negative = not due yet), and it is the queue's ranking number.
 */
export type QueueSignal = {
  status: string;
  enteredAt: Date;
  waitingOn: 'us' | 'them' | 'snoozed' | 'none';
  yourMove: boolean;
  pressureDays: number;
  reason: string;
  resubmits: number;
};

/**
 * The shape the queue reads. Taking the inquiry itself rather than four loose
 * arguments is deliberate: MP-4c added snooze and follow-up dates, and an
 * object means a caller that forgets to pass them fails to compile instead of
 * silently ranking against a stale rulebook.
 */
export type QueueInput = {
  status: string;
  createdAt: string | Date;
  events?: InquiryEventLike[] | null;
  snoozeUntil?: string | Date | null;
  nextFollowUpAt?: string | Date | null;
};

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function queueSignal(inq: QueueInput, now: Date = new Date()): QueueSignal {
  const { status, createdAt } = inq;
  const evs = inq.events || [];
  const enteredAt = stageEnteredAt(status, createdAt, evs);
  const inStage = daysSince(enteredAt, now);
  // Only re-submissions since this stage began count. One from three stages
  // ago was already answered by moving the inquiry forward.
  // startsWith, not equality: the event carries what was submitted after the
  // marker so a swallowed duplicate can be told apart from an over-eager guard.
  const resubmits = evs.filter(
    e => e.actorName?.startsWith(RESUBMIT_ACTOR) && new Date(e.createdAt).getTime() >= enteredAt.getTime(),
  ).length;
  const base = { status, enteredAt, resubmits };

  if (status === 'live' || (ARCHIVED_STATUSES as readonly string[]).includes(status)) {
    return { ...base, waitingOn: 'none', yourMove: false, pressureDays: 0,
      reason: status === 'live' ? 'Live' : 'Closed' };
  }

  // MP-4c: a snooze is a decision ("the GM said call after Labor Day"), so it
  // suppresses the whole queue verdict — except when the course itself gets
  // back in touch, which is exactly the news the snooze was betting against.
  const snoozeUntil = inq.snoozeUntil ? new Date(inq.snoozeUntil) : null;
  if (snoozeUntil && snoozeUntil.getTime() > now.getTime() && resubmits === 0) {
    return { ...base, waitingOn: 'snoozed', yourMove: false,
      // Ranked below everything live, furthest-out snooze last.
      pressureDays: -daysSince(now, snoozeUntil),
      reason: `Snoozed until ${shortDate(snoozeUntil)}` };
  }

  const signal = ((): Omit<QueueSignal, 'status' | 'enteredAt' | 'resubmits'> => {
    if (status === 'details_submitted') {
      return { waitingOn: 'us', yourMove: true, pressureDays: inStage,
        reason: inStage < 1 ? 'Sheet just came in — review and build' : `Sheet in ${inStage}d ago — review and build` };
    }

    if (status === 'building') {
      const preview = lastPreviewSent(evs);
      if (!preview) {
        return { waitingOn: 'us', yourMove: true, pressureDays: inStage,
          reason: 'Draft created — no preview sent yet' };
      }
      const sincePreview = daysSince(new Date(preview.createdAt), now);
      const decision = latestPageDecision(evs);
      if (decision === 'changes_requested') {
        return { waitingOn: 'us', yourMove: true, pressureDays: sincePreview,
          reason: 'Course requested changes to their page' };
      }
      if (decision === 'approved') {
        return { waitingOn: 'us', yourMove: true, pressureDays: sincePreview,
          reason: 'Course approved their page — take it live' };
      }
      return { waitingOn: 'them', yourMove: sincePreview > PREVIEW_STALL_DAYS,
        pressureDays: sincePreview - PREVIEW_STALL_DAYS,
        reason: `Preview sent ${sincePreview}d ago — no reply yet` };
    }

    if (status === 'details_requested') {
      return { waitingOn: 'them', yourMove: inStage > SHEET_SENT_STALL_DAYS,
        pressureDays: inStage - SHEET_SENT_STALL_DAYS,
        reason: `Setup sheet sent ${inStage}d ago — not returned` };
    }

    // pending / in_review — ours to work through.
    return { waitingOn: 'us', yourMove: inStage > PENDING_STALL_DAYS,
      pressureDays: inStage - PENDING_STALL_DAYS,
      reason: status === 'pending'
        ? (inStage < 1 ? 'New lead — not reviewed yet' : `New lead, unreviewed for ${inStage}d`)
        : `In review for ${inStage}d` };
  })();

  // A course that fills the form again is asking for attention, whatever
  // stage it is in and whoever we thought the ball was with.
  if (resubmits > 0) {
    return { ...base, ...signal, waitingOn: 'us', yourMove: true,
      reason: resubmits === 1
        ? 'Submitted the interest form again — they are waiting on us'
        : `Submitted the interest form ${resubmits} more times — they are waiting on us` };
  }

  // MP-4c: a follow-up date is a promise the founder made to himself. Once it
  // lands, this is your move no matter what the stage clock says — and it
  // outranks the stage clock only when it is the more overdue of the two, so
  // a kept promise can never bury a genuinely rotting inquiry.
  const followUp = inq.nextFollowUpAt ? new Date(inq.nextFollowUpAt) : null;
  if (followUp && followUp.getTime() <= now.getTime()) {
    const over = daysSince(followUp, now);
    const winsOnPressure = over >= signal.pressureDays;
    return { ...base, ...signal, waitingOn: 'us', yourMove: true,
      pressureDays: Math.max(over, signal.pressureDays),
      reason: winsOnPressure
        ? (over < 1 ? 'Follow-up due today' : `Follow-up was due ${over}d ago`)
        : signal.reason };
  }

  return { ...base, ...signal };
}

/**
 * Queue order: most overdue first, then the deepest stage (closest to
 * revenue), then whoever has been sitting there longest.
 */
export function compareQueue(a: QueueSignal, b: QueueSignal): number {
  // Parked work sorts below live work, always. Without this tier a two-day
  // snooze (-2) and a day-old lead (-2) collide, and the two states have
  // nothing to do with each other — one is a decision, one is a clock.
  const snoozed = Number(a.waitingOn === 'snoozed') - Number(b.waitingOn === 'snoozed');
  if (snoozed !== 0) return snoozed;
  if (a.pressureDays !== b.pressureDays) return b.pressureDays - a.pressureDays;
  const depth = stageDepth(b.status) - stageDepth(a.status);
  if (depth !== 0) return depth;
  return a.enteredAt.getTime() - b.enteredAt.getTime();
}


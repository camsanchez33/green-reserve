// AW-6a (Cam 2026-10-21): the Inquiries board. Four stages, in Cam's words —
// Lead → Talking → Setting up → Live (Lead arrives with AW-6c) — over the
// existing statuses, which stay as they are underneath: a card in "Setting up"
// still knows whether the sheet is out, in, or the course is being built, and
// says so in its next step. Client-safe: no database, no server imports.
import { queueSignal, type QueueInput, type QueueSignal } from './inquiry-status';
import { overdueCall, nextCall, isSameEasternDay, fmtCallClock } from './inquiry-call';
import { computeOpenChanges, latestPageDecision, hasRequestedChangesThisRound } from './change-requests';

export type BoardColumn = 'talking' | 'setup' | 'live';

export const BOARD_COLUMNS: { key: BoardColumn; label: string; hint: string }[] = [
  { key: 'talking', label: 'Talking', hint: 'Inquired, call to book or have' },
  { key: 'setup', label: 'Setting up', hint: 'Sheet out, sheet in, building' },
  { key: 'live', label: 'Live', hint: 'Went live in the last 30 days' },
];

/** Live cards stay on the board this long, then live only in "All". */
export const LIVE_ON_BOARD_DAYS = 30;
/** Matches Today's "stuck" (src/lib/admin-today.ts STUCK_DAYS). */
export const BOARD_STUCK_DAYS = 7;

export function boardColumn(status: string): BoardColumn | null {
  if (status === 'pending' || status === 'in_review') return 'talking';
  if (status === 'details_requested' || status === 'details_submitted' || status === 'building') return 'setup';
  if (status === 'live') return 'live';
  return null; // rejected / archived — Closed, not the board
}

/** What the card's button does: open the inquiry, or fire one of the existing resend actions in place. */
export type StepKey =
  | 'log_call' | 'call_today' | 'review_resubmit' | 'snoozed' | 'prep_call' | 'book_call' | 'send_sheet'
  | 'resend_sheet' | 'build' | 'send_preview' | 'go_live' | 'make_changes' | 'send_updated_preview' | 'resend_preview' | 'open';
export type NextStep = { key: StepKey; label: string; action: 'open' | 'resend_sheet' | 'resend_preview' } | null;

export type BoardInquiry = QueueInput & {
  id: string;
  events?: { fromStatus: string; toStatus: string; actorName: string | null; createdAt: string | Date }[] | null;
  callSkippedReason?: string | null;
};

/** The one next step on a card. Same order of precedence as the Today queue (calls first, then a resubmission, then the stage). */
export function nextStep(inq: BoardInquiry, signal: QueueSignal = queueSignal(inq), now = new Date()): NextStep {
  if (inq.status === 'live') return null;
  const calls = inq.calls ?? [];
  if (overdueCall(calls, now)) return { key: 'log_call', label: 'Log the call', action: 'open' };
  const upcoming = nextCall(calls, now);
  if (upcoming && isSameEasternDay(upcoming.scheduledAt, now)) return { key: 'call_today', label: `Call at ${fmtCallClock(upcoming.scheduledAt)}`, action: 'open' };
  if (signal.resubmits > 0) return { key: 'review_resubmit', label: 'Review what they resent', action: 'open' };
  if (signal.waitingOn === 'snoozed') return { key: 'snoozed', label: 'Snoozed — open', action: 'open' };
  switch (inq.status) {
    case 'pending':
    case 'in_review': {
      const callDone = calls.some(c => c.outcome === 'talked');
      if (upcoming) return { key: 'prep_call', label: 'Get ready for the call', action: 'open' };
      if (!callDone && !inq.callSkippedReason) return { key: 'book_call', label: 'Book a call', action: 'open' };
      return { key: 'send_sheet', label: 'Send the setup sheet', action: 'open' };
    }
    case 'details_requested':
      return { key: 'resend_sheet', label: 'Resend the sheet', action: 'resend_sheet' };
    case 'details_submitted':
      return { key: 'build', label: 'Build the course', action: 'open' };
    case 'building': {
      // From the ledger, not whose-move: a follow-up date can flip that
      // without the course having seen anything.
      const events = inq.events ?? [];
      // A first (or updated) preview opens the inquiry: sending one resets the
      // operator's password, so it stays behind the page's own confirm.
      if (!events.some(e => e.actorName?.startsWith('Preview sent'))) return { key: 'send_preview', label: 'Send the preview', action: 'open' };
      if (latestPageDecision(events) === 'approved') return { key: 'go_live', label: 'Finish and go live', action: 'open' };
      if (computeOpenChanges(events).length > 0) return { key: 'make_changes', label: 'Make their changes', action: 'open' };
      if (hasRequestedChangesThisRound(events)) return { key: 'send_updated_preview', label: 'Send the updated preview', action: 'open' };
      return { key: 'resend_preview', label: 'Resend the preview', action: 'resend_preview' };
    }
  }
  return { key: 'open', label: 'Open', action: 'open' };
}

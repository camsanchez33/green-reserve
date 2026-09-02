// The Overview action queue's inquiry rows.
//
// MP-4d. This used to live inside api/admin/stats as four overlapping SQL
// heuristics — "waiting on us", "sheet sent no response", "preview sent no
// reply" and "changes requested" — each guessing at staleness from
// `updatedAt` with its own threshold. Two problems, both real:
//
//   1. It was a second answer to "whose move is it". The Inquiries list
//      derives that from the event ledger; Overview derived it from the last
//      write. Saving a note moved one and not the other, so the two surfaces
//      could disagree about whether an inquiry needed attention at all.
//   2. The four sources overlapped. One building inquiry with a stale preview
//      and open change requests produced THREE rows and was counted three
//      times in the amber badge — a count of reasons, not of things to do.
//
// Now it is one pass over the active pipeline through `queueSignal`, the same
// derivation the Inquiries list uses, producing exactly one row per inquiry.
import { queueSignal, compareQueue, daysSince, type QueueInput } from './inquiry-status';
import { computeOpenChanges, latestPageDecision, CATEGORY_LABEL } from './change-requests';

export type ActionQueueRow = {
  id: string;
  who: string;
  why: string;
  doThis: string;
  ageDays: number;
  actionLabel: string;
  href: string;
  fire?: { kind: 'resend_preview' | 'resend_sheet'; inquiryId: string };
};

export type QueueInquiry = QueueInput & {
  id: string;
  courseName: string;
  events?: { fromStatus: string; toStatus: string; actorName: string | null; createdAt: string | Date }[] | null;
};

export function buildInquiryQueueRows(inquiries: QueueInquiry[], now: Date = new Date()): ActionQueueRow[] {
  return inquiries
    .map(inq => ({ inq, signal: queueSignal(inq, now) }))
    .filter(({ signal }) => signal.yourMove)
    .sort((a, b) => compareQueue(a.signal, b.signal))
    .map(({ inq, signal }) => {
      const events = inq.events || [];
      // Anchored the same way the inquiry detail page anchors it (per-round,
      // via latestPageDecision/computeOpenChanges), so this can never disagree
      // with that page about what the course actually asked for.
      const decision = inq.status === 'building' ? latestPageDecision(events) : null;
      const open = decision === 'changes_requested' ? computeOpenChanges(events) : [];
      const categories = open.map(it => CATEGORY_LABEL[it.category] || it.category).join(', ');

      let why = signal.reason;
      let doThis = 'Open the inquiry and take the next step.';
      let fire: ActionQueueRow['fire'];

      if (open.length > 0) {
        why = `Changes requested — ${categories}`;
        doThis = `Address each item on the inquiry (${categories}), then send an updated preview.`;
      } else if (inq.status === 'details_requested') {
        doThis = 'They haven’t submitted their details sheet — resend the link or follow up by phone.';
        fire = { kind: 'resend_sheet', inquiryId: inq.id };
      } else if (inq.status === 'building' && signal.waitingOn === 'them') {
        doThis = 'They haven’t responded to the preview — resend it or call to confirm they saw it.';
        fire = { kind: 'resend_preview', inquiryId: inq.id };
      } else if (inq.status === 'building') {
        doThis = 'Course is mid-build — finish it, then send dashboard access or go live.';
      } else if (inq.status === 'details_submitted') {
        doThis = 'Sheet’s back — review their answers and build the course.';
      } else if (inq.status === 'pending' || inq.status === 'in_review') {
        doThis = 'Review the inquiry and either request their details sheet or reject it.';
      }

      // A course that filled the form in again outranks whatever the stage
      // clock was saying — they are actively asking.
      if (signal.resubmits > 0) {
        doThis = 'They filled in the interest form again — review what they sent on the inquiry and apply anything worth keeping.';
      }

      return {
        id: `iq-${inq.id}`,
        who: inq.courseName,
        why,
        doThis,
        // Time in the CURRENT stage, from the ledger — not time since the last
        // write, which reset every time a note was saved.
        ageDays: daysSince(signal.enteredAt, now),
        actionLabel: 'Open',
        href: `/admin/inquiries/${inq.id}`,
        fire,
      };
    });
}

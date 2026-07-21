// Single source of truth for what every inquiry status means and which pipeline
// segment it belongs to. Used by /admin/inquiries (list + funnel), the inquiry
// detail page, the Overview strip, and the action queue — so counts can never
// disagree and no status can silently fall off the pipeline (A-02c).

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

// "Your move" = always-your-turn statuses (sheet in / building) PLUS anything
// that's aged past its stall threshold, even if it's nominally "their turn"
// (e.g. a sheet-sent course that's gone quiet for a week is our move to nudge).
const PENDING_STALL_DAYS = 3; // pending/in_review — "waiting on us"
const SHEET_SENT_STALL_DAYS = 7; // details_requested — "sheet sent no response"

export function isYourMove(status: string, sinceIso: string): boolean {
  if (status === 'details_submitted' || status === 'building') return true;
  const ageDays = Math.floor((Date.now() - new Date(sinceIso).getTime()) / (1000 * 60 * 60 * 24));
  if ((status === 'pending' || status === 'in_review') && ageDays > PENDING_STALL_DAYS) return true;
  if (status === 'details_requested' && ageDays > SHEET_SENT_STALL_DAYS) return true;
  return false;
}

// Single source of truth for structured "request changes" data (V13b).
// Storage rides on the EXISTING InquiryStatusEvent.actorName string field —
// no migration — using a prefix + JSON payload, the same pattern already
// used for markers like "Preview sent by X" and "Course approved their page".

export interface ChangeItem { category: string; detail: string }

export const CHANGE_CATEGORIES = [
  { key: 'pricing', label: 'Pricing' },
  { key: 'photos', label: 'Photos & description' },
  { key: 'tee_times', label: 'Tee times & schedule' },
  { key: 'policies', label: 'Policies (cancellation, windows)' },
  { key: 'course_details', label: 'Course details' },
  { key: 'other', label: 'Something else' },
] as const;
export type ChangeCategoryKey = typeof CHANGE_CATEGORIES[number]['key'];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CHANGE_CATEGORIES.map(c => [c.key, c.label]));

export const CHANGES_REQUESTED_PREFIX = 'CHANGES_REQUESTED::';
export const CHANGE_ADDRESSED_PREFIX = 'CHANGE_ADDRESSED::';
const REQUESTED_PREFIX = CHANGES_REQUESTED_PREFIX;
const ADDRESSED_PREFIX = CHANGE_ADDRESSED_PREFIX;
// Pre-V13b marker — a course could only send one free-text message. Treated
// as a single unlabeled "Something else" item so old data still renders.
export const LEGACY_CHANGES_REQUESTED_MARKER = 'Course requested changes to their page';
const LEGACY_MARKER = LEGACY_CHANGES_REQUESTED_MARKER;

export const APPROVED_MARKER = 'Course approved their page';
// Admin-initiated reset — reopens the review loop without the course having
// asked for anything (e.g. after admin made edits post-approval).
export const RE_REVIEW_REQUESTED_MARKER = 'Admin requested re-review';

export function isChangesRequestedEvent(actorName: string | null | undefined): boolean {
  return !!actorName && (actorName === LEGACY_MARKER || actorName.startsWith(REQUESTED_PREFIX));
}

export function encodeChangesRequested(items: ChangeItem[]): string {
  return REQUESTED_PREFIX + JSON.stringify({ items });
}

export function decodeChangesRequested(actorName: string | null | undefined): ChangeItem[] | null {
  if (!actorName) return null;
  if (actorName === LEGACY_MARKER) return [{ category: 'other', detail: '' }];
  if (!actorName.startsWith(REQUESTED_PREFIX)) return null;
  try {
    const data = JSON.parse(actorName.slice(REQUESTED_PREFIX.length));
    return Array.isArray(data.items) ? data.items : null;
  } catch { return null; }
}

export function encodeChangeAddressed(category: string, by: string): string {
  return ADDRESSED_PREFIX + JSON.stringify({ category, by });
}

export function decodeChangeAddressed(actorName: string | null | undefined): { category: string; by: string } | null {
  if (!actorName || !actorName.startsWith(ADDRESSED_PREFIX)) return null;
  try { return JSON.parse(actorName.slice(ADDRESSED_PREFIX.length)); } catch { return null; }
}

// Human-readable rendering for the Activity ledger — never leak the raw
// encoded marker string to an admin.
export function describeChangeEvent(actorName: string | null | undefined): string | null {
  const items = decodeChangesRequested(actorName);
  if (items) {
    if (items.length === 1 && items[0].category === 'other' && !items[0].detail) return 'Course requested changes to their page';
    const labels = items.map(it => CATEGORY_LABEL[it.category] || it.category).join(', ');
    return `Course requested changes: ${labels}`;
  }
  const addr = decodeChangeAddressed(actorName);
  if (addr) return `Change addressed: ${CATEGORY_LABEL[addr.category] || addr.category} (by ${addr.by})`;
  return null;
}

type Ev = { actorName: string | null; createdAt: string | Date };

// THE single anchor for "current round" — since the most recent "Preview
// sent" event. Sending a (new or updated) preview starts a fresh round;
// nothing before that point counts as current. Every function below scopes
// through this one helper so there is exactly one definition of "current
// round" in the codebase (RUN_QUEUE "approval propagates + gates previews",
// item 4.3 — "one brain, no parallel derivations").
export function scopeToCurrentRound<T extends Ev>(events: T[]): T[] {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let lastPreviewIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].actorName?.startsWith('Preview sent')) { lastPreviewIdx = i; break; }
  }
  return sorted.slice(lastPreviewIdx + 1);
}

// The OPEN (unaddressed) items for the CURRENT round.
export function computeOpenChanges(events: Ev[]): ChangeItem[] {
  const scoped = scopeToCurrentRound(events);
  const requestedByCategory = new Map<string, ChangeItem>();
  const addressed = new Set<string>();
  for (const ev of scoped) {
    const items = decodeChangesRequested(ev.actorName);
    if (items) for (const it of items) requestedByCategory.set(it.category, it);
    const addr = decodeChangeAddressed(ev.actorName);
    if (addr) addressed.add(addr.category);
  }
  return Array.from(requestedByCategory.values()).filter(it => !addressed.has(it.category));
}

// Most recent course/admin decision for the CURRENT round — approved, asked
// for changes (any encoding, including the pre-V13b free-text marker), or
// null (no decision yet, OR the loop was explicitly reopened via "Request
// re-review" since the last approval/changes-request). Always scopes to
// scopeToCurrentRound itself — callers must NOT pre-filter by build cycle
// or anything else; passing full event history is correct and required for
// every caller to agree.
export function latestPageDecision(events: Ev[]): 'approved' | 'changes_requested' | null {
  const scoped = scopeToCurrentRound(events);
  for (let i = scoped.length - 1; i >= 0; i--) {
    const an = scoped[i].actorName;
    if (an === APPROVED_MARKER) return 'approved';
    if (an === RE_REVIEW_REQUESTED_MARKER) return null;
    if (isChangesRequestedEvent(an)) return 'changes_requested';
  }
  return null;
}

// Timestamp of the OLDEST changes-requested event in the current round —
// used to age a still-open change request (e.g. for the action queue).
export function oldestOpenChangeRequestDate(events: Ev[]): Date | null {
  const scoped = scopeToCurrentRound(events);
  const firstRequest = scoped.find(ev => isChangesRequestedEvent(ev.actorName));
  return firstRequest ? new Date(firstRequest.createdAt) : null;
}

// Has this round had ANY changes requested at all (open or already fully
// addressed)? Used to decide whether "Send updated preview" should be the
// next action, vs. the normal "waiting on review" / "approved" messaging.
export function hasRequestedChangesThisRound(events: Ev[]): boolean {
  return scopeToCurrentRound(events).some(ev => isChangesRequestedEvent(ev.actorName));
}

// Is the "Send Preview" action currently locked behind an existing approval?
// Locked only while the CURRENT round's decision is 'approved' — a change
// request or an explicit re-review request already re-opens it (both are
// handled by latestPageDecision itself).
export function isSendPreviewGated(events: Ev[]): boolean {
  return latestPageDecision(events) === 'approved';
}

export function encodeRequestReReview(): string {
  return RE_REVIEW_REQUESTED_MARKER;
}

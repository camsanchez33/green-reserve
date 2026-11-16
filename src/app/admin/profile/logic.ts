// Settings → My profile (Cam approved the mockup 2026-11-15, lanes/admin.md "Approved, to build: Settings → My
// profile"). Pure helpers for the page and the four owner cards, so the dates read the same everywhere and can be tested.

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', support: 'Support', viewer: 'Viewer',
};

const valid = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Oct 28" this year, "Oct 28, 2025" another year; '' when the date is missing or unreadable. */
export function shortDay(iso: string | null | undefined, now: Date = new Date()): string {
  const d = valid(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** "today, 8:02 AM" · "Nov 13, 6:40 PM" (· "Nov 13, 2025, 6:40 PM" another year); '' when missing. */
export function dayAndTime(iso: string | null | undefined, now: Date = new Date()): string {
  const d = valid(iso);
  if (!d) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${sameDay(d, now) ? 'today' : shortDay(iso, now)}, ${time}`;
}

/** The "Changed" row of the Password card: "Oct 12, 2026", or null (row hidden) when the date isn't known. */
export function changedOn(iso: string | null | undefined): string | null {
  const d = valid(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}

/** A passkey's line under its name: "Added Oct 28 · last used today, 8:02 AM" / "· last used Nov 13" / "· never used"
 *  (the time only for today, as on the mockup). */
export function passkeyLine(createdAt: string, lastUsedAt: string | null, now: Date = new Date()): string {
  const d = lastUsedAt ? new Date(lastUsedAt) : null;
  const used = d && !Number.isNaN(d.getTime()) && sameDay(d, now) ? dayAndTime(lastUsedAt, now) : shortDay(lastUsedAt, now);
  return `Added ${shortDay(createdAt, now)} · ${used ? `last used ${used}` : 'never used'}`;
}

/** A device's line under its name: "Approved Oct 28 · last sign-in today, 8:02 AM" (no sign-in part when unknown). */
export function deviceLine(approvedAt: string, lastUsedAt: string | null, now: Date = new Date()): string {
  const last = dayAndTime(lastUsedAt, now);
  return `Approved ${shortDay(approvedAt, now)}${last ? ` · last sign-in ${last}` : ''}`;
}

/** Recovery codes: amber once two or fewer are left (the threshold the card has always used). */
export const codesLow = (left: number) => left <= 2;

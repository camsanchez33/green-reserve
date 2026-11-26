// Course events: the pure helpers the event pages also run in the browser (checklist defaults,
// the shotgun window, group labels). Client-safe: this file must never import prisma, Stripe or
// a secret (scripts/client-bundle-test.ts checks). lib/course-events re-exports every one.

/** The default prep checklist (Cam 2026-10-22), due N days before the event (negative = after). */
export const DEFAULT_TASKS: { label: string; daysBefore: number }[] = [
  { label: 'Confirm the headcount', daysBefore: 7 },
  { label: 'Order the food', daysBefore: 5 },
  { label: 'Make the pairings', daysBefore: 2 },
  { label: 'Cart signs, scorecards and rules sheet', daysBefore: 1 },
  { label: 'Send the final invoice', daysBefore: -1 },
];

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => { const c = Math.max(0, Math.min(23 * 60 + 59, m)); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`; };

/**
 * A shotgun holds every tee from an hour before the start (groups get to their
 * holes) to the end of the round: 4½ hours for 18, 2¼ for 9 (Cam 2026-10-22).
 */
export function shotgunWindow(start: string, holes: number): { from: string; to: string } {
  const s = toMin(start);
  return { from: toTime(s - 60), to: toTime(s + (holes <= 9 ? 135 : 270)) };
}

/** The default checklist item a guarantee answers. */
export const HEADCOUNT_TASK = 'Confirm the headcount';

/**
 * Revamp 3 fix 10 (Cam 2026-10-29): a shotgun with more groups than holes puts two
 * groups on a hole — they read 1A, 1B (by group number), never two "hole 1"s.
 * A hole with one group reads just its number.
 */
export function shotgunLabels(groups: { groupNo: number; startHole: number | null }[]): Map<number, string> {
  const byHole = new Map<number, number[]>();
  for (const g of groups) if (g.startHole != null) byHole.set(g.startHole, [...new Set([...(byHole.get(g.startHole) ?? []), g.groupNo])]);
  const out = new Map<number, string>();
  for (const [hole, gs] of byHole) {
    const sorted = [...gs].sort((a, b) => a - b);
    sorted.forEach((g, i) => out.set(g, sorted.length > 1 ? `${hole}${String.fromCharCode(65 + Math.min(i, 25))}` : String(hole)));
  }
  return out;
}

/**
 * Revamp 3 fix 10: a tee-times event's group N starts at the Nth time it holds — or
 * nowhere, when a booking in the window left it fewer times than groups. Never the
 * first time again, which may be a public booking's.
 */
export function groupStartTime(groupNo: number, heldTimes: string[]): string | null {
  return heldTimes[groupNo - 1] ?? null;
}

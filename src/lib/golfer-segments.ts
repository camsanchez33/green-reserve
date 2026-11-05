// SEG-1 (Cam 2026-11-05, golfer segments): every golfer a course knows, in one group each, as of a
// day — so the owner sees who is new, who are the regulars, who is slipping away and who has gone.
// Pure; Analytics (lib/analytics computeAnalytics) passes each golfer's played days (non-cancelled
// bookings, golfer-key identity) and who already has a round booked ahead.
//
// One group per golfer, first match wins:
//   New       — first round in the last 30 days.
//   Inactive  — last round more than 180 days ago, nothing booked ahead (before At risk: gone is gone).
//   At risk   — the "gone quiet" rule Analytics already uses: 3+ rounds, the last one more than twice
//               their usual gap ago and at least 14 days. Booked ahead → not at risk. Before Regular:
//               a weekly golfer quiet for a month still has rounds in the last 90 days.
//   Regular   — rounds on 3 or more days in the last 90 days.
//   Occasional — everyone else.
// The definitions live here and in lib/analytics-terms (one sentence each), nowhere else.

export type Segment = 'new' | 'regular' | 'at_risk' | 'inactive' | 'occasional';
export const SEGMENTS: Segment[] = ['regular', 'new', 'at_risk', 'inactive', 'occasional'];

export const NEW_DAYS = 30;
export const REGULAR_DAYS = 90;
export const REGULAR_ROUNDS = 3;
export const INACTIVE_DAYS = 180;

export type SegmentRow = { key: string; name: string; segment: Segment; rounds: number; recentRounds: number; firstPlayed: string; lastPlayed: string; daysSince: number; bookedAhead: boolean };

const day = (d: string) => Date.parse(`${d}T12:00:00Z`);
const between = (a: string, b: string) => Math.round((day(b) - day(a)) / 86_400_000);

/** Pure: one golfer's group from the days they played (any order, repeats allowed) as of `asOf`. */
export function segmentOf(dates: string[], asOf: string, bookedAhead: boolean): Omit<SegmentRow, 'key' | 'name'> | null {
  const ds = [...new Set(dates.filter(d => d <= asOf))].sort();
  if (!ds.length) return null;
  const first = ds[0], last = ds[ds.length - 1];
  const since = between(last, asOf);
  const recent = ds.filter(d => between(d, asOf) < REGULAR_DAYS).length;
  const base = { rounds: ds.length, recentRounds: recent, firstPlayed: first, lastPlayed: last, daysSince: since, bookedAhead };
  if (between(first, asOf) < NEW_DAYS) return { ...base, segment: 'new' };
  // Gone half a year is gone, whatever their pattern was.
  if (!bookedAhead && since > INACTIVE_DAYS) return { ...base, segment: 'inactive' };
  // A regular who stopped coming is at risk, not a regular — so this comes first.
  if (!bookedAhead && ds.length >= 3) {
    const usual = between(first, last) / (ds.length - 1);
    if (since >= 14 && since > 2 * usual) return { ...base, segment: 'at_risk' };
  }
  if (recent >= REGULAR_ROUNDS) return { ...base, segment: 'regular' };
  return { ...base, segment: 'occasional' };
}

/** Pure: every golfer's group, and the count in each. */
export function golferSegments(visits: Map<string, { name: string; dates: string[] }>, asOf: string, bookedAhead: Set<string>) {
  const rows: SegmentRow[] = [];
  for (const [key, v] of visits) {
    const s = segmentOf(v.dates, asOf, bookedAhead.has(key));
    if (s) rows.push({ key, name: v.name, ...s });
  }
  const counts = Object.fromEntries(SEGMENTS.map(s => [s, 0])) as Record<Segment, number>;
  for (const r of rows) counts[r.segment]++;
  rows.sort((a, b) => b.recentRounds - a.recentRounds || b.rounds - a.rounds || a.daysSince - b.daysSince);
  return { asOf, counts, rows };
}

/** The section's words on Analytics → Golfers (DENSE: kept out of the page). */
export const SEG_UI = {
  title: 'Golfer groups', empty: 'Nobody in this group.', more: 'more in the download',
  head: ['Golfer', 'Rounds', 'In 90 days', 'Last played'],
  csv: ['Golfer', 'Email', 'Phone', 'Rounds', 'Rounds in 90 days', 'First played', 'Last played'],
} as const;

/** The groups' names on the page. */
export const SEGMENT_LABEL: Record<Segment, string> = { regular: 'Regulars', new: 'New', at_risk: 'At risk', inactive: 'Inactive', occasional: 'Occasional' };

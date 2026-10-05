/**
 * Converts a stored tee-time (date "YYYY-MM-DD", time "HH:MM" in the course's
 * local timezone) to a UTC millisecond timestamp.
 *
 * Tee times are entered and stored in the course's local timezone (e.g. Eastern).
 * All server-side time comparisons must convert to UTC first. This function uses
 * Intl.DateTimeFormat to handle DST automatically — no hardcoded UTC offsets.
 *
 * Example: "10:56" at an Eastern course (UTC-4 in summer) → 14:56 UTC
 */
export function teeToUtcMs(date: string, time: string, tz: string): number {
  // The wall-clock reading, parsed as if it were UTC
  const wall = new Date(`${date}T${time}:00Z`).getTime();

  // Two passes (R-BOOK-001). The first offset is read at the naive instant,
  // which on a DST Sunday can sit on the other side of the 2am change (07:00Z
  // is still 00:00 PDT on Nov 1), giving an answer an hour off. Re-reading the
  // offset at the corrected instant settles it — same as startOfPlatformDay().
  const first = wall - tzOffsetMs(wall, tz);
  return wall - tzOffsetMs(first, tz);
}

/** Milliseconds `tz` is ahead of UTC at the instant `ms` (negative in the US). */
function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));

  const p: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;

  // Some Intl impls return '24' for midnight; normalize to '00'
  const h = p.hour === '24' ? '00' : p.hour;

  // The timezone's local reading, re-parsed as if it were UTC
  return new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`).getTime() - ms;
}

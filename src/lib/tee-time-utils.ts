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
  // Parse naively as UTC so we have a Date object to hand to Intl
  const naive = new Date(`${date}T${time}:00Z`);

  // Ask Intl what that UTC moment looks like in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(naive);

  const p: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;

  // Some Intl impls return '24' for midnight; normalize to '00'
  const h = p.hour === '24' ? '00' : p.hour;

  // Re-parse the timezone's local reading as if it were UTC
  const tzLocal = new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`);

  // The UTC offset = how far ahead naive (UTC) is from tzLocal (TZ's local reading)
  // Actual UTC for the given local time = naive + offset
  return naive.getTime() + (naive.getTime() - tzLocal.getTime());
}

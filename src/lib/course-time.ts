// SD-3 — course-local time. Tee times are stored as the course's local
// YYYY-MM-DD + HH:MM; "today" and "now" for a course must be read in the
// course's own timezone (Course.timezone), never the server's or the
// browser's. At 5pm Pacific the sheet used to flip to tomorrow because the
// server's UTC day had rolled over. Client-safe: Intl only, no Node APIs.

export const DEFAULT_TZ = 'America/New_York';

export const US_TIMEZONES: { id: string; label: string }[] = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona (no daylight saving)' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
];

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** YYYY-MM-DD of `now` in the course's timezone. */
export function todayIn(tz: string | null | undefined, now: Date = new Date()): string {
  const zone = tz && isValidTimezone(tz) ? tz : DEFAULT_TZ;
  return now.toLocaleDateString('en-CA', { timeZone: zone });
}

/** HH:MM (24h) of `now` in the course's timezone — comparable to TeeTime.time. */
export function clockIn(tz: string | null | undefined, now: Date = new Date()): string {
  const zone = tz && isValidTimezone(tz) ? tz : DEFAULT_TZ;
  return now.toLocaleTimeString('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).slice(0, 5);
}

/** YYYY-MM-DD plus n days, timezone-free (pure calendar arithmetic). */
export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** True when a course-local date + time is already behind the course's clock. */
export function isPastIn(tz: string | null | undefined, date: string, time: string, now: Date = new Date()): boolean {
  const today = todayIn(tz, now);
  return date < today || (date === today && time <= clockIn(tz, now));
}

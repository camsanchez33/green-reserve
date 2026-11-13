// SUPPORT (Cam 2026-11-12, via Build: "2 business days", reversing MSG-1's 48 hours): the reply promise on a
// course's support message. Business days are Monday–Friday on the platform clock (Eastern, lib/admin-day).
// Pure and client-safe.
//
//   A message sent on a weekday is due the same wall-clock time N business days later:
//     Mon 10:00 → Wed 10:00 · Thu 16:30 → Mon 16:30 · Fri 09:00 → Tue 09:00
//   A message sent on Saturday or Sunday starts the clock at Monday 00:00, so it is due Wednesday 00:00 (i.e. by
//   the end of Tuesday).
// Wall-clock time is kept across a DST change (a 23- or 25-hour day is still one day).
import { PLATFORM_TZ, dayKey, startOfPlatformDay, startOfPlatformDaysAgo } from './admin-day';

/** Milliseconds `tz` is ahead of UTC at instant `d` (negative in the US). */
function offsetMs(d: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? '0');
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - (d.getTime() - d.getUTCMilliseconds());
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD calendar day. */
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();
const isWeekend = (key: string) => { const w = weekday(key); return w === 0 || w === 6; };

/** `from` plus `n` business days, on the platform clock. */
export function addBusinessDays(from: Date, n: number, tz: string = PLATFORM_TZ): Date {
  let dayStart = startOfPlatformDay(from, tz);
  // The wall-clock time of day (10:00 is 10 hours, even on a 23- or 25-hour day).
  let into = from.getTime() - dayStart.getTime() + (offsetMs(from, tz) - offsetMs(dayStart, tz));
  // A weekend start: the clock starts at the next Monday's midnight.
  while (isWeekend(dayKey(dayStart, tz))) {
    dayStart = startOfPlatformDaysAgo(dayStart, -1, tz);
    into = 0;
  }
  let left = n;
  while (left > 0) {
    dayStart = startOfPlatformDaysAgo(dayStart, -1, tz);
    if (!isWeekend(dayKey(dayStart, tz))) left--;
  }
  // Same wall-clock time on the target day: correct for an offset change between its midnight and that time.
  const guess = new Date(dayStart.getTime() + into);
  return new Date(guess.getTime() - (offsetMs(guess, tz) - offsetMs(dayStart, tz)));
}

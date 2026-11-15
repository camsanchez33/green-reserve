// SUPPORT (Cam 2026-11-12, via Build: "2 business days", reversing MSG-1's 48 hours): the reply promise on a
// course's support message. Business days are Monday–Friday on the platform clock (Eastern, lib/admin-day), less
// US federal holidays (Cam 2026-11-15): their observed days are skipped like a weekend. Pure and client-safe.
//
//   A message sent on a weekday is due the same wall-clock time N business days later:
//     Mon 10:00 → Wed 10:00 · Thu 16:30 → Mon 16:30 · Fri 09:00 → Tue 09:00
//   A message sent on Saturday or Sunday starts the clock at Monday 00:00, so it is due Wednesday 00:00 (i.e. by
//   the end of Tuesday). A holiday counts as a weekend day: Wed 10:00 before Thanksgiving → Mon 10:00.
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

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** The day of the `nth` (1-based; -1 = last) `wd` weekday of month `m` (1-12). */
function nthWeekday(y: number, m: number, wd: number, nth: number): number {
  if (nth > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + (nth - 1) * 7; }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((last - wd + 7) % 7);
}
/** A fixed-date holiday's observed day: Saturday → the Friday before, Sunday → the Monday after (5 U.S.C. 6103). */
function observed(y: number, m: number, d: number): string {
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const t = new Date(Date.UTC(y, m - 1, d + (w === 6 ? -1 : w === 0 ? 1 : 0)));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
const holidayCache = new Map<number, Set<string>>();
/** The observed US federal holidays of year `y` (the eleven of 5 U.S.C. 6103), as YYYY-MM-DD keys. */
export function federalHolidays(y: number): Set<string> {
  let s = holidayCache.get(y);
  if (s) return s;
  s = new Set([
    observed(y, 1, 1), // New Year's Day
    keyOf(y, 1, nthWeekday(y, 1, 1, 3)), // Martin Luther King Jr. Day: 3rd Monday of January
    keyOf(y, 2, nthWeekday(y, 2, 1, 3)), // Washington's Birthday (Presidents Day): 3rd Monday of February
    keyOf(y, 5, nthWeekday(y, 5, 1, -1)), // Memorial Day: last Monday of May
    observed(y, 6, 19), // Juneteenth
    observed(y, 7, 4), // Independence Day
    keyOf(y, 9, nthWeekday(y, 9, 1, 1)), // Labor Day: 1st Monday of September
    keyOf(y, 10, nthWeekday(y, 10, 1, 2)), // Columbus Day: 2nd Monday of October
    observed(y, 11, 11), // Veterans Day
    keyOf(y, 11, nthWeekday(y, 11, 4, 4)), // Thanksgiving: 4th Thursday of November
    observed(y, 12, 25), // Christmas Day
  ]);
  // New Year's Day on a Saturday is observed on Friday Dec 31 of the year before.
  if (new Date(Date.UTC(y + 1, 0, 1)).getUTCDay() === 6) s.add(keyOf(y, 12, 31));
  holidayCache.set(y, s);
  return s;
}
/** Not a business day: a weekend or an observed federal holiday. */
export const isOffDay = (key: string) => isWeekend(key) || federalHolidays(Number(key.slice(0, 4))).has(key);

/** `from` plus `n` business days, on the platform clock. */
export function addBusinessDays(from: Date, n: number, tz: string = PLATFORM_TZ): Date {
  let dayStart = startOfPlatformDay(from, tz);
  // The wall-clock time of day (10:00 is 10 hours, even on a 23- or 25-hour day).
  let into = from.getTime() - dayStart.getTime() + (offsetMs(from, tz) - offsetMs(dayStart, tz));
  // A weekend or holiday start: the clock starts at the next business day's midnight.
  while (isOffDay(dayKey(dayStart, tz))) {
    dayStart = startOfPlatformDaysAgo(dayStart, -1, tz);
    into = 0;
  }
  let left = n;
  while (left > 0) {
    dayStart = startOfPlatformDaysAgo(dayStart, -1, tz);
    if (!isOffDay(dayKey(dayStart, tz))) left--;
  }
  // Same wall-clock time on the target day: correct for an offset change between its midnight and that time.
  const guess = new Date(dayStart.getTime() + into);
  return new Date(guess.getTime() - (offsetMs(guess, tz) - offsetMs(dayStart, tz)));
}

/**
 * Platform day boundaries.
 *
 * MP-1 (fix-now, ET day boundary): every "today" number on the admin Overview
 * was computed on UTC days — `new Date().toISOString().split('T')[0]` plus
 * `T00:00:00.000Z`. UTC midnight is 8pm ET (7pm during standard time), so the
 * entire Today band reset in the evening: bookings taken after 8pm ET counted
 * toward tomorrow, and "today's fees" went to zero while the pro shop was
 * still open.
 *
 * GreenReserve reports on ONE platform day, not per-course days. Courses each
 * carry their own `timezone` for tee-sheet purposes, but the Overview
 * aggregates across every course, so a single reporting timezone is the only
 * coherent choice — and the business runs on Eastern.
 *
 * Everything here is DST-aware via Intl, so there is no hardcoded -5/-4.
 */

export const PLATFORM_TZ = 'America/New_York';

/** YYYY-MM-DD for the instant `d`, as seen in `tz`. */
export function dayKey(d: Date, tz: string = PLATFORM_TZ): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key format the tee-time
  // tables already store dates in.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Hour 0–23 for the instant `d`, as seen in `tz`. Replaces getUTCHours(). */
export function platformHour(d: Date, tz: string = PLATFORM_TZ): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).format(d);
  // Intl can render midnight as "24" in some ICU versions.
  return Number(h) % 24;
}

/**
 * Milliseconds that `tz` is ahead of UTC at the instant `d`.
 * Positive east of Greenwich; ET is negative.
 */
function tzOffsetMs(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);

  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
  const asIfUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return asIfUtc - d.getTime();
}

/**
 * The UTC instant of midnight, in `tz`, on the day that contains `d`.
 *
 * Two passes: the first offset lookup uses a UTC-midnight guess, which can sit
 * on the wrong side of a DST transition; re-reading the offset at the corrected
 * instant settles it. Both US transitions happen at 2am local, so a midnight
 * boundary is never itself ambiguous.
 */
export function startOfPlatformDay(d: Date, tz: string = PLATFORM_TZ): Date {
  const [y, m, day] = dayKey(d, tz).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, day, 0, 0, 0, 0);
  const firstPass = new Date(guess - tzOffsetMs(new Date(guess), tz));
  return new Date(guess - tzOffsetMs(firstPass, tz));
}

/** Midnight (platform time) `n` days before the day containing `d`. */
export function startOfPlatformDaysAgo(d: Date, n: number, tz: string = PLATFORM_TZ): Date {
  const [y, m, day] = dayKey(d, tz).split('-').map(Number);
  // Step the calendar date, not the clock — 24h arithmetic drifts across DST.
  const stepped = new Date(Date.UTC(y, m - 1, day - n, 12, 0, 0));
  return startOfPlatformDay(stepped, tz);
}

/** Midnight (platform time) on the Monday of the week containing `d`. */
export function startOfPlatformWeek(d: Date, tz: string = PLATFORM_TZ): Date {
  const [y, m, day] = dayKey(d, tz).split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const dow = noon.getUTCDay();               // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return startOfPlatformDaysAgo(d, backToMonday, tz);
}

/** Midnight (platform time) on the 1st of the month containing `d`. */
export function startOfPlatformMonth(d: Date, tz: string = PLATFORM_TZ): Date {
  const [y, m] = dayKey(d, tz).split('-').map(Number);
  return startOfPlatformDay(new Date(Date.UTC(y, m - 1, 1, 12, 0, 0)), tz);
}

/** Midnight (platform time) on the 1st of the month `n` months before `d`. */
export function startOfPlatformMonthsAgo(d: Date, n: number, tz: string = PLATFORM_TZ): Date {
  const [y, m] = dayKey(d, tz).split('-').map(Number);
  return startOfPlatformDay(new Date(Date.UTC(y, m - 1 - n, 1, 12, 0, 0)), tz);
}

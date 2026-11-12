// HOME-3 (Cam 2026-11-12, "approved, build the home page to match the mockup", ADMIN_REDO_SPEC.md "Course
// dashboard Home: APPROVED"): the pure parts of the charcoal Home — today by hour (played · playing · booked ·
// open), the 4-week same-weekday average under the next 14 days, how a month's goal is going for today, the
// weather's one line, and what each course condition means for a golfer. Counted, never estimated. Client-safe.
import { ROUND_MINUTES } from './on-course';
import type { WeatherHour } from './weather';

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export type HourSlot = {
  time: string; holes?: number | null; spots: number;
  bookings: { status: string; players: number; checkedInPlayers?: number | null }[];
};
export type HourBar = { hour: number; spots: number; played: number; playing: number; booked: number; open: number };

/**
 * Today by hour, in players. A checked-in group (status completed) has PLAYED once its round's length
 * (ROUND_MINUTES, ONCOURSE-1 — the rule the tee sheet's "on the course" uses) has passed since its tee time,
 * and is PLAYING until then; every other live group is BOOKED; what's left of the spots is OPEN.
 * Only hours with spots or players are returned, earliest first.
 */
export function todayByHour(slots: HourSlot[], nowHM: string): HourBar[] {
  const now = mins(nowHM);
  const by = new Map<number, HourBar>();
  for (const s of slots) {
    const hour = Number(s.time.slice(0, 2));
    const bar = by.get(hour) ?? { hour, spots: 0, played: 0, playing: 0, booked: 0, open: 0 };
    const done = mins(s.time) + (s.holes === 9 ? ROUND_MINUTES[9] : ROUND_MINUTES[18]) <= now;
    for (const b of s.bookings) {
      if (b.status === 'completed') {
        const n = b.checkedInPlayers ?? b.players;
        if (done) bar.played += n; else bar.playing += n;
      } else if (b.status === 'confirmed') bar.booked += b.players;
    }
    bar.spots += s.spots;
    by.set(hour, bar);
  }
  return [...by.values()]
    .map(b => ({ ...b, open: Math.max(0, b.spots - b.played - b.playing - b.booked) }))
    .filter(b => b.spots > 0 || b.played + b.playing + b.booked > 0)
    .sort((a, b) => a.hour - b.hour);
}

/** Players checked in today of players booked (live groups). */
export function checkedInOf(slots: HourSlot[]): { checkedIn: number; booked: number } {
  let checkedIn = 0, booked = 0;
  for (const s of slots) for (const b of s.bookings) {
    if (b.status === 'completed') { const n = b.checkedInPlayers ?? b.players; checkedIn += n; booked += n; }
    else if (b.status === 'confirmed') booked += b.players;
  }
  return { checkedIn, booked };
}

const weekdayOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();

/**
 * Next 14 days' line (Cam 2026-11-12): what that weekday usually ends up with — the average of the players
 * booked on the last 4 of that weekday before today. `past` maps a date to its final players booked, or null
 * when the course had no tee times that day (left out of the average, not counted as zero). Null when none of
 * the 4 had tee times.
 */
export function sameWeekdayAverage(date: string, today: string, past: Map<string, number | null>): number | null {
  const want = weekdayOf(date);
  const vals: number[] = [];
  for (let k = 1; k <= 28; k++) {
    const d = new Date(Date.parse(today + 'T12:00:00Z') - k * 86400000).toISOString().slice(0, 10);
    if (weekdayOf(d) !== want) continue;
    const v = past.get(d);
    if (v != null) vals.push(v);
  }
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

export type GoalTone = 'ok' | 'warn' | 'bad';
/**
 * How a month's goal is going for today (Cam 2026-11-12): where it should be by now is the share of the month
 * gone (today counted); a rate (fill %) should be at its target all month. On or ahead = ok; within 10 points
 * of where it should be = warn; further behind = bad. Reached is always ok.
 */
export function goalTone(o: { actual: number; target: number; dayOfMonth: number; daysInMonth: number; rate: boolean }): GoalTone {
  if (o.target <= 0 || o.actual >= o.target) return 'ok';
  const have = (o.actual / o.target) * 100;
  const should = o.rate ? 100 : (Math.min(o.dayOfMonth, o.daysInMonth) / o.daysInMonth) * 100;
  if (have >= should) return 'ok';
  return have >= should - 10 ? 'warn' : 'bad';
}

/** Rain shows from 20% (stress test 2026-11-10: "1% rain" said nothing). */
export const RAIN_PCT = 20;
const hourWord = (iso: string) => {
  const h = Number(iso.slice(11, 13));
  return `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
};
/**
 * The weather card: "54° Clear", and the first hour of rain still to come today ("rain at 4 PM"), or "rain now".
 * `hours` are the forecast's, local to the course, now first; only hours on `today` count.
 */
export function weatherLine(hours: WeatherHour[], today: string): { now: string; rain: string | null } | null {
  const first = hours[0];
  if (!first) return null;
  const wet = hours.filter(h => h.at.slice(0, 10) === today).find(h => (h.rainPct ?? 0) >= RAIN_PCT);
  return {
    now: `${first.tempF}° ${first.summary.toLowerCase()}`.trim(),
    rain: !wet ? null : wet === first ? 'rain now' : `rain at ${hourWord(wet.at)}`,
  };
}

/** What a condition means for the golfer (the mockup's dot): normal, limited, or closed. */
export const CONDITION_TONE: Record<string, Record<string, GoalTone>> = {
  carts: { open: 'ok', path: 'warn', walking: 'warn', none: 'bad' },
  greens: { fast: 'ok', medium: 'ok', slow: 'ok', aerated: 'warn', temporary: 'warn' },
  pins: { front: 'ok', middle: 'ok', back: 'ok', mixed: 'ok' },
};

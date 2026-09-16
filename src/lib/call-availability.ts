// @brain when-cam-is-free
// CALL_SCHEDULING_SPEC SC-1 §3 — which 30-minute call slots are open.
//
// Broad "would I ever take a call then" windows. NOT a schedule — the real
// schedule is Cam's Google Calendar, and anything busy there is removed by the
// caller passing `busy` (from google-calendar.busyBlocks). Pure over injected
// busy blocks and calls, so it is unit-testable without touching Google.
// Local time, America/New_York.
import { easternToIso, easternParts } from './inquiry-call';

export type CallWindow = { day: number; from: string; to: string }; // day: 0 = Sun … 6 = Sat
export const CALL_WINDOWS: CallWindow[] = [
  { day: 1, from: '08:00', to: '20:00' }, // Mon
  { day: 2, from: '08:00', to: '20:00' },
  { day: 3, from: '08:00', to: '20:00' },
  { day: 4, from: '08:00', to: '20:00' },
  { day: 5, from: '08:00', to: '18:00' }, // Fri
  { day: 6, from: '09:00', to: '16:00' }, // Sat
];                                         // Sun: none
export const SLOT_MINUTES = 30;
export const LEAD_HOURS = 12;   // nothing bookable inside the next 12 hours
export const HORIZON_DAYS = 14; // how far out the page shows

export type BusyBlock = { start: Date; end: Date };
export type CallLikeForSlots = { scheduledAt: Date | string; durationMin?: number | null; outcome: string };
/** From the inquiry form (IF-1): needsJson.callPreference. Never removes a slot — only orders. */
export type CallPreference = { times?: string[]; days?: string[] } | null | undefined;

export type DaySlots = {
  /** Eastern calendar date, YYYY-MM-DD */
  date: string;
  /** every open slot start, in order */
  slots: Date[];
  /** the slots that match the preference (all of them when there is no preference) */
  preferred: Date[];
  /** the rest — shown under "Other times" */
  other: Date[];
};

const TZ = 'America/New_York';
const MS = 60_000;

function easternWeekday(d: Date): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
}
function easternHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
}
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && aEnd > bStart;

export function matchesPreference(slot: Date, pref: CallPreference): boolean {
  if (!pref) return true;
  const times = Array.isArray(pref.times) ? pref.times : [];
  const days = Array.isArray(pref.days) ? pref.days : [];
  if (!times.length && !days.length) return true;
  const h = easternHour(slot);
  const bucket = h < 12 ? 'Mornings' : h < 17 ? 'Afternoons' : 'Evenings';
  const wd = easternWeekday(slot);
  const dayBucket = wd === 0 || wd === 6 ? 'Weekends' : 'Weekdays';
  const timeOk = !times.length || times.includes(bucket);
  const dayOk = !days.length || days.includes(dayBucket);
  return timeOk && dayOk;
}

/**
 * Every 30-minute slot inside CALL_WINDOWS from now + LEAD_HOURS to
 * now + HORIZON_DAYS, minus anything overlapping a busy block (a 20-minute
 * event kills the whole slot) or a scheduled Call of either kind.
 */
export function openSlots(
  now: Date,
  busy: BusyBlock[],
  calls: CallLikeForSlots[],
  preference?: CallPreference,
  windows: CallWindow[] = CALL_WINDOWS,
): DaySlots[] {
  const earliest = new Date(now.getTime() + LEAD_HOURS * 60 * MS);
  const latest = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * MS);
  const booked: BusyBlock[] = calls
    .filter(c => c.outcome === 'scheduled')
    .map(c => { const s = new Date(c.scheduledAt); return { start: s, end: new Date(s.getTime() + (c.durationMin || SLOT_MINUTES) * MS) }; });
  const blocks = [...busy, ...booked];

  const out: DaySlots[] = [];
  // Step the Eastern CALENDAR date, not the epoch: adding 24h to an instant
  // skips or doubles a day across a DST change.
  const day0 = easternParts(now).date;
  for (let d = 0; d <= HORIZON_DAYS; d++) {
    const date = new Date(new Date(day0 + 'T00:00:00Z').getTime() + d * 24 * 60 * MS).toISOString().slice(0, 10);
    const noonIso = easternToIso(date, '12:00');
    if (!noonIso) continue;
    const wd = easternWeekday(new Date(noonIso));
    const slots: Date[] = [];
    for (const w of windows.filter(x => x.day === wd)) {
      const wStart = easternToIso(date, w.from);
      const wEnd = easternToIso(date, w.to);
      if (!wStart || !wEnd) continue;
      const endMs = new Date(wEnd).getTime();
      for (let t = new Date(wStart).getTime(); t + SLOT_MINUTES * MS <= endMs; t += SLOT_MINUTES * MS) {
        const start = new Date(t);
        const end = new Date(t + SLOT_MINUTES * MS);
        if (start < earliest || end > latest) continue;
        if (blocks.some(b => overlaps(start, end, b.start, b.end))) continue;
        slots.push(start);
      }
    }
    slots.sort((a, b) => a.getTime() - b.getTime());
    if (!slots.length) continue;
    const preferred = slots.filter(s => matchesPreference(s, preference));
    const other = slots.filter(s => !preferred.includes(s));
    out.push({ date, slots, preferred, other });
  }
  return out;
}

export function fmtSlot(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
export function fmtSlotDay(date: string): string {
  const iso = easternToIso(date, '12:00');
  return iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }) : date;
}

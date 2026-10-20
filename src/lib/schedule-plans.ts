// W2-4 (Cam 2026-10-19: "to make twilight time they have to make a separate
// schedule … there should be a way to separate it out in one schedule set up").
//
// A SCHEDULE, as a course sees it, is one set of hours for one round on some
// days — first tee, last tee, minutes apart — split into PRICE PERIODS
// (Morning, Twilight, the course's own names), each with its own prices.
// Stored, each period is still one TeeTimeSchedule row, so generation and
// charging are untouched. Rows group into a schedule when they share round,
// days, interval, holes and on/off, and run back to back (one ends where the
// next starts) — so a course's existing morning + twilight rows already read
// as one schedule, with nothing to migrate. The period that starts at a shared
// time owns that tee time (desiredSlots in lib/tee-sheet-engine.ts).
//
// Pure: no database. Used by the Schedule page (grouping) and the save path
// (validation).

export type PlanRow = {
  id: string; productId?: string | null; daysOfWeek: number[]; startTime: string; endTime: string;
  intervalMinutes: number; holes: number; active: boolean; tierName: string;
};

export type PlanGroup<T extends PlanRow> = {
  key: string;
  ids: string[];
  productId: string | null;
  daysOfWeek: number[];
  intervalMinutes: number;
  holes: number;
  active: boolean;
  startTime: string;   // the first period's start
  endTime: string;     // the last period's end — the last tee time
  periods: T[];        // in the order of the day
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const normDays = (d: number[]) => (d.length ? [...new Set(d)].sort((a, b) => a - b) : ALL_DAYS);

/** Rows → schedules. Every row lands in exactly one group. */
export function groupSchedules<T extends PlanRow>(rows: T[]): PlanGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = [r.productId ?? '', normDays(r.daysOfWeek).join(','), r.intervalMinutes, r.holes, r.active ? 1 : 0].join('|');
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r);
  }
  const groups: PlanGroup<T>[] = [];
  for (const [k, list] of buckets) {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
    let chain: T[] = [];
    const flush = () => {
      if (!chain.length) return;
      const f = chain[0];
      groups.push({
        key: `${k}|${f.id}`, ids: chain.map(r => r.id), productId: f.productId ?? null, daysOfWeek: normDays(f.daysOfWeek),
        intervalMinutes: f.intervalMinutes, holes: f.holes, active: f.active,
        startTime: f.startTime, endTime: chain[chain.length - 1].endTime, periods: chain,
      });
      chain = [];
    };
    for (const r of sorted) {
      if (chain.length && chain[chain.length - 1].endTime !== r.startTime) flush();
      chain.push(r);
    }
    flush();
  }
  return groups.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.key.localeCompare(b.key));
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const isTime = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/**
 * The first tee time on the schedule's grid at or after `from` — a period that
 * starts between two tee times starts with the next one, so the gap between
 * tee times never changes inside a schedule.
 */
export function snapToGrid(first: string, interval: number, from: string): string {
  const f = toMin(first), m = toMin(from);
  if (!(interval >= 1) || m <= f) return from;
  return toTime(f + Math.ceil((m - f) / interval) * interval);
}

/** Returns null when the periods are a valid split of the day, else the sentence to show. */
export function checkPeriods(periods: { tierName?: string; startTime: unknown; endTime: unknown }[], intervalMinutes: number): string | null {
  if (!(intervalMinutes >= 1)) return 'Set how many minutes apart tee times are.';
  if (!periods.length) return 'Add at least one price period.';
  for (const p of periods) {
    if (!isTime(p.startTime) || !isTime(p.endTime)) return 'Every price period needs a start and end time.';
    if (p.startTime >= p.endTime) {
      return periods.length === 1 ? 'The last tee time has to be after the first.' : `"${p.tierName || 'A price period'}" has to start before the next one, and before the last tee time.`;
    }
  }
  for (let i = 1; i < periods.length; i++) {
    if (periods[i - 1].endTime !== periods[i].startTime) return 'Price periods have to run back to back, each starting where the one before ends.';
  }
  return null;
}

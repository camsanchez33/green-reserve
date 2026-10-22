// W2-6 Schedule simplification (Cam 2026-10-21: "keep what it can do, make it
// more efficient and simple"). A course thinks in three things, not schedules:
//
//   1. When we're open — first tee, last tee (it goes off AT that time, W2-3),
//      minutes apart. One set of hours for the usual week; any days can have
//      their own hours AND their own prices (Cam 2026-10-22), or be closed.
//   2. What golfers can book — each round on or off, sold all day or between
//      two times (back nine in the morning, front nine at twilight).
//   3. What it costs — ONE price table: a row per round, a column per price
//      change ("All day", then "+ Add a price change" from a time). Each cell
//      has weekday / weekend, a cart price, and member / resident prices when
//      the course has them. Price-change names are automatic from the start
//      time (Morning / Midday / Afternoon / Twilight) and can be renamed.
//
// Stored, nothing changes: compilePlan() turns the plan into TeeTimeSchedule
// rows (one per day-set × round × price period, back to back), which
// tee-sheet-engine generates from exactly as before. readPlan() turns a
// course's rows back into a plan. Pure — no database; dollars on the wire.
import { checkSchedule, type ConflictProduct, type ConflictNine } from './schedule-conflict';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type PriceCell = {
  weekday: number; weekend: number; cart: number;
  memberWeekday: number | null; memberWeekend: number | null;
  residentWeekday: number | null; residentWeekend: number | null;
};

/** A round golfers can book. key = its CourseProduct id, '' for a course with no named rounds. */
export type RoundSale = { key: string; on: boolean; from: string | null; to: string | null };

export type DayPlan = {
  /** Empty on the usual week: it covers every day no other plan claims. */
  days: number[];
  closed: boolean;
  first: string; last: string; interval: number;
  /** Price changes after the first tee, in time order. The first column starts at the first tee. */
  changes: { at: string; name: string | null }[];
  /** First column's own name, or null for the automatic one. */
  firstName: string | null;
  /** prices[roundKey][column] — one column per price period (changes.length + 1). */
  prices: Record<string, PriceCell[]>;
};

export type CoursePlan = { rounds: RoundSale[]; usual: DayPlan; different: DayPlan[] };

export type PlanRound = { key: string; label: string; holes: number };

/** A row as compilePlan makes it — the shape PUT /api/operator/schedule writes (dollars). */
export type CompiledRow = {
  productId: string | null; daysOfWeek: number[]; startTime: string; endTime: string;
  intervalMinutes: number; holes: number; tierName: string; walkingAllowed: true; active: true;
  greenFeeWeekday: number; greenFeeWeekend: number; cartFee: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  residentRateWeekday: number | null; residentRateWeekend: number | null;
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const isTime = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** The automatic name of a price period from when it starts. */
export function autoName(at: string, only: boolean): string {
  if (only) return 'All day';
  const m = toMin(at);
  return m < 11 * 60 ? 'Morning' : m < 13 * 60 ? 'Midday' : m < 15 * 60 ? 'Afternoon' : 'Twilight';
}

/** Every column's name, automatic unless renamed. */
export function columnNames(d: DayPlan): string[] {
  const only = d.changes.length === 0;
  return [d.firstName?.trim() || autoName(d.first, only), ...d.changes.map(c => c.name?.trim() || autoName(c.at, false))];
}

/** The tee time on the day's grid at or after `t` (first tee + k × interval), so gaps never change mid-day. */
export function snap(d: Pick<DayPlan, 'first' | 'interval'>, t: string): string {
  const f = toMin(d.first), m = toMin(t);
  if (!(d.interval >= 1) || m <= f) return d.first;
  return toTime(f + Math.ceil((m - f) / d.interval) * d.interval);
}

/** The days a plan covers: an exception's own days; the usual week every day no exception claims. */
export function daysOf(plan: CoursePlan, d: DayPlan): number[] {
  if (d !== plan.usual) return [...new Set(d.days)].sort();
  const taken = new Set(plan.different.flatMap(x => x.days));
  return ALL_DAYS.filter(x => !taken.has(x));
}

export const emptyCell = (): PriceCell => ({ weekday: 0, weekend: 0, cart: 0, memberWeekday: null, memberWeekend: null, residentWeekday: null, residentWeekend: null });

/** Null when the plan can be saved, else the sentence to show. */
export function checkPlan(plan: CoursePlan, rounds: PlanRound[]): string | null {
  const seen = new Set<number>();
  for (const d of plan.different) {
    if (!d.days.length) return 'Pick the days that are different, or remove that set of days.';
    for (const x of d.days) {
      if (seen.has(x)) return 'A day can only be in one set of different days.';
      seen.add(x);
    }
  }
  const sold = plan.rounds.filter(r => r.on && rounds.some(x => x.key === r.key));
  if (!sold.length) return 'Turn on at least one round golfers can book.';
  for (const r of sold) {
    if ((r.from && !isTime(r.from)) || (r.to && !isTime(r.to))) return 'Give each round a time it’s sold from and until.';
    if (r.from && r.to && r.from >= r.to) return `${rounds.find(x => x.key === r.key)?.label ?? 'A round'} has to start being sold before it stops.`;
  }
  for (const d of [plan.usual, ...plan.different]) {
    if (d.closed) continue;
    if (!isTime(d.first) || !isTime(d.last)) return 'Every set of hours needs a first and last tee time.';
    if (d.first >= d.last) return 'The last tee time has to be after the first.';
    if (!(d.interval >= 1 && d.interval <= 60)) return 'Tee times have to be between 1 and 60 minutes apart.';
    let prev = d.first;
    for (const c of d.changes) {
      if (!isTime(c.at)) return 'Every price change needs a time.';
      if (c.at <= prev) return 'Each price change has to start after the one before it.';
      if (c.at > d.last) return 'A price change can’t start after the last tee time.';
      prev = c.at;
    }
    for (const r of sold) {
      const cells = d.prices[r.key];
      if (!cells || cells.length !== d.changes.length + 1) return 'Fill in a price for every round and price change.';
      if (cells.some(c => !(c.weekday >= 0) || !(c.weekend >= 0) || !(c.cart >= 0))) return 'Prices can’t be negative.';
    }
  }
  if (plan.usual.closed && daysOf(plan, plan.usual).length > 0 && plan.different.every(d => d.closed)) return 'Open at least one day.';
  return null;
}

/** The plan as the rows tee-sheet-engine generates from. Assumes checkPlan passed. */
export function compilePlan(plan: CoursePlan, rounds: PlanRound[]): CompiledRow[] {
  const rows: CompiledRow[] = [];
  for (const d of [plan.usual, ...plan.different]) {
    const days = daysOf(plan, d);
    if (d.closed || !days.length) continue;
    const names = columnNames(d);
    const starts = [d.first, ...d.changes.map(c => snap(d, c.at))];
    for (const r of plan.rounds) {
      const round = rounds.find(x => x.key === r.key);
      if (!r.on || !round) continue;
      const from = r.from ? snap(d, r.from) : d.first;
      const to = r.to && r.to < d.last ? r.to : d.last;
      for (let i = 0; i < starts.length; i++) {
        const s = starts[i] > from ? starts[i] : from;
        const e = (starts[i + 1] ?? d.last) < to ? starts[i + 1] ?? d.last : to;
        if (s > e || (s === e && starts[i + 1] !== undefined && e === starts[i + 1])) continue; // nothing of this period is sold
        const cell = d.prices[r.key]?.[i] ?? emptyCell();
        rows.push({
          productId: r.key || null, daysOfWeek: days, startTime: s, endTime: e, intervalMinutes: d.interval,
          holes: round.holes, tierName: names[i], walkingAllowed: true, active: true,
          greenFeeWeekday: cell.weekday, greenFeeWeekend: cell.weekend, cartFee: cell.cart,
          memberRateWeekday: cell.memberWeekday, memberRateWeekend: cell.memberWeekend,
          residentRateWeekday: cell.residentWeekday, residentRateWeekend: cell.residentWeekend,
        });
      }
    }
  }
  return rows;
}

type StoredRow = Omit<CompiledRow, 'walkingAllowed' | 'active'> & { active: boolean };

const cellOf = (r: StoredRow): PriceCell => ({
  weekday: r.greenFeeWeekday, weekend: r.greenFeeWeekend, cart: r.cartFee,
  memberWeekday: r.memberRateWeekday, memberWeekend: r.memberRateWeekend,
  residentWeekday: r.residentRateWeekday, residentWeekend: r.residentRateWeekend,
});

/** A blank plan: the usual week 7:00–5:00 every 8 minutes, every round on all day. */
export function blankPlan(rounds: PlanRound[]): CoursePlan {
  const usual: DayPlan = { days: [], closed: false, first: '07:00', last: '17:00', interval: 8, changes: [], firstName: null, prices: {} };
  for (const r of rounds) usual.prices[r.key] = [{ ...emptyCell(), weekday: r.holes <= 9 ? 30 : 55, weekend: r.holes <= 9 ? 35 : 65, cart: r.holes <= 9 ? 12 : 20 }];
  return { rounds: rounds.map(r => ({ key: r.key, on: true, from: null, to: null })), usual, different: [] };
}

/**
 * The course's stored rows read back as a plan (best effort: the page shows
 * what saving would change before anything is written). Rows are grouped by
 * their days; the set covering the most days is the usual week.
 */
export function readPlan(stored: StoredRow[], rounds: PlanRound[]): CoursePlan {
  const rows = stored.filter(r => r.active);
  if (!rows.length) return blankPlan(rounds);
  const keyOf = (r: StoredRow) => (r.productId ?? '');
  const byDays = new Map<string, StoredRow[]>();
  for (const r of rows) {
    const days = (r.daysOfWeek.length ? [...new Set(r.daysOfWeek)].sort() : ALL_DAYS).join(',');
    (byDays.get(days) ?? byDays.set(days, []).get(days)!).push(r);
  }
  // A day can sit in more than one stored set; the first set that claims it keeps it.
  const sets = [...byDays.entries()].sort((a, b) => b[0].split(',').length - a[0].split(',').length);
  const claimed = new Set<number>();
  const plans: DayPlan[] = [];
  const windows = new Map<string, { from: string; to: string }>();
  for (const [daysKey, list] of sets) {
    const days = daysKey.split(',').map(Number).filter(x => !claimed.has(x));
    if (!days.length) continue;
    days.forEach(x => claimed.add(x));
    const first = list.reduce((m, r) => r.startTime < m ? r.startTime : m, '23:59');
    const last = list.reduce((m, r) => r.endTime > m ? r.endTime : m, '00:00');
    const interval = list[0].intervalMinutes;
    // Price changes: every distinct start after the first tee where a row begins with a name.
    const starts = [...new Set(list.map(r => r.startTime))].sort();
    const roundStart = new Map<string, string>();
    for (const r of list) { const k = keyOf(r); if (!roundStart.has(k) || r.startTime < roundStart.get(k)!) roundStart.set(k, r.startTime); }
    const changeAts = starts.filter(s => s > first && [...list].some(r => r.startTime === s && roundStart.get(keyOf(r)) !== s));
    const cols = [first, ...changeAts];
    const colOf = (t: string) => { let i = 0; for (let j = 0; j < cols.length; j++) if (cols[j] <= t) i = j; return i; };
    const prices: Record<string, PriceCell[]> = {};
    const nameAt = new Map<number, string>();
    for (const r of list) {
      const k = keyOf(r);
      const i = colOf(r.startTime);
      prices[k] ??= cols.map(() => cellOf(r));
      for (let j = i; j < cols.length; j++) if (cols[j] < r.endTime || j === i) prices[k][j] = cellOf(r);
      if (r.tierName && r.tierName !== 'standard' && !nameAt.has(i)) nameAt.set(i, r.tierName);
      const kStart = list.filter(x => keyOf(x) === k).reduce((m, x) => x.startTime < m ? x.startTime : m, '23:59');
      const kEnd = list.filter(x => keyOf(x) === k).reduce((m, x) => x.endTime > m ? x.endTime : m, '00:00');
      if (!windows.has(k)) windows.set(k, { from: kStart, to: kEnd });
    }
    const d: DayPlan = { days, closed: false, first, last, interval, firstName: null, prices, changes: changeAts.map(at => ({ at, name: null })) };
    const auto = columnNames({ ...d, firstName: null, changes: d.changes.map(c => ({ ...c, name: null })) });
    d.firstName = nameAt.get(0) && nameAt.get(0) !== auto[0] ? nameAt.get(0)! : null;
    d.changes = d.changes.map((c, i) => ({ ...c, name: nameAt.get(i + 1) && nameAt.get(i + 1) !== auto[i + 1] ? nameAt.get(i + 1)! : null }));
    plans.push(d);
  }
  const [usualSrc, ...rest] = plans;
  const usual: DayPlan = { ...usualSrc, days: [] };
  // Days nobody's rows cover are closed.
  const open = new Set(plans.flatMap(p => p.days));
  const closedDays = ALL_DAYS.filter(x => !open.has(x));
  const different = [...rest];
  if (closedDays.length && usualSrc.days.length < 7) different.push({ ...usual, days: closedDays, closed: true, changes: [], prices: {} });
  // Rounds: on when they have rows; sold window from their first to last row on the usual week.
  const roundSales: RoundSale[] = rounds.map(r => {
    const w = windows.get(r.key);
    if (!w) return { key: r.key, on: false, from: null, to: null };
    return { key: r.key, on: true, from: w.from > usual.first ? w.from : null, to: w.to < usual.last ? w.to : null };
  });
  // Every sold round needs a cell in every column of every plan.
  for (const d of [usual, ...different]) {
    for (const r of roundSales) {
      if (!r.on) continue;
      const cells = d.prices[r.key] ?? [];
      d.prices[r.key] = Array.from({ length: d.changes.length + 1 }, (_, i) => cells[i] ?? cells[cells.length - 1] ?? emptyCell());
    }
  }
  return { rounds: roundSales, usual, different };
}

/**
 * What lib/schedule-conflict says about the rows a plan makes, each against
 * the others: the refusal (one tee time sold twice) or notes the course may
 * accept. The same rule the schedule save always used (W2-6 slice 2).
 */
export function checkRows(rows: CompiledRow[], products: ConflictProduct[], nines: ConflictNine[]): { refusal: string | null; warnings: string[] } {
  const all = rows.map((r, i) => ({ ...r, id: String(i) }));
  const warnings: string[] = [];
  for (const r of all) {
    const c = checkSchedule(r, all, products, nines);
    if (c.refusal) return { refusal: c.refusal, warnings: [] };
    for (const w of c.warnings) if (!warnings.includes(w)) warnings.push(w);
  }
  return { refusal: null, warnings };
}

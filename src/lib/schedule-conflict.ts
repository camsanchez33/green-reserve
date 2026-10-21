// COURSE_LAYOUT_SPEC L2 — checks for schedules that share ground.
//
// W2-6 (Cam 2026-10-20: overlaps WARN, never block; only an exact same start on
// the same first tee stays refused). Two ACTIVE schedules on shared days:
//   - REFUSED when both would send a group off the same first tee at the same
//     minute (same round, two unscoped schedules, or two rounds that start on
//     the same nine) — that is one tee time sold twice. A back-to-back hand-off
//     (one ends at the minute the other starts) is not a clash: the engine
//     gives that minute to the one starting (tee-sheet-engine handsOff).
//   - REFUSED when a whole-course schedule overlaps a round's (the whole course
//     covers every nine) — the pre-W2-6 rule, kept.
//   - WARNED otherwise: times off one tee closer than the interval, back-nine
//     starts while 18s make the turn ("leave a gap around 9:15"), and two 18s
//     reaching the same nine together. The owner decides; nothing is blocked.
// Pure, so it is tested without a database.

export type ConflictSchedule = {
  id?: string | null;
  productId?: string | null;
  daysOfWeek: number[];
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  intervalMinutes: number;
  active?: boolean;
};
export type ConflictProduct = { id: string; label: string; nineIds: string[]; holes?: number };
export type ConflictNine = { id: string; name: string };

/** How long nine holes take, for when 18-hole groups reach their second nine. */
export const TURN_MINUTES = 135;

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function clock(t: string | number): string {
  const m = typeof t === 'number' ? t : toMin(t);
  if (Number.isNaN(m)) return String(t);
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Empty daysOfWeek means "every day" (the engine treats it that way). */
function daysOf(s: ConflictSchedule): number[] {
  return s.daysOfWeek.length ? s.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
}
const dayText = (d: number[]) => d.length === 7 ? 'every day' : `on ${d.map(x => DAY[x]).join(', ')}`;

/** The first start minute both schedules make, skipping a back-to-back hand-off. Null when none. */
function sharedStart(a: ConflictSchedule, b: ConflictSchedule): number | null {
  const [as, ae, ai] = [toMin(a.startTime), toMin(a.endTime), Math.max(1, Number(a.intervalMinutes) || 1)];
  const [bs, be, bi] = [toMin(b.startTime), toMin(b.endTime), Math.max(1, Number(b.intervalMinutes) || 1)];
  for (let m = as; m <= ae; m += ai) {
    if (m < bs || m > be || (m - bs) % bi !== 0) continue;
    if ((m === ae && m === bs) || (m === be && m === as)) continue; // hand-off
    return m;
  }
  return null;
}

type Side = { s: ConflictSchedule; p: ConflictProduct | null; label: string; first: string | null; second: string | null };

function side(s: ConflictSchedule, products: ConflictProduct[]): Side {
  const p = s.productId ? products.find(x => x.id === s.productId) ?? null : null;
  const first = p?.nineIds[0] ?? null;
  // An 18 on two nines turns onto the second; twice around a nine turns onto itself.
  const second = p && (p.holes ?? 18) === 18 ? (p.nineIds[1] ?? p.nineIds[0] ?? null) : null;
  return { s, p, label: p ? `"${p.label}"` : 'your tee times', first, second };
}

type Check = { refusal: string | null; warnings: string[] };

function checkPair(c: Side, o: Side, nineName: (id: string) => string): Check {
  const none: Check = { refusal: null, warnings: [] };
  const shared = daysOf(o.s).filter(d => daysOf(c.s).includes(d));
  if (!shared.length) return none;
  const [cs, ce, os, oe] = [toMin(c.s.startTime), toMin(c.s.endTime), toMin(o.s.startTime), toMin(o.s.endTime)];
  const overlaps = cs < oe && os < ce;
  const days = dayText(shared);

  // Whole course against a round: the whole course covers every nine.
  if (!!c.p !== !!o.p) {
    if (!overlaps) return none;
    const scoped = (c.p ?? o.p)!;
    return { refusal: `A whole-course schedule overlaps "${scoped.label}" ${days} (${clock(o.s.startTime)} – ${clock(o.s.endTime)}). On a course with bookable rounds every schedule must belong to one round.`, warnings: [] };
  }

  const warnings: string[] = [];
  const sameTee = (!c.p && !o.p) || (!!c.first && c.first === o.first);
  if (sameTee && overlaps) {
    const tee = c.first ? `the ${nineName(c.first)} tee` : 'the first tee';
    const clash = sharedStart(c.s, o.s);
    if (clash !== null) {
      const who = c.p && o.p && c.p.id !== o.p.id ? `${c.label} and ${o.label} both send` : `Another schedule for ${c.label} already sends`;
      return { refusal: `${who} a group off ${tee} at ${clock(clash)} ${days} — that's one tee time sold twice. Change the first tee time or the minutes apart so they don't land on the same minute.`, warnings: [] };
    }
    const from = Math.max(cs, os), to = Math.min(ce, oe);
    warnings.push(`${c.label} and ${c.p && o.p && c.p.id === o.p.id ? 'another of its schedules' : o.label} both start groups off ${tee} between ${clock(from)} and ${clock(to)} ${days}, so some times sit closer together than usual.`);
  }

  // A round whose groups make the turn onto the nine the other starts on.
  const turn = (a: Side, b: Side) => {
    if (!a.second || !b.first || a.second !== b.first || (a.p && b.p && a.p.id === b.p.id)) return;
    const [as, ae, bs, be] = [toMin(a.s.startTime), toMin(a.s.endTime), toMin(b.s.startTime), toMin(b.s.endTime)];
    const from = Math.max(as + TURN_MINUTES, bs), to = Math.min(ae + TURN_MINUTES, be);
    if (from > to) return;
    warnings.push(`Groups playing ${a.label} reach ${nineName(a.second)} about 2¼ hours after they tee off, so from about ${clock(as + TURN_MINUTES)}. ${b.label} times between ${clock(from)} and ${clock(to)} ${days} can meet them there — leave a gap around ${clock(from)}, or end ${b.label} by then.`);
  };
  turn(c, o); turn(o, c);

  // Two 18s on different first nines that turn onto the same nine together.
  if (c.second && o.second && c.second === o.second && c.first !== o.first && overlaps) {
    warnings.push(`${c.label} and ${o.label} both turn onto ${nineName(c.second)}, and their tee times overlap ${days} (${clock(Math.max(cs, os))} – ${clock(Math.min(ce, oe))}). Their groups reach it at the same time — stagger the tee times.`);
  }
  return { refusal: null, warnings };
}

/**
 * Everything worth saying about saving `candidate` next to the course's other
 * schedules (its own id is skipped): a refusal, or warnings the owner may accept.
 */
export function checkSchedule(candidate: ConflictSchedule, others: ConflictSchedule[], products: ConflictProduct[], nines: ConflictNine[]): Check {
  if (candidate.active === false) return { refusal: null, warnings: [] };
  const nineName = (id: string) => nines.find(n => n.id === id)?.name || 'a nine';
  const c = side(candidate, products);
  const warnings: string[] = [];
  for (const o of others) {
    if (candidate.id && o.id === candidate.id) continue;
    if (o.active === false) continue;
    const r = checkPair(c, side(o, products), nineName);
    if (r.refusal) return { refusal: r.refusal, warnings: [] };
    for (const w of r.warnings) if (!warnings.includes(w)) warnings.push(w);
  }
  return { refusal: null, warnings };
}

/** Null when the candidate can be saved, else the sentence to show. Warnings never refuse. */
export function findScheduleConflict(candidate: ConflictSchedule, others: ConflictSchedule[], products: ConflictProduct[], nines: ConflictNine[]): string | null {
  return checkSchedule(candidate, others, products, nines).refusal;
}

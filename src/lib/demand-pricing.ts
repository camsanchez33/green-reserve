// PRICE-5 (Cam 2026-10-30: "should be based on their analytics so if some hours are slow or
// if some days etc … should adjust and not be stagnant"; direction "up to course … either";
// "Course picks per course" suggest or automatic; "Course sets floor & ceiling"; with a
// last-minute deal "golfer gets the lower one"; "Online public rate only"):
//
//  • Each weekday × hour gets a percent on the course's public rate (DemandPrice.pct), + up or − down.
//  • Weekly, refreshDemand looks at the last 8 weeks of the course's own tee times: an hour that
//    fills more than the course does overall is suggested up, one that fills less down —
//    suggestPcts below, by at most 10 points a week so prices drift instead of jumping, and
//    always inside the course's floor and ceiling.
//  • 'suggest': the course applies the suggestions on the Schedule page. 'auto': they apply
//    themselves. 'off': no demand price anywhere, whatever the rows say.
//  • Online public seats only: onlinePublicSeat takes the lower of the demand price and the
//    last-minute deal price (the two never stack). A member, resident or round-pack seat keeps
//    its own rate — only capped at the public price, so a member never pays more than anyone.
//    Counter bookings are never demand priced.
//  • The percent applied is kept on the booking (demandPct); the per-seat rates on the booking
//    carry it through party changes and partial check-ins, like a deal.
import { prisma } from './prisma';
import { dealSeat } from './last-minute';
import { todayIn, addDaysStr } from './course-time';

export type DemandMode = 'off' | 'suggest' | 'auto';
export type DemandCourse = { id?: string; demandMode: string; demandFloorPct: number; demandCeilingPct: number };
/** `${dow}-${hour}` → the applied percent. Null when the course has demand pricing off. */
export type DemandMap = Map<string, number> | null;

export const WEEKS_LOOKED_AT = 8;
export const MAX_WEEKLY_STEP = 10;
const MIN_DAYS_OF_DATA = 28;
const MIN_DATES_IN_HOUR = 4;

export const readDemandMode = (v: unknown): DemandMode | null => (v === 'off' || v === 'suggest' || v === 'auto' ? v : null);
export const dowOfDate = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const key = (dow: number, hour: number) => `${dow}-${hour}`;

/** Pure: the percent a tee time gets, inside the course's floor and ceiling (0 when off). */
export function demandPctAt(c: DemandCourse | null | undefined, map: DemandMap, slot: { date: string; time: string }): number {
  if (!c || c.demandMode === 'off' || !map) return 0;
  const raw = map.get(key(dowOfDate(slot.date), Number(slot.time.slice(0, 2)))) ?? 0;
  return Math.max(c.demandFloorPct - 100, Math.min(c.demandCeilingPct - 100, raw));
}

/** Pure: a seat at the demand price. */
export const demandSeat = (pct: number, cents: number) => (pct ? cents + Math.round((cents * pct) / 100) : cents);

/** Pure: an online public seat — the demand price, or the last-minute deal price when there is one and it is lower. */
export const onlinePublicSeat = (cents: number, dealPct: number, demandPct: number) =>
  dealPct > 0 ? Math.min(dealSeat(dealPct, cents), demandSeat(demandPct, cents)) : demandSeat(demandPct, cents);

/** Pure: whether the deal is what set the price (the page then shows it struck through as a deal). */
export const dealWins = (cents: number, dealPct: number, demandPct: number) =>
  dealPct > 0 && dealSeat(dealPct, cents) <= demandSeat(demandPct, cents);

/** The course's applied percents (null when off) — one read for a whole day of tee times. */
export async function loadDemand(c: DemandCourse & { id: string }): Promise<DemandMap> {
  if (c.demandMode === 'off') return null;
  const rows = await prisma.demandPrice.findMany({ where: { courseId: c.id, pct: { not: 0 } }, select: { dow: true, hour: true, pct: true } });
  return new Map(rows.map(r => [key(r.dow, r.hour), r.pct]));
}

/** One tee time's percent, read fresh (a booking, a move). */
export async function demandPctFor(c: DemandCourse & { id: string }, slot: { date: string; time: string }): Promise<number> {
  if (c.demandMode === 'off') return 0;
  return demandPctAt(c, await loadDemand(c), slot);
}

export type Cell = { dow: number; hour: number; sale: number; booked: number; dates: number };

/**
 * Pure: the week's suggestion for each hour. An hour filling above the course's overall fill
 * goes up, below goes down — a quarter of the relative gap, in 5-point steps — moving at most
 * MAX_WEEKLY_STEP from where it is, inside the floor and ceiling. An hour with too little
 * history stays where it is. Null when the course has too little history overall.
 */
export function suggestPcts(cells: Cell[], current: Map<string, number>, floorPct: number, ceilingPct: number, daysOfData: number) {
  const sale = cells.reduce((s, c) => s + c.sale, 0), booked = cells.reduce((s, c) => s + c.booked, 0);
  if (daysOfData < MIN_DAYS_OF_DATA || sale <= 0) return null;
  const overall = booked / sale;
  const lo = floorPct - 100, hi = ceilingPct - 100;
  const clamp = (n: number) => Math.max(lo, Math.min(hi, n));
  return {
    courseFillPct: Math.round(overall * 100),
    rows: cells.map(c => {
      const now = current.get(key(c.dow, c.hour)) ?? 0;
      const fill = c.sale > 0 ? c.booked / c.sale : 0;
      if (c.dates < MIN_DATES_IN_HOUR || c.sale <= 0) return { dow: c.dow, hour: c.hour, fillPct: Math.round(fill * 100), suggestedPct: clamp(now) };
      const target = clamp(Math.round(((fill - overall) / Math.max(overall, 0.1)) * 25 / 5) * 5);
      const step = Math.max(-MAX_WEEKLY_STEP, Math.min(MAX_WEEKLY_STEP, target - now));
      return { dow: c.dow, hour: c.hour, fillPct: Math.round(fill * 100), suggestedPct: clamp(now + step) };
    }),
  };
}

/** Validate the course's settings (the Schedule page). */
export function demandSettingsError(b: { demandFloorPct?: unknown; demandCeilingPct?: unknown }, now: { demandFloorPct: number; demandCeilingPct: number }): string | null {
  const floor = b.demandFloorPct === undefined ? now.demandFloorPct : Number(b.demandFloorPct);
  const ceil = b.demandCeilingPct === undefined ? now.demandCeilingPct : Number(b.demandCeilingPct);
  if (!Number.isInteger(floor) || floor < 50 || floor > 100) return 'The lowest price is 50% to 100% of your rate.';
  if (!Number.isInteger(ceil) || ceil < 100 || ceil > 200) return 'The highest price is 100% to 200% of your rate.';
  return null;
}

/**
 * Weekly: work out this course's suggestions from its last 8 weeks and store them; with
 * 'auto' they become the applied percents. Returns what it did, for the cron log.
 */
export async function refreshDemand(courseId: string, now = new Date()): Promise<'off' | 'too_little_history' | 'suggested' | 'applied'> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { demandMode: true, demandFloorPct: true, demandCeilingPct: true, timezone: true } });
  if (!c || c.demandMode === 'off') return 'off';
  const today = todayIn(c.timezone, now);
  const from = addDaysStr(today, -7 * WEEKS_LOOKED_AT);
  const times = await prisma.teeTime.findMany({
    where: { courseId, date: { gte: from, lt: today }, status: { not: 'blocked' } },
    select: { date: true, time: true, playersAvailable: true, playersBooked: true },
  });
  const cells = new Map<string, Cell & { dateSet: Set<string> }>();
  const allDates = new Set<string>();
  for (const t of times) {
    const dow = dowOfDate(t.date), hour = Number(t.time.slice(0, 2));
    const k = key(dow, hour);
    const cell = cells.get(k) ?? { dow, hour, sale: 0, booked: 0, dates: 0, dateSet: new Set<string>() };
    cell.sale += t.playersAvailable; cell.booked += Math.min(t.playersBooked, t.playersAvailable); cell.dateSet.add(t.date);
    cells.set(k, cell); allDates.add(t.date);
  }
  const list = [...cells.values()].map(c2 => ({ ...c2, dates: c2.dateSet.size }));
  const existing = await prisma.demandPrice.findMany({ where: { courseId }, select: { dow: true, hour: true, pct: true } });
  const current = new Map(existing.map(r => [key(r.dow, r.hour), r.pct]));
  const s = suggestPcts(list, current, c.demandFloorPct, c.demandCeilingPct, allDates.size);
  if (!s) { await prisma.course.update({ where: { id: courseId }, data: { demandSuggestedAt: now } }); return 'too_little_history'; }
  const auto = c.demandMode === 'auto';
  await prisma.$transaction([
    ...s.rows.map(r => prisma.demandPrice.upsert({
      where: { courseId_dow_hour: { courseId, dow: r.dow, hour: r.hour } },
      create: { courseId, dow: r.dow, hour: r.hour, suggestedPct: r.suggestedPct, pct: auto ? r.suggestedPct : 0, fillPct: r.fillPct, courseFillPct: s.courseFillPct },
      update: { suggestedPct: r.suggestedPct, fillPct: r.fillPct, courseFillPct: s.courseFillPct, ...(auto ? { pct: r.suggestedPct } : {}) },
    })),
    prisma.course.update({ where: { id: courseId }, data: { demandSuggestedAt: now } }),
  ]);
  return auto ? 'applied' : 'suggested';
}

/** The courses whose weekly suggestions are due (never, or 7 days since). */
export async function demandDue(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  return prisma.course.findMany({
    where: { demandMode: { in: ['suggest', 'auto'] }, archivedAt: null, OR: [{ demandSuggestedAt: null }, { demandSuggestedAt: { lt: weekAgo } }] },
    select: { id: true },
  });
}

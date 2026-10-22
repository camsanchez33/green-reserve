// W2-9 Events (Cam 2026-10-21: "help walk through a course working how to
// input an outing or tournament, help with organization and preparation";
// decisions 2026-10-22: the tab is Events; owner + staff with "Run events";
// a default prep checklist; a shotgun holds tee times by round length).
//
// An event HOLDS its tee times: every open tee time in its window is blocked
// with TeeTime.eventId set, so golfers can't book them and the tee sheet can
// name the event. Times generated later (the event is weeks out) are created
// already held (lib/tee-sheet-engine generateTeeTimes reads heldBy()).
// Cancelling or moving the event releases only the times it holds — a time the
// staff blocked by hand is never touched, and a booked time is never held
// (the course is told which ones to move).
//
// Slice (a): setup, hold, contact and price, checklist, players and pairings.
// Payments are slice (b) onward.
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { desiredSlots, generateTeeTimes } from './tee-sheet-engine';
import { heldBy, type HoldEvent } from './event-hold';
export { heldBy };

export const EVENT_KINDS = ['outing', 'tournament', 'league', 'other'] as const;
export type EventKind = typeof EVENT_KINDS[number];
export const KIND_LABEL: Record<EventKind, string> = { outing: 'Outing', tournament: 'Tournament', league: 'League night', other: 'Other' };

/** The default prep checklist (Cam 2026-10-22), due N days before the event (negative = after). */
export const DEFAULT_TASKS: { label: string; daysBefore: number }[] = [
  { label: 'Confirm the headcount', daysBefore: 7 },
  { label: 'Order the food', daysBefore: 5 },
  { label: 'Make the pairings', daysBefore: 2 },
  { label: 'Cart signs, scorecards and rules sheet', daysBefore: 1 },
  { label: 'Send the final invoice', daysBefore: -1 },
];

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => { const c = Math.max(0, Math.min(23 * 60 + 59, m)); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`; };
export const isTime = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));

/**
 * A shotgun holds every tee from an hour before the start (groups get to their
 * holes) to the end of the round: 4½ hours for 18, 2¼ for 9 (Cam 2026-10-22).
 */
export function shotgunWindow(start: string, holes: number): { from: string; to: string } {
  const s = toMin(start);
  return { from: toTime(s - 60), to: toTime(s + (holes <= 9 ? 135 : 270)) };
}

/** The due date of a default task. */
export const dueFor = (date: string, daysBefore: number) => addDaysStr(date, -daysBefore);

/**
 * Tee times: the event takes `groups` consecutive tee times from its first one,
 * on the round it is for (or every round). Read from what the schedule makes
 * that day, so it works before the day's tee times exist.
 */
export async function teeTimesWindow(courseId: string, date: string, start: string, groups: number, productId: string | null): Promise<{ from: string; to: string; found: number }> {
  const [schedules, products] = await Promise.all([
    prisma.teeTimeSchedule.findMany({ where: { courseId, active: true } }),
    prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, holes: true, active: true, nineIds: true } }),
  ]);
  const times = [...new Set([...desiredSlots(date, schedules, products).values()]
    .filter(s => !productId || s.productId === productId).map(s => s.time).filter(t => t >= start))].sort();
  const n = Math.max(1, groups);
  const taken = times.slice(0, n);
  return { from: start, to: taken[taken.length - 1] ?? start, found: taken.length };
}

export type HoldReport = { held: number; booked: { time: string; golfers: string }[] };

/**
 * Hold the event's window: block every OPEN tee time in it (no players, no
 * bookings, not already blocked) and mark it as the event's. Booked times are
 * left alone and reported so the course can move those groups.
 */
export async function applyHold(event: HoldEvent & { courseId: string; date: string }): Promise<HoldReport> {
  if (event.status !== 'planned') return { held: 0, booked: [] };
  const slots = await prisma.teeTime.findMany({
    where: { courseId: event.courseId, date: event.date, time: { gte: event.holdFrom, lte: event.holdTo } },
    select: { id: true, time: true, productId: true, status: true, playersBooked: true, eventId: true,
      bookings: { where: { status: { not: 'cancelled' } }, select: { golferName: true } } },
  });
  const inScope = slots.filter(s => heldBy([event], s.productId ?? null, s.time));
  const open = inScope.filter(s => s.playersBooked === 0 && s.bookings.length === 0 && s.status !== 'blocked');
  let held = 0;
  if (open.length) {
    // Conditional on still being open, so a booking that lands meanwhile is never blocked over.
    const r = await prisma.teeTime.updateMany({ where: { id: { in: open.map(s => s.id) }, playersBooked: 0, status: { not: 'blocked' } }, data: { status: 'blocked', eventId: event.id } });
    held = r.count;
  }
  const booked = inScope.filter(s => s.playersBooked > 0 || s.bookings.length > 0)
    .map(s => ({ time: s.time, golfers: s.bookings.map(b => b.golferName).join(', ') || 'booked' }));
  return { held, booked };
}

/**
 * Open times inside a planned event's window that it doesn't hold — a group
 * moved or cancelled out of the window leaves its time on sale (and a time
 * staff reopened by hand) until the course holds it again.
 */
export async function unheldTimes(event: HoldEvent & { courseId: string; date: string }): Promise<string[]> {
  if (event.status !== 'planned') return [];
  const slots = await prisma.teeTime.findMany({
    where: { courseId: event.courseId, date: event.date, time: { gte: event.holdFrom, lte: event.holdTo }, status: { not: 'blocked' }, playersBooked: 0 },
    select: { time: true, productId: true, bookings: { where: { status: { not: 'cancelled' } }, select: { id: true } } },
    orderBy: { time: 'asc' },
  });
  return slots.filter(s => s.bookings.length === 0 && heldBy([event], s.productId ?? null, s.time)).map(s => s.time);
}

/** Release every tee time the event holds (never one a person blocked by hand). */
export async function releaseHold(eventId: string, day: { courseId: string; date: string }): Promise<number> {
  // `day` is the day being released — the event's date BEFORE a move. A held
  // time on a day the course has since closed stays blocked; it only leaves the event.
  const closed = !!(await prisma.blackout.findFirst({ where: { courseId: day.courseId, date: day.date }, select: { id: true } }));
  const r = closed ? { count: 0 } : await prisma.teeTime.updateMany({ where: { eventId, status: 'blocked', playersBooked: 0 }, data: { status: 'available', eventId: null } });
  // A held time that somehow carries players keeps its block but loses the link.
  await prisma.teeTime.updateMany({ where: { eventId }, data: { eventId: null } });
  return r.count;
}

export type EventInput = {
  name?: unknown; kind?: unknown; date?: unknown; format?: unknown; startTime?: unknown; holes?: unknown;
  groups?: unknown; players?: unknown; productId?: unknown; holdTo?: unknown;
  organizerName?: unknown; organizerEmail?: unknown; organizerPhone?: unknown;
  pricePerPlayer?: unknown; includes?: unknown; terms?: unknown; notes?: unknown;
};

export class EventError extends Error {}

const str = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

/** Validate and normalise an event's fields, and work out its hold window. Throws EventError. */
export async function eventFields(courseId: string, input: EventInput, opts: { allowPast?: boolean } = {}) {
  const name = str(input.name, 120);
  if (!name) throw new EventError('Give the event a name.');
  const kind = (EVENT_KINDS as readonly string[]).includes(String(input.kind)) ? String(input.kind) as EventKind : 'outing';
  if (!isDate(input.date)) throw new EventError('Pick the date.');
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, holes: true } });
  if (!opts.allowPast && input.date < todayIn(course?.timezone)) throw new EventError('That date has already gone.');
  const format = input.format === 'tee_times' ? 'tee_times' : 'shotgun';
  if (!isTime(input.startTime)) throw new EventError(format === 'shotgun' ? 'Pick the shotgun start time.' : 'Pick the first tee time.');
  const holes = input.holes === 9 || input.holes === '9' ? 9 : 18;
  const groups = int(input.groups ?? 0, 0, 200);
  const players = int(input.players ?? 0, 0, 1000);
  if (groups === null) throw new EventError('Groups has to be a whole number up to 200.');
  if (players === null) throw new EventError('Players has to be a whole number up to 1,000.');
  let productId: string | null = null;
  if (format === 'tee_times' && input.productId) {
    const p = await prisma.courseProduct.findFirst({ where: { id: String(input.productId), courseId }, select: { id: true } });
    if (!p) throw new EventError('That round isn’t on this course.');
    productId = p.id;
  }
  let window: { from: string; to: string };
  let found: number | null = null;
  if (format === 'shotgun') window = shotgunWindow(input.startTime, holes);
  else {
    if (!groups) throw new EventError('How many groups go off? It sets how many tee times are held.');
    const w = await teeTimesWindow(courseId, input.date, input.startTime, groups, productId);
    window = { from: w.from, to: w.to }; found = w.found;
  }
  // The course may end the hold at a time of its own.
  if (input.holdTo != null && input.holdTo !== '') {
    if (!isTime(input.holdTo) || input.holdTo < window.from) throw new EventError('The hold has to end after it starts.');
    window.to = input.holdTo;
  }
  const holdToCustom = input.holdTo != null && input.holdTo !== '';
  const email = str(input.organizerEmail, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new EventError('The organizer’s email doesn’t look right.');
  const price = input.pricePerPlayer == null || input.pricePerPlayer === '' ? 0 : Number(input.pricePerPlayer);
  if (!(price >= 0 && price <= 100000)) throw new EventError('The price per player can’t be negative.');
  const includes = Array.isArray(input.includes) ? input.includes.map(x => str(x, 60)).filter(Boolean).slice(0, 20) : [];
  return {
    data: {
      name, kind, date: input.date, format, startTime: input.startTime, holdFrom: window.from, holdTo: window.to, holdToCustom,
      productId, holes, groups, players,
      organizerName: str(input.organizerName, 120), organizerEmail: email, organizerPhone: str(input.organizerPhone, 40),
      pricePerPlayerCents: Math.round(price * 100), includes,
      terms: String(input.terms ?? '').trim().slice(0, 4000), notes: String(input.notes ?? '').trim().slice(0, 4000),
    },
    teeTimesFound: found,
  };
}

/**
 * What saving would hold, without saving: the window, how many tee times the
 * schedule makes in it, and the booked ones the course would have to move.
 */
export async function previewEvent(courseId: string, input: EventInput, excludeEventId?: string) {
  const { data, teeTimesFound } = await eventFields(courseId, input, { allowPast: !!excludeEventId });
  const [schedules, products, slots] = await Promise.all([
    prisma.teeTimeSchedule.findMany({ where: { courseId, active: true } }),
    prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, holes: true, active: true, nineIds: true } }),
    prisma.teeTime.findMany({
      where: { courseId, date: data.date, time: { gte: data.holdFrom, lte: data.holdTo } },
      select: { time: true, productId: true, playersBooked: true, eventId: true,
        bookings: { where: { status: { not: 'cancelled' } }, select: { golferName: true } } },
    }),
  ]);
  const probe = { id: '', format: data.format, holdFrom: data.holdFrom, holdTo: data.holdTo, productId: data.productId, status: 'planned' };
  const planned = [...desiredSlots(data.date, schedules, products).values()].filter(s => heldBy([probe], s.productId ?? null, s.time)).length;
  const inScope = slots.filter(s => heldBy([probe], s.productId ?? null, s.time));
  const booked = inScope.filter(s => s.playersBooked > 0 || s.bookings.length > 0)
    .map(s => ({ time: s.time, golfers: s.bookings.map(b => b.golferName).join(', ') || 'booked' }));
  const otherEvent = inScope.some(s => s.eventId && s.eventId !== excludeEventId);
  return { holdFrom: data.holdFrom, holdTo: data.holdTo, teeTimes: Math.max(planned, inScope.length), teeTimesFound, booked, otherEvent };
}

/** Create the event, its default checklist, and hold its tee times. */
export async function createEvent(courseId: string, input: EventInput, actor: string) {
  const { data, teeTimesFound } = await eventFields(courseId, input);
  // An event set up at short notice: an item that would already be past due is due today instead.
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const event = await prisma.courseEvent.create({
    data: {
      ...data, courseId, createdBy: actor,
      tasks: { create: DEFAULT_TASKS.map((t, i) => { const due = dueFor(data.date, t.daysBefore); return { label: t.label, dueDate: due < today ? today : due, sortOrder: i }; }) },
    },
  });
  const hold = await applyHold(event);
  return { event, hold, teeTimesFound };
}

/** Change an event's details; when the date or window moves, its hold moves with it. */
export async function updateEvent(courseId: string, id: string, input: EventInput) {
  const existing = await prisma.courseEvent.findFirst({ where: { id, courseId } });
  if (!existing) return null;
  if (existing.status !== 'planned') throw new EventError('This event was cancelled.');
  const { data, teeTimesFound } = await eventFields(courseId, input, { allowPast: input.date === existing.date });
  const moved = data.date !== existing.date || data.holdFrom !== existing.holdFrom || data.holdTo !== existing.holdTo
    || data.format !== existing.format || data.productId !== existing.productId;
  const event = await prisma.courseEvent.update({ where: { id }, data });
  if (data.date !== existing.date) {
    // The checklist moves with the event: every due date shifts by the same number of days.
    const shift = Math.round((Date.parse(data.date + 'T12:00:00Z') - Date.parse(existing.date + 'T12:00:00Z')) / 86_400_000);
    const tasks = await prisma.courseEventTask.findMany({ where: { eventId: id, dueDate: { not: null } }, select: { id: true, dueDate: true } });
    await prisma.$transaction(tasks.map(t => prisma.courseEventTask.update({ where: { id: t.id }, data: { dueDate: addDaysStr(t.dueDate!, shift) } })));
  }
  if (moved) {
    await releaseHold(id, existing);
    // Released times go back to what the schedule makes (a time it no longer makes is removed).
    if (existing.date >= todayIn((await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } }))?.timezone)) await generateTeeTimes(courseId, existing.date);
  }
  const hold = await applyHold(event);
  return { event, hold, teeTimesFound };
}

/** Cancel the event and give its tee times back to golfers. */
export async function cancelEvent(courseId: string, id: string) {
  const existing = await prisma.courseEvent.findFirst({ where: { id, courseId } });
  if (!existing) return null;
  await prisma.courseEvent.update({ where: { id }, data: { status: 'cancelled' } });
  const released = await releaseHold(id, existing);
  if (existing.date >= todayIn((await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } }))?.timezone)) await generateTeeTimes(courseId, existing.date);
  return { released };
}

/** Pure: put players into groups of `size` in list order, numbering groups from 1. Shotgun groups start on holes 1, 2, … */
export function autoPairings<P extends { id: string }>(players: P[], size: number, shotgun: boolean, holes: number): { id: string; groupNo: number; startHole: number | null }[] {
  const n = Math.max(1, Math.min(5, Math.floor(size) || 4));
  return players.map((p, i) => {
    const g = Math.floor(i / n) + 1;
    return { id: p.id, groupNo: g, startHole: shotgun ? ((g - 1) % holes) + 1 : null };
  });
}

/** Pure: pasted players — one per line, "Name, email, phone" in any order after the name; tabs from a spreadsheet work too. */
export function parsePlayers(text: string): { name: string; email: string; phone: string }[] {
  const out: { name: string; email: string; phone: string }[] = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const cells = raw.split(/\t|,|;/).map(c => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    const email = cells.find(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) ?? '';
    const phone = cells.find(c => c !== email && /\d{3}.*\d{3}.*\d{4}/.test(c)) ?? '';
    const name = cells.filter(c => c !== email && c !== phone).join(' ').slice(0, 120);
    // A spreadsheet's header row ("Name, Email, Phone"): every cell is a column title.
    if (!email && !phone && cells.every(c => /^((first|last|full|player)\s*)?name$|^e-?mail( address)?$|^(phone|mobile|cell)( number)?$/i.test(c))) continue;
    if (!name) continue;
    out.push({ name, email: email.toLowerCase().slice(0, 200), phone: phone.slice(0, 40) });
  }
  return out.slice(0, 500);
}

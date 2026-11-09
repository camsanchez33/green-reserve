// POS-7 (Cam 2026-11-09: "should have to input a starting cash at the beginning of the day to open the drawer …
// an actual set starting amount of cash that locks after it is confirmed"; "it says open the register";
// "any staff member at the register … they can allow to set permissions for it").
//
//  • Opening the register (permission shop.open) records the starting cash. It is then LOCKED: the close-out uses
//    it and can't type another.
//  • Changing it after (shop.open_fix — the owner gives it person by person) adds a row with a reason; the first
//    amount stays on record beside it. Append-only: seq 0 is the day's opening (unique per course and day, so two
//    people opening at once can't both win), each later row the next seq. The latest row of the session stands.
//
// DRAWER-1 (Cam 2026-11-09: "shouldn't be able to start taking charges until the register is open"; "if I closed with
// x amount it should tell me how much is in there and how much I should take out and leave a note … that should then
// correlate to the next morning and then you should have to re-open it"): the register is a loop.
//  • The close-out (lib/register-close) counts the drawer, leaves a float (RegisterClose.leaveInCents), says what to
//    take out to deposit, takes a note for the next person, and CLOSES the register.
//  • The next opening — the next morning, or a reopen the same day — shows what was left, by whom, and the note. Its
//    count is the starting cash; a count that isn't what was left needs a reason. A reopen is a new session (kind
//    'reopen'): its close-out counts only what came in after the close before it.
//  • While the register isn't open, nothing is charged at it: register sales, cash on the tee sheet and rounds on the
//    card reader are refused (requireRegisterOpen). Online payments never touch the drawer and are never refused.
// The day is the course's own (its timezone).
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { todayIn } from './course-time';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const MAX_CENTS = 10_000_000; // $100,000 — a typo guard

export type OpenKind = 'open' | 'fix' | 'reopen';
export type OpenRow = { startingCashCents: number; reason: string; openedBy: string; createdAt: string; kind: OpenKind; leftCents: number | null };
/** What the last close-out left for the next opening. */
export type Handoff = { day: string; leaveInCents: number; depositCents: number | null; note: string; closedBy: string; at: string };
export type RegisterStatus = 'not_open' | 'open' | 'closed';
export type OpenView = {
  day: string; status: RegisterStatus;
  /** The row that stands for today's session (open, or closed out). */
  current: OpenRow | null; history: OpenRow[];
  /** Left at the last close-out — what the next opening should find. Only when the drawer was closed since it was last opened. */
  handoff: Handoff | null;
  /** The last day the register was opened and never closed out (null when it was). */
  notClosed: string | null;
};

type DbOpen = { seq: number; startingCashCents: number; reason: string; openedBy: string; createdAt: Date; kind: string; leftCents: number | null };
/** Rows from before DRAWER-1 carry kind 'open' on every seq: a later seq was a correction. */
export function kindOf(r: { seq: number; kind: string }): OpenKind {
  if (r.kind === 'reopen') return 'reopen';
  if (r.kind === 'fix' || r.seq > 0) return 'fix';
  return 'open';
}
const row = (r: DbOpen): OpenRow =>
  ({ startingCashCents: r.startingCashCents, reason: r.reason, openedBy: r.openedBy, createdAt: r.createdAt.toISOString(), kind: kindOf(r), leftCents: r.leftCents });

/** The rows of the session that stands on a day: from its last opening (or reopen) on. Oldest first in, oldest first out. */
export function sessionRows<T extends { seq: number; kind: string }>(rows: T[]): T[] {
  let start = -1;
  rows.forEach((r, i) => { if (kindOf(r) !== 'fix') start = i; });
  return start < 0 ? rows : rows.slice(start);
}

async function courseToday(courseId: string): Promise<string | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  return c ? todayIn(c.timezone) : null;
}

/** Today's register: open, closed (closed out since it was opened) or not opened yet — with what was left for it. */
export async function registerOpenFor(courseId: string, day?: string): Promise<Result<OpenView>> {
  const d = day ?? (await courseToday(courseId));
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail(404, 'Course not found.');
  const pick = { day: true, leaveInCents: true, depositCents: true, note: true, closedBy: true, createdAt: true } as const;
  const [rows, closeOfDay, lastOpening] = await Promise.all([
    prisma.registerOpen.findMany({ where: { courseId, day: d }, orderBy: { seq: 'asc' } }),
    // This day's own latest close-out — closing out an older day late never touches today's status.
    prisma.registerClose.findFirst({ where: { courseId, day: d }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    // The latest opening or reopen on any day (corrections open nothing).
    prisma.registerOpen.findFirst({ where: { courseId, OR: [{ seq: 0 }, { kind: 'reopen' }] }, orderBy: { createdAt: 'desc' }, select: { day: true, createdAt: true } }),
  ]);
  // What was left for the next opening: the latest close-out of the last opened day (or later), made after that
  // opening. A late close-out of an older day isn't it. No opening on record: the latest close-out.
  const lastClose = await prisma.registerClose.findFirst({
    where: lastOpening ? { courseId, day: { gte: lastOpening.day }, createdAt: { gt: lastOpening.createdAt } } : { courseId },
    orderBy: { createdAt: 'desc' }, select: pick,
  });
  const history = rows.map(row);
  const session = sessionRows(rows);
  const start = session[0];
  const closedSince = !!lastClose;
  const status: RegisterStatus = !start ? 'not_open' : closeOfDay && closeOfDay.createdAt > start.createdAt ? 'closed' : 'open';
  const handoff: Handoff | null = closedSince && lastClose && lastClose.leaveInCents != null
    ? { day: lastClose.day, leaveInCents: lastClose.leaveInCents, depositCents: lastClose.depositCents, note: lastClose.note, closedBy: lastClose.closedBy, at: lastClose.createdAt.toISOString() }
    : null;
  const notClosed = !closedSince && lastOpening && lastOpening.day < d ? lastOpening.day : null;
  return { ok: true, value: { day: d, status, current: session.length ? row(session[session.length - 1]) : null, history, handoff, notClosed } };
}

/** DRAWER-1: null when the register is open today; otherwise why nothing can be charged at it yet. */
export async function requireRegisterOpen(courseId: string): Promise<string | null> {
  const v = await registerOpenFor(courseId);
  if (!v.ok) return v.error;
  if (v.value.status === 'open') return null;
  return v.value.status === 'closed' ? 'The register is closed out — reopen it before taking payments.' : 'Open the register before taking payments.';
}

const cents = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_CENTS ? n : null;
};

/**
 * Open today's register (or reopen it after a close-out the same day), or (fix) change the open session's starting
 * cash with a reason. The caller checks the permission: shop.open to open or reopen, shop.open_fix to change it after.
 * Opening counts the drawer: a count that isn't what the last close-out left needs a reason.
 */
export async function openRegister(courseId: string, input: { startingCashCents?: unknown; reason?: unknown }, by: string, mode: 'open' | 'fix'): Promise<Result<OpenView>> {
  const amount = cents(input.startingCashCents);
  if (amount === null) return fail(400, 'Enter the cash in the drawer as an amount (0 if it is empty).');
  const now = await registerOpenFor(courseId);
  if (!now.ok) return now;
  const { day, status, handoff } = now.value;
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : '';
  const last = await prisma.registerOpen.findFirst({ where: { courseId, day }, orderBy: { seq: 'desc' }, select: { seq: true } });
  let kind: OpenKind;
  if (mode === 'fix') {
    if (status !== 'open' || !last) return fail(409, status === 'closed' ? 'The register is closed out — reopen it instead.' : 'Open the register first.');
    if (!reason) return fail(400, 'Say why the starting cash is changing.');
    if (now.value.current?.startingCashCents === amount) return fail(400, 'That is already the starting cash.');
    kind = 'fix';
  } else {
    if (status === 'open') return fail(409, 'The register is already open — its starting cash is locked.');
    kind = status === 'closed' ? 'reopen' : 'open';
    if (handoff && amount !== handoff.leaveInCents && !reason) return fail(400, `The drawer should have the $${(handoff.leaveInCents / 100).toFixed(2)} left at close-out — say why it doesn't.`);
  }
  try {
    await prisma.registerOpen.create({ data: {
      courseId, day, seq: last ? last.seq + 1 : 0, startingCashCents: amount, reason, openedBy: by.slice(0, 200), kind,
      leftCents: kind === 'fix' ? null : handoff?.leaveInCents ?? null,
    } });
  } catch (e) {
    // Two at once: the unique (course, day, seq) lets exactly one through.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(409, mode === 'open' ? 'Someone just opened the register — refresh to see it.' : 'The starting cash just changed — refresh and try again.');
    throw e;
  }
  return registerOpenFor(courseId, day);
}

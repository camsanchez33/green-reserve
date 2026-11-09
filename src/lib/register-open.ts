// POS-7 (Cam 2026-11-09: "should have to input a starting cash at the beginning of the day to open the drawer …
// an actual set starting amount of cash that locks after it is confirmed"; "it says open the register";
// "any staff member at the register … they can allow to set permissions for it").
//
//  • Opening the register (permission shop.open) records the day's starting cash. It is then LOCKED: the
//    close-out uses it and can't type another.
//  • Changing it after (shop.open_fix — the owner gives it person by person) adds a row with a reason; the
//    first amount stays on record beside it. Append-only: seq 0 is the opening (unique per course and day, so
//    two people opening at once can't both win), each correction the next seq. The latest row stands.
//  • It never blocks a sale: cash still goes through before the register is opened (CLAUDE.md: never block
//    cash) — Home and the register just ask for it until it's done.
// The day is the course's own (its timezone). Today only: a past day's starting cash is corrected on the close-out.
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { todayIn } from './course-time';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const MAX_CENTS = 10_000_000; // $100,000 — a typo guard

export type OpenRow = { startingCashCents: number; reason: string; openedBy: string; createdAt: string };
export type OpenView = { day: string; current: OpenRow | null; history: OpenRow[] };

const row = (r: { startingCashCents: number; reason: string; openedBy: string; createdAt: Date }): OpenRow =>
  ({ startingCashCents: r.startingCashCents, reason: r.reason, openedBy: r.openedBy, createdAt: r.createdAt.toISOString() });

async function courseToday(courseId: string): Promise<string | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  return c ? todayIn(c.timezone) : null;
}

/** The day's opening and every correction, oldest first; `current` is the one that stands. */
export async function registerOpenFor(courseId: string, day?: string): Promise<Result<OpenView>> {
  const d = day ?? (await courseToday(courseId));
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail(404, 'Course not found.');
  const rows = await prisma.registerOpen.findMany({ where: { courseId, day: d }, orderBy: { seq: 'asc' } });
  const history = rows.map(row);
  return { ok: true, value: { day: d, current: history.at(-1) ?? null, history } };
}

const cents = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_CENTS ? n : null;
};

/**
 * Open today's register, or (fix) change its starting cash with a reason. The caller checks the permission:
 * shop.open to open, shop.open_fix to change it after.
 */
export async function openRegister(courseId: string, input: { startingCashCents?: unknown; reason?: unknown }, by: string, mode: 'open' | 'fix'): Promise<Result<OpenView>> {
  const amount = cents(input.startingCashCents);
  if (amount === null) return fail(400, 'Enter the starting cash as an amount (0 if the drawer is empty).');
  const day = await courseToday(courseId);
  if (!day) return fail(404, 'Course not found.');
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : '';
  const last = await prisma.registerOpen.findFirst({ where: { courseId, day }, orderBy: { seq: 'desc' }, select: { seq: true, startingCashCents: true } });
  if (mode === 'open' && last) return fail(409, 'The register is already open today — its starting cash is locked.');
  if (mode === 'fix') {
    if (!last) return fail(409, 'Open the register first.');
    if (!reason) return fail(400, 'Say why the starting cash is changing.');
    if (last.startingCashCents === amount) return fail(400, 'That is already the starting cash.');
  }
  try {
    await prisma.registerOpen.create({ data: { courseId, day, seq: last ? last.seq + 1 : 0, startingCashCents: amount, reason: mode === 'fix' ? reason : '', openedBy: by.slice(0, 200) } });
  } catch (e) {
    // Two at once: the unique (course, day, seq) lets exactly one through.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(409, mode === 'open' ? 'Someone just opened the register — refresh to see it.' : 'The starting cash just changed — refresh and try again.');
    throw e;
  }
  return registerOpenFor(courseId, day);
}

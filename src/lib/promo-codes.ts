// PRICE-1 (Cam 2026-10-30: "Promo codes" — "all of this is up to the course"; stacking
// "Course decides per code"): a code takes money off the GREEN FEE only — a percent, or
// an amount a player, never below $0 — for a tee time that fits its limits (dates,
// weekdays, a time of day), within its total uses and, when set, once per golfer.
// A code that doesn't work with rates is refused when a member or resident rate applies.
//
// One file: the online booking route, the counter and a repriced move all check a code
// with applyPromo()/promoFits() and price it SEAT BY SEAT with seatAfter() — the member's
// spot, each resident and each other player each pay their own rate less the code — so
// the per-seat rates stored on the booking (memberRateCents, residentRateCents) add up
// to greenFeeTotal and every later recompute (part of a group checking in, a party-size
// change, residents set at the counter) keeps the discount. A use is reserved atomically
// (reserveUse) before the booking is made, given back if it isn't. What a code took off
// is kept on the booking (promoDiscountCents).
import { prisma } from './prisma';

export type PromoRow = { id: string; code: string; kind: string; value: number; startsOn: string | null; endsOn: string | null; days: number[]; fromTime: string | null; toTime: string | null; maxUses: number | null; usesCount: number; onePerGolfer: boolean; withRates: boolean; active: boolean };
type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

export const normCode = (raw: unknown) => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);

/** Pure: one player's green fee after the code — never below $0. */
export function seatAfter(code: Pick<PromoRow, 'kind' | 'value'>, seatCents: number): number {
  if (seatCents <= 0) return Math.max(0, seatCents);
  const off = code.kind === 'percent' ? Math.round(seatCents * Math.min(100, Math.max(0, code.value)) / 100) : Math.max(0, code.value);
  return Math.max(0, seatCents - off);
}

/** Pure: what the code takes off a group all paying one rate (a summary; bookings price seat by seat). */
export function promoDiscount(code: Pick<PromoRow, 'kind' | 'value'>, seatCents: number, players: number): number {
  return (seatCents - seatAfter(code, seatCents)) * players;
}

/** Pure: why this code can't be used on this tee time, or null. */
export function promoFits(code: PromoRow, teeTime: { date: string; time: string }, opts: { rateApplied: boolean }): string | null {
  if (!code.active) return 'That code isn’t active.';
  if (code.startsOn && teeTime.date < code.startsOn) return `That code starts ${code.startsOn}.`;
  if (code.endsOn && teeTime.date > code.endsOn) return 'That code has ended.';
  if (code.days.length) {
    const dow = new Date(`${teeTime.date}T12:00:00Z`).getUTCDay();
    if (!code.days.includes(dow)) return 'That code isn’t for this day of the week.';
  }
  const t = teeTime.time.slice(0, 5);
  if (code.fromTime && t < code.fromTime) return `That code is for tee times from ${code.fromTime}.`;
  if (code.toTime && t >= code.toTime) return `That code is for tee times before ${code.toTime}.`;
  if (code.maxUses != null && code.usesCount >= code.maxUses) return 'That code has been used up.';
  if (opts.rateApplied && !code.withRates) return 'That code can’t be combined with a member, resident, senior or junior rate.';
  return null;
}

/**
 * Look a code up for a course and check it against a tee time and a golfer. The caller
 * prices it seat by seat (seatAfter) and refuses it when it takes nothing off.
 */
export async function applyPromo(courseId: string, raw: unknown, ctx: { date: string; time: string; rateApplied: boolean; golferEmail?: string | null }): Promise<{ ok: true; code: PromoRow } | Fail> {
  const code = normCode(raw);
  if (!code) return fail('Enter a code.');
  const row = await prisma.promoCode.findUnique({ where: { courseId_code: { courseId, code } } });
  // The same answer for a wrong code and another course's — never confirm a code exists elsewhere.
  if (!row) return fail('That code isn’t valid here.');
  const why = promoFits(row, ctx, { rateApplied: ctx.rateApplied });
  if (why) return fail(why);
  if (row.onePerGolfer && ctx.golferEmail) {
    const used = await prisma.booking.findFirst({ where: { courseId, promoCodeId: row.id, status: { not: 'cancelled' }, golferEmail: { equals: ctx.golferEmail.trim(), mode: 'insensitive' } }, select: { id: true } });
    if (used) return fail('You’ve already used that code.');
  }
  return { ok: true, code: row };
}

/** Take one use, only if one is left. False = the last use went to someone else just now. */
export async function reserveUse(codeId: string): Promise<boolean> {
  const n = await prisma.$executeRaw`UPDATE "PromoCode" SET "usesCount" = "usesCount" + 1, "updatedAt" = now() WHERE "id" = ${codeId} AND "active" AND ("maxUses" IS NULL OR "usesCount" < "maxUses")`;
  return n === 1;
}

/** Give a reserved use back (the booking wasn't made). Never below zero. */
export async function releaseUse(codeId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "PromoCode" SET "usesCount" = GREATEST(0, "usesCount" - 1), "updatedAt" = now() WHERE "id" = ${codeId}`.catch(() => {});
}

// ── The course's own list (Settings → Promo codes) ─────────────────────────────

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate a code from Settings. */
export function readPromo(body: Record<string, unknown>): { ok: true; data: Omit<PromoRow, 'id' | 'usesCount'> & { note: string } } | Fail {
  const code = normCode(body.code);
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return fail('A code is 3 to 30 letters, numbers or dashes.');
  const kind = body.kind === 'amount' ? 'amount' : body.kind === 'percent' ? 'percent' : null;
  if (!kind) return fail('Pick percent or amount off.');
  const value = Number(body.value);
  if (!Number.isInteger(value) || value < 1 || (kind === 'percent' ? value > 100 : value > 100_000)) return fail(kind === 'percent' ? 'Percent off is 1 to 100.' : 'Enter the amount off a player.');
  const d = (v: unknown) => (v === '' || v == null ? null : String(v));
  const startsOn = d(body.startsOn), endsOn = d(body.endsOn), fromTime = d(body.fromTime), toTime = d(body.toTime);
  if ((startsOn && !DATE.test(startsOn)) || (endsOn && !DATE.test(endsOn))) return fail('Pick the dates again.');
  if (startsOn && endsOn && startsOn > endsOn) return fail('The start date is after the end date.');
  if ((fromTime && !TIME.test(fromTime)) || (toTime && !TIME.test(toTime))) return fail('Pick the times again.');
  if (fromTime && toTime && fromTime >= toTime) return fail('The start time is after the end time.');
  const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : [];
  const maxUses = body.maxUses === '' || body.maxUses == null ? null : Number(body.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000)) return fail('Uses is a whole number, or blank for no limit.');
  return { ok: true, data: { code, kind, value, startsOn, endsOn, days, fromTime, toTime, maxUses, onePerGolfer: body.onePerGolfer === true, withRates: body.withRates === true, active: body.active !== false, note: String(body.note ?? '').trim().slice(0, 200) } };
}

/** The course's codes, newest first, with what each has taken off so far. */
export async function listPromos(courseId: string) {
  const [codes, sums] = await Promise.all([
    prisma.promoCode.findMany({ where: { courseId }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }),
    prisma.booking.groupBy({ by: ['promoCodeId'], where: { courseId, promoCodeId: { not: null }, status: { not: 'cancelled' } }, _sum: { promoDiscountCents: true }, _count: { _all: true } }),
  ]);
  const by = new Map(sums.map(s => [s.promoCodeId, s]));
  return codes.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), bookings: by.get(c.id)?._count._all ?? 0, discountedCents: by.get(c.id)?._sum.promoDiscountCents ?? 0 }));
}

export const NOTHING_OFF = 'That code takes nothing off this tee time.';

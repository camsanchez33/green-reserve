// Memberships item 4 (Cam 2026-11-16, lanes/build.md): season passes — "a membership kind with fixed start/end dates
// (every pass ends on the end date), buy online and/or at the course, rates per price-list line, and the 1% fee golfers
// pay on top."
//
//  • A pass is a MembershipTier with kind 'pass' and the course's own dates (passStartsOn … passEndsOn, YYYY-MM-DD).
//    Its price is annualFeeCents; it has no initiation fee and never renews (no automatic renewal, no renewal reminder).
//  • Every pass ends on the end date, whenever it was bought: paying records expiresAt = the end date (midnight UTC of
//    that date, the same convention as a typed "runs until" date) and the pass's first day on the membership
//    (CourseMembership.passStartsOn). No grace days: member rates apply only on days from the first to the last.
//  • Its rates are the membership's own (lineRates, item 3), its 1% is the dues' 1% (lib/membership-dues amountsDue).
//  • Its money goes on the ledger as 'pass' — never 'dues' — so Revenue shows passes as their own line and a past
//    payment keeps its kind whatever later happens to the membership.
//
// ONE place for these rules: the pay link, staff taking it at the course (cash, reader, typed card) and the online
// join all price and record a pass through here.
import type { MoveWhat } from './money-ledger';

/** How long a paid term runs: a number of months from payment, or a pass's fixed season. */
export type Term = { kind: 'months'; months: number } | { kind: 'pass'; startsOn: string; endsOn: string };

/** What a tier must carry for its term to be known — every caller selects all four, so no path can miss a pass. */
export type TierTermShape = { kind: string; termMonths: number; passStartsOn: string | null; passEndsOn: string | null };

/** The tier fields termOf and ledgerWhat need, for a Prisma select. */
export const TERM_SELECT = { kind: true, termMonths: true, passStartsOn: true, passEndsOn: true } as const;

export const isPassTier = (tier: { kind: string } | null | undefined): boolean => tier?.kind === 'pass';

/** A tier's term. A pass missing its dates (never saved that way) has '' dates, which passOnSale refuses. */
export function termOf(tier: TierTermShape | null | undefined): Term {
  if (tier && tier.kind === 'pass') return { kind: 'pass', startsOn: tier.passStartsOn ?? '', endsOn: tier.passEndsOn ?? '' };
  return { kind: 'months', months: tier?.termMonths ?? 12 };
}

/** The ledger kind of a payment on this tier. */
export const ledgerWhat = (tier: { kind: string } | null | undefined): Extract<MoveWhat, 'dues' | 'pass'> => (isPassTier(tier) ? 'pass' : 'dues');

/** The ledger kinds that are membership money (dues and passes) — every reader that means "membership money" uses this. */
export const MEMBERSHIP_WHATS: MoveWhat[] = ['dues', 'pass'];

const midnightUtc = (day: string) => new Date(`${day}T00:00:00Z`);

/** Where a paid term ends, and the pass's first day (null for a membership term). `base` is where a months term counts from. */
export function paidTermDates(term: Term, base: Date): { expiresAt: Date; passStartsOn: string | null } {
  if (term.kind === 'pass') return { expiresAt: midnightUtc(term.endsOn), passStartsOn: term.startsOn };
  const expiresAt = new Date(base);
  expiresAt.setMonth(expiresAt.getMonth() + term.months);
  return { expiresAt, passStartsOn: null };
}

/** A pass can be bought until its last day (the course's today), and only with both dates. A months term always can. */
export function passOnSale(term: Term, courseToday: string): boolean {
  if (term.kind !== 'pass') return true;
  return isDay(term.startsOn) && isDay(term.endsOn) && courseToday <= term.endsOn;
}
export const PASS_OVER = 'This season pass has ended — it can’t be bought any more.';

/** A real calendar date, YYYY-MM-DD. */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = midnightUtc(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A pass's season from the setup form: both dates, start on or before end, at most three years long (as a term). */
export function readPassDates(startsOn: unknown, endsOn: unknown): { ok: true; startsOn: string; endsOn: string } | { ok: false; error: string } {
  if (!isDay(startsOn) || !isDay(endsOn)) return { ok: false, error: 'Pick the first and last day of the season pass.' };
  if (startsOn > endsOn) return { ok: false, error: 'The season pass ends before it starts — check the dates.' };
  if (midnightUtc(endsOn).getTime() - midnightUtc(startsOn).getTime() > 3 * 366 * 86_400_000) return { ok: false, error: 'A season pass runs at most three years.' };
  return { ok: true, startsOn, endsOn };
}

/**
 * Whether a paid pass covers a day: from its first day to its end date (expiresAt), inclusive, no grace.
 * `pass` is the membership's passStartsOn and expiresAt.
 */
export function passCovers(pass: { passStartsOn: string; expiresAt: Date | null }, day: string): boolean {
  return !!pass.expiresAt && day >= pass.passStartsOn && day <= pass.expiresAt.toISOString().slice(0, 10);
}

/**
 * What a membership put on a pass tier starts with (staff adding one, or moving one onto it). A pass that costs
 * something waits for its payment — never live before it is paid, however it was added. A free pass is comped and
 * runs its season at once.
 */
export function passStart(tier: { passStartsOn: string | null; passEndsOn: string | null }, owes: boolean) {
  return owes
    ? { status: 'awaiting_payment', paymentStatus: 'unpaid', passStartsOn: null, expiresAt: null }
    : { status: 'active', paymentStatus: 'comped', passStartsOn: tier.passStartsOn, expiresAt: tier.passEndsOn ? midnightUtc(tier.passEndsOn) : null };
}

/** Whether a membership has a paid (or comped) term running now: it can't be moved onto or off a pass until it ends. */
export function termRunning(m: { paymentStatus: string; expiresAt: Date | null }, courseToday: string): boolean {
  if (!['paid', 'paid_offline', 'comped'].includes(m.paymentStatus)) return false;
  return !m.expiresAt || m.expiresAt.toISOString().slice(0, 10) >= courseToday;
}

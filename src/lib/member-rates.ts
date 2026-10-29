// Cam 2026-10-29 (Revamp 3 audit, fixes 1 and 2 — "up to course"): the two rules
// that decide who gets a member's price. ONE place, read by booking, the member
// portal's tee times, the booking page's own-rate preview, moves and check-in.
//
//  • Guests: a member's booking prices the member at the member rate and everyone
//    else at the public rate, unless the tier says guests pay the member rate too
//    (MembershipTier.guestsPayMemberRate). It used to give the whole group the
//    member rate.
//  • Lapsed: member rates and the member booking window end the day after the
//    membership's "runs until" date, plus the course's grace days
//    (Course.memberGraceDays). A membership with no end date never lapses. Unpaid
//    dues alone don't end them, so a course can chase dues mid-season. It used to
//    check only status = 'active', so an expired member kept member rates forever.
import type { Prisma } from '@prisma/client';

const DAY_MS = 86_400_000;

/** The earliest "runs until" date whose member rates still apply now. */
function lapseCutoff(graceDays: number, now: Date): Date {
  // +1: the "runs until" day itself is still a member day.
  return new Date(now.getTime() - (Math.max(0, Math.floor(graceDays)) + 1) * DAY_MS);
}

/** Prisma filter for a membership whose member rates apply right now. */
export function liveMembershipWhere(graceDays: number, now: Date = new Date()): Prisma.CourseMembershipWhereInput {
  return { status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gte: lapseCutoff(graceDays, now) } }] };
}

/** The same rule on a row already loaded. */
export function membershipLive(m: { status: string; expiresAt: Date | null }, graceDays: number, now: Date = new Date()): boolean {
  return m.status === 'active' && (!m.expiresAt || m.expiresAt.getTime() >= lapseCutoff(graceDays, now).getTime());
}

/** How many of a group's players pay the member rate. */
export function memberPlayers(players: number, tier: { guestsPayMemberRate: boolean } | null | undefined): number {
  if (!tier || players <= 0) return 0;
  return tier.guestsPayMemberRate ? players : 1;
}

/** A group's total when `member` of its players pay `memberCents` each and the rest `standardCents`. */
export function splitTotal(players: number, member: number, memberCents: number, standardCents: number): number {
  const m = Math.max(0, Math.min(players, member));
  return m * memberCents + (players - m) * standardCents;
}

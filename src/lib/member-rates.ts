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
//    (Course.memberGraceDays), counted in the course's own timezone. A membership
//    with no end date never lapses. Unpaid dues alone don't end them, so a course
//    can chase dues mid-season. It used to check only status = 'active', so an
//    expired member kept member rates forever.
//
// A member's group keeps the split when its size changes or part of it checks
// in: Booking.memberRateCents / memberCartCents hold the member's own spot
// (null = every player pays the same), and partyFees() prices any headcount.
import type { Prisma } from '@prisma/client';
import { todayIn, addDaysStr } from './course-time';
import { groupGreenFee, otherPerPlayerCents } from './residents';

/** What decides when a course's member rates lapse — a Course row carries both. */
export type LapseRule = { memberGraceDays: number; timezone?: string | null };

/**
 * The earliest "runs until" instant whose member rates still apply now. A typed
 * end date is stored as midnight UTC of that date, so comparing against midnight
 * UTC of (the course's today − grace days) keeps the whole end date a member day
 * wherever the course is.
 */
function lapseCutoff(rule: LapseRule, now: Date): Date {
  const grace = Math.max(0, Math.floor(rule.memberGraceDays || 0));
  return new Date(`${addDaysStr(todayIn(rule.timezone, now), -grace)}T00:00:00Z`);
}

/** Prisma filter for a membership whose member rates apply right now. */
export function liveMembershipWhere(rule: LapseRule, now: Date = new Date()): Prisma.CourseMembershipWhereInput {
  return { status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gte: lapseCutoff(rule, now) } }] };
}

/** The same rule on a row already loaded. */
export function membershipLive(m: { status: string; expiresAt: Date | null }, rule: LapseRule, now: Date = new Date()): boolean {
  return m.status === 'active' && (!m.expiresAt || m.expiresAt.getTime() >= lapseCutoff(rule, now).getTime());
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

/** What Booking.memberRateCents / memberCartCents should hold: the member's own spot, only when guests pay differently. */
export function memberSpot(tier: { guestsPayMemberRate: boolean } | null | undefined, rate: { greenFeeCents: number; cartFeeCents: number }) {
  return tier && !tier.guestsPayMemberRate
    ? { memberRateCents: rate.greenFeeCents, memberCartCents: rate.cartFeeCents }
    : { memberRateCents: null, memberCartCents: null };
}

export type PartyBooking = {
  players: number; greenFeeTotal: number; cartFeeTotal: number;
  residentPlayers: number; residentRateCents: number | null;
  memberRateCents: number | null; memberCartCents: number | null;
};

/**
 * The green and cart fees for `n` of a booking's players — a party-size change
 * or the part of a group that showed. The member's own spot (or the residents,
 * RES-1) is counted first; everyone else pays what the booking's other players
 * pay, or the tee time's public price when the booking has nobody else to read
 * it from. A group whose players all pay the same scales per player.
 */
export function partyFees(b: PartyBooking, n: number, publicRate: { greenFeeCents: number; cartFeeCents: number }): { greenFeeTotal: number; cartFeeTotal: number } {
  const per = (total: number) => (b.players > 0 ? Math.round((total * n) / b.players) : 0);
  if (b.memberRateCents != null && n >= 1) {
    const guests = b.players - 1;
    const guestGreen = guests > 0 ? Math.round((b.greenFeeTotal - b.memberRateCents) / guests) : publicRate.greenFeeCents;
    const greenFeeTotal = b.memberRateCents + (n - 1) * guestGreen;
    let cartFeeTotal = 0;
    if (b.cartFeeTotal > 0) {
      if (b.memberCartCents == null) cartFeeTotal = per(b.cartFeeTotal);
      else {
        const guestCart = guests > 0 ? Math.round((b.cartFeeTotal - b.memberCartCents) / guests) : publicRate.cartFeeCents;
        cartFeeTotal = b.memberCartCents + (n - 1) * guestCart;
      }
    }
    return { greenFeeTotal, cartFeeTotal };
  }
  if (b.residentPlayers > 0) {
    const others = otherPerPlayerCents(b) ?? publicRate.greenFeeCents;
    return { greenFeeTotal: groupGreenFee(n, others, b.residentPlayers, b.residentRateCents).greenFeeTotal, cartFeeTotal: per(b.cartFeeTotal) };
  }
  return { greenFeeTotal: per(b.greenFeeTotal), cartFeeTotal: per(b.cartFeeTotal) };
}

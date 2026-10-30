// MEM-JOIN (Cam 2026-10-30: "Join online" — "Course decides per tier"): a golfer joins a
// membership tier from the course's page, e.g. a course's "$800 for unlimited rounds" tier
// (dues $800, green fee $0).
//
//  • A tier's joinOnline is 'off', 'instant' or 'request'. Only a tier with dues to pay can be
//    joined online — a free tier would hand member rates to anyone who signs in.
//  • instant: the membership is made 'awaiting_payment' and the golfer goes straight to the
//    dues pay link (/membership/[id]); paying it makes them 'active' (api/membership/[id]).
//  • request: the membership is made 'requested'; staff approve it on Members (it becomes
//    'awaiting_payment' and the pay link is emailed) or decline it ('cancelled').
//  • Member rates and the member booking window go only to 'active' memberships
//    (lib/member-rates membershipLive), so nobody gets them before paying.
//  • One membership per golfer per course: joining again while a join is unfinished gives
//    back where it stands; a cancelled one is reused; one the course paused (inactive) is refused.
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { maybeSendPayLink, NOT_SENT } from './membership-pay-link';

export type JoinMode = 'off' | 'instant' | 'request';
export const readJoinMode = (v: unknown): JoinMode | null => (v === 'off' || v === 'instant' || v === 'request' ? v : null);
export const JOIN_NEEDS_DUES = 'A tier joined online needs dues to pay — set its yearly dues first.';

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const UNFINISHED = ['requested', 'awaiting_payment'];

/** The tiers a course offers online, with what a member pays (for the golfer's page). */
export async function joinableTiers(courseId: string) {
  const tiers = await prisma.membershipTier.findMany({
    where: { courseId, active: true, joinOnline: { in: ['instant', 'request'] }, annualFeeCents: { gt: 0 } },
    orderBy: { annualFeeCents: 'asc' },
    select: { id: true, name: true, joinOnline: true, annualFeeCents: true, initiationFeeCents: true, termMonths: true, greenFeeWeekdayCents: true, greenFeeWeekendCents: true, cartFeeWeekdayCents: true, cartFeeWeekendCents: true, discountPct: true, guestsPayMemberRate: true, advanceBookingDays: true },
  });
  return tiers;
}

/** The signed-in golfer's membership here, if any (for the page to say where they stand). */
export async function myMembership(courseId: string, golferId: string, email: string) {
  return prisma.courseMembership.findFirst({
    where: { courseId, OR: [{ golferId }, { golferId: null, inviteEmail: { equals: email.trim(), mode: 'insensitive' } }], status: { in: ['active', ...UNFINISHED] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, payToken: true, tier: { select: { name: true } } },
  });
}

export type JoinResult = { ok: true; status: 'awaiting_payment' | 'requested'; membershipId: string; payToken: string } | Fail;

/** Join (or ask to join) a tier as the signed-in golfer. */
export async function joinTier(courseId: string, golfer: { id: string; email: string; name: string; phone: string }, tierId: string): Promise<JoinResult> {
  const tier = await prisma.membershipTier.findFirst({ where: { id: tierId, courseId, active: true }, select: { id: true, joinOnline: true, annualFeeCents: true } });
  if (!tier || (tier.joinOnline !== 'instant' && tier.joinOnline !== 'request')) return fail(404, 'That membership can’t be joined online.');
  if (tier.annualFeeCents <= 0) return fail(409, 'That membership can’t be joined online.');
  const email = golfer.email.trim().toLowerCase();
  const mine = await myMembership(courseId, golfer.id, email);
  if (mine?.status === 'active') return fail(409, `You’re already a member here${mine.tier ? ` (${mine.tier.name})` : ''}.`);
  if (mine && UNFINISHED.includes(mine.status)) return { ok: true, status: mine.status as 'awaiting_payment' | 'requested', membershipId: mine.id, payToken: mine.payToken };

  const status = tier.joinOnline === 'instant' ? 'awaiting_payment' : 'requested';
  const data = { tierId: tier.id, status, addedBy: 'online', inviteEmail: email, inviteName: golfer.name.slice(0, 120), invitePhone: golfer.phone.slice(0, 30), inviteAccepted: true, payToken: randomUUID(), paymentStatus: 'unpaid' };
  // One membership per golfer per course (the schema's unique key): an old cancelled or pending one
  // is reused — its payment history stays, so a returning member owes no initiation again. One the
  // course made not active is theirs to turn back on, never the golfer's by paying.
  const old = await prisma.courseMembership.findUnique({ where: { golferId_courseId: { golferId: golfer.id, courseId } }, select: { id: true, status: true } });
  if (old?.status === 'inactive') return fail(409, 'Your membership here was paused by the course — contact them to turn it back on.');
  const row = old
    ? await prisma.courseMembership.update({ where: { id: old.id }, data, select: { id: true, payToken: true } })
    : await prisma.courseMembership.create({ data: { ...data, golferId: golfer.id, courseId }, select: { id: true, payToken: true } });
  return { ok: true, status, membershipId: row.id, payToken: row.payToken };
}

/** Staff: approve a request — it becomes payable and the pay link is emailed. */
export async function approveJoin(courseId: string, membershipId: string): Promise<{ ok: true; sent: boolean; note: string } | Fail> {
  const done = await prisma.courseMembership.updateMany({ where: { id: membershipId, courseId, status: 'requested' }, data: { status: 'awaiting_payment' } });
  if (!done.count) return fail(409, 'That request was already answered — refresh.');
  const m = await prisma.courseMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { payToken: true } });
  if (!m.payToken) await prisma.courseMembership.update({ where: { id: membershipId }, data: { payToken: randomUUID() } });
  // Approved either way; an email that fails says so, and the list's "Email dues link" sends it again.
  try {
    const sent = await maybeSendPayLink(membershipId, false);
    return { ok: true, sent: sent === 'sent', note: sent === 'sent' ? '' : NOT_SENT[sent] };
  } catch (err) {
    console.error(JSON.stringify({ ev: 'membership.join.pay_link_fail', membershipId, error: err instanceof Error ? err.message : String(err) }));
    return { ok: true, sent: false, note: 'the email couldn’t be sent — use Email dues link on the members list.' };
  }
}

/** Staff: decline a request (or drop an unpaid online join). Never touches a paid member. */
export async function declineJoin(courseId: string, membershipId: string): Promise<{ ok: true } | Fail> {
  const done = await prisma.courseMembership.updateMany({ where: { id: membershipId, courseId, status: { in: UNFINISHED } }, data: { status: 'cancelled' } });
  return done.count ? { ok: true } : fail(409, 'That request was already answered — refresh.');
}

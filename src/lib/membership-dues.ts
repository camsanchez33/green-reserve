// Membership dues: what a term costs and how a paid term is recorded. ONE place, used by the dues
// pay link (api/membership/[id]) and MEM-RENEW's automatic renewal charge (lib/membership-autorenew),
// so a term is always priced and extended the same way.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { membershipFeeCents } from './stripe';

/** Initiation is only owed on the first payment ever — never by a member who
 *  joined before the course came to GreenReserve (imported, initiationWaived). */
export function amountsDue(m: { lastPaidAt: Date | null; initiationWaived: boolean; tier: { annualFeeCents: number; initiationFeeCents: number } | null }) {
  // MP-3 B2a: this used to multiply dollars by 100 to reach cents. The columns
  // ARE cents now, so that multiplication would have charged 100x — exactly the
  // silent failure the rename exists to make impossible.
  const annualCents = m.tier?.annualFeeCents ?? 0;
  const initiationCents = m.lastPaidAt || m.initiationWaived ? 0 : (m.tier?.initiationFeeCents ?? 0);
  const duesCents = annualCents + initiationCents;
  // The 1% rides on top: the course receives its full dues, the member pays dues + fee.
  const feeCents = membershipFeeCents(duesCents);
  return { annualCents, initiationCents, duesCents, feeCents, totalCents: duesCents + feeCents };
}


/**
 * Record a paid term. It extends from the end date when renewing early, from today otherwise; a
 * first payment (nothing paid before) always starts today — the end date typed when the member was
 * added is not a paid term (Cam 2026-10-29: it paid two terms). One plain update, only if the term is
 * still the one charged for: a replayed charge the first try already recorded is not a second term.
 * Returns false when it wasn't (the caller logs it). MEM-JOIN: a paid online join becomes active.
 */
export async function recordPaidTerm(
  m: { id: string; startedAt: Date | null; termMonths: number },
  now: { lastPaidAt: Date | null; expiresAt: Date | null },
  paymentIntentId: string,
  extra: Prisma.CourseMembershipUpdateManyMutationInput = {},
): Promise<boolean> {
  const base = now.lastPaidAt && now.expiresAt && now.expiresAt.getTime() > Date.now() ? new Date(now.expiresAt) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + m.termMonths);
  const recorded = await prisma.courseMembership.updateMany({
    where: { id: m.id, lastPaidAt: now.lastPaidAt },
    data: {
      paymentStatus: 'paid',
      status: 'active',
      startedAt: m.startedAt ?? new Date(),
      lastPaidAt: new Date(),
      lastPaymentIntentId: paymentIntentId,
      expiresAt: newExpiry,
      renewalRemindedAt: null,
      duesChargeStartedAt: null,
      ...extra,
    },
  });
  return recorded.count > 0;
}

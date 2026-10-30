// Membership dues pay links — sending one by email, and what to tell staff when it couldn't go.
// Shared by the Members page (staff "Send pay link") and MEM-JOIN (approving an online request).
import { prisma } from './prisma';
import { centsToDollarsOr0 } from './money';
import { sendMembershipPaymentLinkEmail } from './email';

/**
 * Send the dues payment link if the tier actually costs money and Stripe is connected.
 * Says why when it didn't (dead end 21: the staff button must never report a send that didn't happen).
 */
export async function maybeSendPayLink(membershipId: string, isRenewal = false): Promise<'sent' | 'no_tier' | 'no_email' | 'nothing_owed' | 'no_stripe'> {
  const m = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    include: { tier: true, course: { select: { name: true, stripeAccountActive: true } }, golfer: { select: { email: true, firstName: true, lastName: true } } },
  });
  if (!m || !m.tier) return 'no_tier';
  // The account's email wins over the invite address (a self-joined member has no invite address).
  const to = m.golfer?.email || m.inviteEmail;
  if (!to) return 'no_email';
  // MP-3 B2a: compare in cents, convert to dollars only for the email, which
  // renders $${annualFee.toFixed(2)}.
  const initiationCents = m.lastPaidAt || m.initiationWaived ? 0 : m.tier.initiationFeeCents;
  if (m.tier.annualFeeCents + initiationCents <= 0) return 'nothing_owed';
  if (!m.course.stripeAccountActive) return 'no_stripe';
  await sendMembershipPaymentLinkEmail({
    name: m.inviteName || [m.golfer?.firstName, m.golfer?.lastName].filter(Boolean).join(' '),
    email: to,
    courseName: m.course.name,
    tierName: m.tier.name,
    annualFee: centsToDollarsOr0(m.tier.annualFeeCents),
    initiationFee: centsToDollarsOr0(initiationCents),
    payLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
    isRenewal,
  });
  return 'sent';
}

export const NOT_SENT: Record<Exclude<Awaited<ReturnType<typeof maybeSendPayLink>>, 'sent'>, string> = {
  no_tier: 'Put them on a membership first — the link is for its dues.',
  no_email: 'They have no email on file — add one with Edit details.',
  nothing_owed: 'Their membership costs nothing, so there is no link to send.',
  no_stripe: 'Connect Stripe first — the link takes a payment, and there is nowhere for the money to go yet.',
};


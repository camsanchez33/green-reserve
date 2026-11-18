// The email a member gets when the course adds them: a golfer with an older account is told they're linked; anyone
// else gets the welcome. Both point at the course's member sign-in (the emailed member link, gr_member); the
// set-password invite and golfer accounts are retired (Cam 2026-11-18).
// Memberships item 1 (Cam 2026-11-16, "they are a member only once paid"): a member added at the counter (addedBy COUNTER_ADDED) pays first, so this goes out once the dues are paid, not when added.
import { prisma } from './prisma';
import { sendMemberInviteEmail, sendMemberLinkedNotification, sendMembershipReceiptEmail } from './email';

/** addedBy for a member added on the Memberships page, who pays before they are a member. */
export const COUNTER_ADDED = 'counter';

export async function sendWelcome(membershipId: string): Promise<void> {
  const m = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    select: { id: true, inviteEmail: true, inviteName: true, inviteAccepted: true, membershipType: true, golfer: { select: { firstName: true, lastName: true, email: true } }, tier: { select: { name: true } }, course: { select: { name: true, slug: true } } },
  });
  if (!m) return;
  const tierName = m.tier?.name ?? m.membershipType;
  if (m.golfer) {
    await sendMemberLinkedNotification({
      name: `${m.golfer.firstName} ${m.golfer.lastName}`.trim() || m.inviteName,
      email: m.golfer.email || m.inviteEmail,
      courseName: m.course.name || 'your course',
      courseSlug: m.course.slug,
      tierName,
    });
    return;
  }
  if (m.inviteAccepted || !m.inviteEmail) return;
  await sendMemberInviteEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name || 'your course',
    tierName,
    setupLink: `${process.env.NEXT_PUBLIC_URL}/courses/${m.course.slug}/member`,
  });
}

/**
 * After staff (or the cron's reader settle) record a dues payment: the receipt to the member, and — the first time a
 * member added at the counter pays — the welcome. The pay link sends its own receipt; it calls welcomeIfFirst only.
 */
export async function afterDuesPaid(membershipId: string, paid: { amountCents: number; feeCents: number; firstPayment: boolean }): Promise<void> {
  const m = await prisma.courseMembership.findUnique({ where: { id: membershipId }, select: { inviteName: true, inviteEmail: true, expiresAt: true, membershipType: true, tier: { select: { name: true } }, course: { select: { name: true } }, golfer: { select: { email: true } } } });
  if (!m) return;
  const to = m.golfer?.email || m.inviteEmail;
  // The receipt failing never costs the welcome (it is sent once).
  if (to) await sendMembershipReceiptEmail({ name: m.inviteName, email: to, courseName: m.course.name, tierName: m.tier?.name ?? m.membershipType, amountPaid: paid.amountCents / 100, serviceFee: paid.feeCents / 100, expiresAt: m.expiresAt }).catch(err => console.error(JSON.stringify({ ev: 'membership.receipt_email_fail', membershipId, error: err instanceof Error ? err.message : String(err) })));
  await welcomeIfFirst(membershipId, paid.firstPayment);
}

/** The welcome for a member added at the counter, sent once: on their first payment, however it was paid. */
export async function welcomeIfFirst(membershipId: string, firstPayment: boolean): Promise<void> {
  if (!firstPayment) return;
  const m = await prisma.courseMembership.findUnique({ where: { id: membershipId }, select: { addedBy: true } });
  if (m?.addedBy === COUNTER_ADDED) await sendWelcome(membershipId);
}

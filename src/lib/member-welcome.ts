// The email a member gets when the course sets them up (GOLFER-LOGIN-1, Cam 2026-11-18, approved invite): one email
// for every member, linked to an older golfer account or not — "<Course> set you up as a <group>. Log in at <course
// page> with this email to get your rates". It goes out only for an active membership (Build 2026-11-18: no second
// email before the dues are paid). Golfer accounts and the set-password invite are retired (GOLFER-SIGNIN-RETIRED).
// Memberships item 1 (Cam 2026-11-16, "they are a member only once paid"): a member added at the counter (addedBy COUNTER_ADDED) pays first, so this goes out once the dues are paid, not when added.
import { prisma } from './prisma';
import { sendMemberInviteEmail, sendMembershipReceiptEmail } from './email';
import { memberBenefitsLine } from './member-benefits';

/** addedBy for a member added on the Memberships page, who pays before they are a member. */
export const COUNTER_ADDED = 'counter';

export async function sendWelcome(membershipId: string): Promise<void> {
  const m = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    select: {
      status: true, inviteEmail: true, inviteName: true, membershipType: true,
      golfer: { select: { firstName: true, lastName: true, email: true } },
      tier: { select: { name: true, discountPct: true, greenFeeWeekdayCents: true, greenFeeWeekendCents: true, lineRates: true, advanceBookingDays: true, windowPublic: true, guestPassesPerYear: true } },
      course: { select: { name: true, slug: true, publicAdvanceDays: true, memberAdvanceDays: true } },
    },
  });
  if (!m || m.status !== 'active') return;
  // The member's own email (staff can edit it); an older linked account's only when none was ever typed.
  const to = m.inviteEmail || m.golfer?.email || '';
  if (!to) return;
  await sendMemberInviteEmail({
    name: m.inviteName || (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}`.trim() : ''),
    email: to,
    courseName: m.course.name || 'your course',
    groupName: m.tier?.name ?? m.membershipType ?? 'Member',
    coursePageUrl: `${process.env.NEXT_PUBLIC_URL}/courses/${m.course.slug}`,
    benefits: memberBenefitsLine(m.tier, m.course),
  });
}

/**
 * After staff (or the cron's reader settle) record a dues payment: the receipt to the member, and — the first time a
 * member added at the counter pays — the welcome. The pay link sends its own receipt; it calls welcomeIfFirst only.
 */
export async function afterDuesPaid(membershipId: string, paid: { amountCents: number; feeCents: number; firstPayment: boolean }): Promise<void> {
  const m = await prisma.courseMembership.findUnique({ where: { id: membershipId }, select: { inviteName: true, inviteEmail: true, expiresAt: true, membershipType: true, tier: { select: { name: true } }, course: { select: { name: true } }, golfer: { select: { email: true } } } });
  if (!m) return;
  const to = m.inviteEmail || m.golfer?.email;
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

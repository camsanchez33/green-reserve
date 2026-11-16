// The email a member gets when the course adds them: a golfer with an account is told they're linked; anyone else
// gets a set-password invite. Memberships item 1 (Cam 2026-11-16, "they are a member only once paid"): a member
// added at the counter (addedBy COUNTER_ADDED) pays first, so this goes out once the dues are paid, not when added.
import { prisma } from './prisma';
import { signMemberInviteToken } from './auth';
import { sendMemberInviteEmail, sendMemberLinkedNotification } from './email';

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
  const token = await signMemberInviteToken({ membershipId: m.id, email: m.inviteEmail });
  await sendMemberInviteEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name || 'your course',
    tierName,
    setupLink: `${process.env.NEXT_PUBLIC_URL}/courses/${m.course.slug}/account/accept-invite?token=${token}`,
  });
}

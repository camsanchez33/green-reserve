// CALL_SCHEDULING_SPEC SC-2 §1 — the "pick a call time" invite.
//
// One token per inquiry (CourseInquiry.callInviteToken), regenerated on resend,
// 21 days to book. After a call is booked the token keeps working as the
// manage link (reschedule / cancel) until the call is logged — the email link
// always lands somewhere useful.
import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import { sendCallInviteEmail } from './email';
import { AGENDA } from './inquiry-call';

export const INVITE_DAYS = 21;

export function inviteUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/call/${token}`;
}

/** The three lines the invite and the page show — the agenda's always-on items, so the copy can never drift from the call. */
export function inviteAgendaLines(): string[] {
  return AGENDA.filter(a => a.always && a.key !== 'booking_today').map(a => a.label);
}

/** Mint (or re-mint) the token and stamp the expiry. Does not send. */
export async function issueCallInvite(inquiryId: string): Promise<{ token: string; url: string; expiresAt: Date }> {
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await prisma.courseInquiry.update({
    where: { id: inquiryId },
    data: { callInviteToken: token, callInviteExpiresAt: expiresAt },
  });
  return { token, url: inviteUrl(token), expiresAt };
}

export type InviteSendResult = { sent: boolean; url: string; error?: string };

/**
 * Issue + email the invite. A send failure never fails the caller: the token
 * is still set (the confirmation email can still point at it) and
 * callInviteSentAt stays null so the admin side can say "invite not sent".
 */
export async function sendCallInvite(inquiry: { id: string; firstName?: string | null; contactName: string; email: string; courseName: string }): Promise<InviteSendResult> {
  const { url } = await issueCallInvite(inquiry.id);
  try {
    await sendCallInviteEmail({
      firstName: (inquiry.firstName || inquiry.contactName.split(' ')[0] || 'there').trim(),
      email: inquiry.email,
      courseName: inquiry.courseName,
      url,
      agendaLines: inviteAgendaLines(),
    });
    await prisma.courseInquiry.update({ where: { id: inquiry.id }, data: { callInviteSentAt: new Date() } });
    return { sent: true, url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[call-invite] send failed:', error);
    return { sent: false, url, error };
  }
}

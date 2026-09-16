// CALL_SCHEDULING_SPEC SC-2 §1 — the "pick a call time" invite.
//
// One token per inquiry (CourseInquiry.callInviteToken), regenerated on resend,
// 21 days to book. After a call is booked the token keeps working as the
// manage link (reschedule / cancel) until the call is logged — the email link
// always lands somewhere useful.
import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import { sendCallInviteEmail, sendCallReminderEmail } from './email';
import { rateLimit } from './rate-limit';
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
 * SC-3 §3: the "talking tomorrow" reminder. Runs on the hourly cron; picks up
 * every scheduled discovery call 23.5–24.5 h out, so each call is seen by
 * exactly one run. The RateLimit table is the belt on top: one reminder per
 * call, ever, even if the cron fires twice.
 */
export async function sendCallReminders(now: Date = new Date()): Promise<{ due: number; sent: number; failed: number; skipped: number }> {
  const from = new Date(now.getTime() + 23.5 * 3600_000);
  const to = new Date(now.getTime() + 24.5 * 3600_000);
  const calls = await prisma.call.findMany({
    where: { kind: 'discovery', outcome: 'scheduled', scheduledAt: { gte: from, lt: to }, inquiryId: { not: null } },
    select: {
      id: true, scheduledAt: true, direction: true, phone: true,
      inquiry: { select: { contactName: true, email: true, courseName: true, callInviteToken: true, status: true } },
    },
  });
  const out = { due: calls.length, sent: 0, failed: 0, skipped: 0 };
  for (const c of calls) {
    if (!c.inquiry?.email) { out.skipped++; continue; }
    if (!(await rateLimit(`callreminder:${c.id}`, 1, 7 * 86_400))) { out.skipped++; continue; }
    try {
      await sendCallReminderEmail({
        contactName: c.inquiry.contactName, email: c.inquiry.email, courseName: c.inquiry.courseName,
        scheduledAt: c.scheduledAt, direction: c.direction, phone: c.phone,
        manageUrl: c.inquiry.callInviteToken ? inviteUrl(c.inquiry.callInviteToken) : null,
      });
      out.sent++;
    } catch (err) { out.failed++; console.error(`[call-reminder] ${c.id} failed:`, err); }
  }
  console.log('[cron/hourly] call reminders', out);
  return out;
}

/**
 * Issue + email the invite. A send failure never fails the caller: the token
 * is still set (the confirmation email can still point at it) and
 * callInviteSentAt stays null so the admin side can say "invite not sent".
 */
export async function sendCallInvite(inquiry: { id: string; firstName?: string | null; contactName: string; email: string; courseName: string }): Promise<InviteSendResult> {
  const { url } = await issueCallInvite(inquiry.id);
  return deliverCallInvite(inquiry, url);
}

/** The email half on its own — for callers that minted the token first and must not wait on Resend. */
export async function deliverCallInvite(inquiry: { id: string; firstName?: string | null; contactName: string; email: string; courseName: string }, url: string): Promise<InviteSendResult> {
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

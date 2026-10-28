// BRAIN-1b (Cam 2026-10-22): the record of every email and text GreenReserve
// sends — for the course timeline ("Booking confirmation sent to sam@…"). The
// email choke point (lib/email.ts getResend) and lib/twilio.ts call logSent
// once per send. Only the kind, the recipient and the ids are kept, never a
// subject or body: some carry sign-in codes.
//
// Awaited by callers (a route's un-awaited write dies with the function) and
// never throws: a failed log line must not turn a delivered email into an error.
import { prisma } from './prisma';

/** What a sender knows about its message. `kind` names the email or text. */
export type SendMeta = {
  kind: string;
  courseId?: string | null;
  courseSlug?: string | null;
  bookingId?: string | null;
  inquiryId?: string | null;
};

export async function logSent(e: SendMeta & {
  channel: 'email' | 'sms';
  to: string | string[] | undefined;
  status: 'sent' | 'failed' | 'skipped';
  providerId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    let courseId = e.courseId ?? null;
    if (!courseId && e.bookingId) {
      courseId = (await prisma.booking.findUnique({ where: { id: e.bookingId }, select: { courseId: true } }))?.courseId ?? null;
    }
    if (!courseId && e.courseSlug) {
      courseId = (await prisma.course.findUnique({ where: { slug: e.courseSlug }, select: { id: true } }))?.id ?? null;
    }
    const recipients = (Array.isArray(e.to) ? e.to : [e.to ?? '']).map(t => String(t).trim().toLowerCase()).filter(Boolean);
    await prisma.sentMessage.createMany({
      data: (recipients.length ? recipients : ['']).slice(0, 50).map(to => ({
        channel: e.channel, kind: e.kind.slice(0, 80), to: to.slice(0, 200),
        courseId, bookingId: e.bookingId ?? null, inquiryId: e.inquiryId ?? null,
        status: e.status, providerId: (e.providerId ?? '').slice(0, 100), error: (e.error ?? '').slice(0, 500),
      })),
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sent_message.log_failed', kind: e.kind, error: err instanceof Error ? err.message : String(err) }));
  }
}

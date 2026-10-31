// Launch walk (Cam 2026-10-31): an email to a course in the pipeline that fails used to be only a
// server log line. Its failure is now an event on the inquiry's timeline, where the employee looks
// ("Email didn't send: …"), for the sends that run after a public response (inquiry confirmation,
// the copy of the setup sheet). Never throws.
import { prisma } from './prisma';

export async function noteEmailFailed(inquiryId: string, what: string, err: unknown): Promise<void> {
  console.error(JSON.stringify({ ev: 'inquiry.email.fail', inquiryId, what, error: err instanceof Error ? err.message : String(err) }));
  try {
    const inq = await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { status: true } });
    if (!inq) return;
    const why = (err instanceof Error ? err.message : String(err)).slice(0, 120);
    await prisma.inquiryStatusEvent.create({ data: { inquiryId, fromStatus: inq.status, toStatus: inq.status, trigger: 'system', actorName: `Email didn’t send: ${what} (${why})`.slice(0, 250) } });
  } catch { /* the log line above is the fallback */ }
}

// Revenue page (Cam 2026-11-15): every event invoice (pay link or recorded payment toward an
// event) across the course's events, for Payments (paid in the range) and Pending (still open,
// whatever the range). Read-only. Sending one again is the existing action on the event's own
// route (POST /api/operator/events/[id]/payments { action: 'resend' }, "Run events"); the pay
// link's token is never returned here.
import { prisma } from './prisma';
import { addDaysStr } from './course-time';
import { dayStart } from './ledger-view';
import { isPlaceholderEmail } from './email';

export type EventInvoice = {
  id: string; eventId: string; eventName: string; eventDate: string;
  label: string; kind: string; method: string; status: string;
  amountCents: number; feeCents: number; refundedCents: number;
  payerName: string; createdAt: string; paidAt: string | null;
  /** An unpaid pay link with somewhere to send it (and the viewer may send it). */
  canResend: boolean; resendVia: ('email' | 'sms')[];
};

const MAX = 2_000;

export async function eventInvoices(courseId: string, tz: string, range: { from: string; to: string }, opts: { mayResend: boolean }): Promise<{ open: EventInvoice[]; paid: EventInvoice[]; truncated: boolean }> {
  const from = dayStart(tz, range.from), to = dayStart(tz, addDaysStr(range.to, 1));
  const rows = await prisma.courseEventPayment.findMany({
    where: { courseId, OR: [{ status: { in: ['open', 'paying'] } }, { status: 'paid', paidAt: { gte: from, lt: to } }] },
    orderBy: { createdAt: 'desc' }, take: MAX + 1,
    select: { id: true, eventId: true, label: true, kind: true, method: true, status: true, amountCents: true, feeCents: true, refundedCents: true, payerName: true, payerEmail: true, payerPhone: true, createdAt: true, paidAt: true, groupKey: true, player: { select: { status: true } }, event: { select: { name: true, date: true, status: true } } },
  });
  // A sign-up page checkout (groupKey) is a card checkout behind a 30-minute hold, not an invoice: while held it
  // is mid-checkout, and once the hold runs out it is dead (voided only when the event's page next loads). It is
  // pending only if its players were put on the list without paying (status 'in').
  const live = rows.slice(0, MAX).filter(r => r.status === 'paid' || !r.groupKey || r.player?.status === 'in');
  const out = live.map((r): EventInvoice => {
    const via: ('email' | 'sms')[] = [];
    if (r.payerEmail && !isPlaceholderEmail(r.payerEmail)) via.push('email');
    if (r.payerPhone.replace(/\D/g, '').length >= 10) via.push('sms');
    const resendable = opts.mayResend && r.status === 'open' && r.method === 'link' && r.event.status === 'planned' && via.length > 0;
    return {
      id: r.id, eventId: r.eventId, eventName: r.event.name, eventDate: r.event.date,
      label: r.label, kind: r.kind, method: r.method, status: r.status,
      amountCents: r.amountCents, feeCents: r.feeCents, refundedCents: r.refundedCents,
      payerName: r.payerName, createdAt: r.createdAt.toISOString(), paidAt: r.paidAt?.toISOString() ?? null,
      canResend: resendable, resendVia: resendable ? via : [],
    };
  });
  return { open: out.filter(x => x.status !== 'paid'), paid: out.filter(x => x.status === 'paid'), truncated: rows.length > MAX };
}

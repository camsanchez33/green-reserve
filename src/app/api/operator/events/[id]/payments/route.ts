import { optInAndConfirm } from '@/lib/sms-consent';
import { SMS_NO_CONSENT_STAFF } from '@/lib/sms-consent-copy';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { recordCoursePayment, createPayLink, settleOpenPayment, refundPayment, sendRefund } from '@/lib/event-payments';
import { rateLimit } from '@/lib/rate-limit';
import { sendSms, SmsNoConsentError } from '@/lib/twilio';
import { normalizePhone } from '@/lib/golfer-otp';
import { sendEventPayLinkEmail, isPlaceholderEmail } from '@/lib/email';
import { formatTeeDay } from '@/lib/format';

// W2-9b: money toward an event. Taking payments and sending pay links needs
// "Run events" (Cam 2026-10-22); refunding also needs "Issue refunds". Every
// call is a write, so the current agreement is required too (AG-3 §3). The
// payment is always looked up through the event, and the event through the
// session's course.

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Text or email a pay link. Never throws; says what went wrong. */
async function sendLink(courseId: string, p: { id: string; payToken: string; label: string; amountCents: number; feeCents: number; payerName: string; payerEmail: string; payerPhone: string },
  event: { name: string; date: string; terms: string }, courseName: string, via: 'sms' | 'email', replyTo: string): Promise<string | null> {
  if (!(await rateLimit(`event-link:course:${courseId}`, 60, 3600))) return 'Too many pay links this hour — try again later.';
  if (!(await rateLimit(`event-link:payment:${p.id}`, 5, 3600))) return 'This link has been sent 5 times this hour.';
  const payUrl = `${process.env.NEXT_PUBLIC_URL}/pay/event/${p.id}?token=${p.payToken}`;
  const total = `$${((p.amountCents + p.feeCents) / 100).toFixed(2)}`;
  try {
    if (via === 'sms') {
      if (p.payerPhone.replace(/\D/g, '').length < 10) return 'Add a mobile number to text the link.';
      const to = normalizePhone(p.payerPhone);
      if (!to.startsWith('+1')) return 'Pay links can only be texted to US and Canadian numbers — email it instead.';
      await sendSms(to, `${courseName}: ${p.label} for ${event.name}, ${total}. Pay here (Apple Pay, Google Pay or card): ${payUrl} Reply STOP to opt out.`, { kind: 'event_pay_link_text', courseId });
    } else {
      if (!p.payerEmail || isPlaceholderEmail(p.payerEmail)) return 'Add an email address to send the link.';
      await sendEventPayLinkEmail({ courseId, email: p.payerEmail, name: p.payerName, courseName, replyTo, eventName: event.name, dateLabel: formatTeeDay(event.date), label: p.label, amountCents: p.amountCents, feeCents: p.feeCents, payUrl, terms: event.terms });
    }
    return null;
  } catch (err) {
    if (err instanceof SmsNoConsentError) return SMS_NO_CONSENT_STAFF;
    return `The ${via === 'sms' ? 'text' : 'email'} didn’t send (${err instanceof Error ? err.message : 'unknown error'}).`;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveDashboardSession();
  if (!session) return bad('Unauthorized', 401);
  { const denied = requirePermission(session, 'events.manage'); if (denied) return denied; }
  const { id } = await params;
  const courseId = session.courseId;
  const event = await prisma.courseEvent.findFirst({ where: { id, courseId }, select: { id: true, name: true, date: true, terms: true, status: true, course: { select: { name: true, stripeAccountId: true, stripeAccountActive: true } } } });
  if (!event) return bad('Event not found', 404);
  const agreementBlock = await requireAgreementCurrent(courseId); if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const paymentId = String(body.paymentId ?? '');
  // Every action on an existing payment: it must belong to this event.
  const own = paymentId ? await prisma.courseEventPayment.findFirst({ where: { id: paymentId, eventId: id, courseId } }) : null;
  if (paymentId && !own) return bad('That payment is gone — refresh the page.', 404);

  try {
    switch (body.action) {
      case 'record': {
        // Events audit 23: saying money was taken (check, cash, card elsewhere) is a counter-payment power, not just "Run events".
        { const denied = requirePermission(session, 'sheet.counter_payment'); if (denied) return denied; }
        const r = await recordCoursePayment(courseId, id, body, session.email);
        if (!r.ok) return bad(r.error, r.status);
        return NextResponse.json({ ok: true });
      }
      case 'link': {
        if (!event.course.stripeAccountId || !event.course.stripeAccountActive) return bad('Connect Stripe in Settings before sending pay links — or record the payment when it’s taken at the course.', 409);
        const r = await createPayLink(courseId, id, body, session.email);
        if (!r.ok) return bad(r.error, r.status);
        const via = body.via === 'sms' ? 'sms' : body.via === 'email' ? 'email' : null;
        const payUrl = `${process.env.NEXT_PUBLIC_URL}/pay/event/${r.value.id}?token=${r.value.payToken}`;
        if (!via) return NextResponse.json({ ok: true, payUrl, sent: null });
        const p = await prisma.courseEventPayment.findUniqueOrThrow({ where: { id: r.value.id } });
        // SMS-1: staff read the script and the payer said yes — record it (verbal) before the link goes.
        if (via === 'sms' && body.smsConsent === 'verbal' && p.payerPhone) await optInAndConfirm(p.payerPhone, { method: 'verbal', courseId, recordedBy: session.staffId ?? `operator:${session.operatorId}` });
        const err = await sendLink(courseId, p, event, event.course.name, via, session.email);
        // The link exists either way; say if it didn't send so staff can copy it instead.
        return NextResponse.json({ ok: true, payUrl, sent: err ? null : via, sendError: err });
      }
      case 'resend': {
        if (!own || own.status !== 'open') return bad('Only an unpaid link can be sent again.', 409);
        const via = body.via === 'sms' ? 'sms' : 'email';
        if (via === 'sms' && body.smsConsent === 'verbal' && own.payerPhone) await optInAndConfirm(own.payerPhone, { method: 'verbal', courseId, recordedBy: session.staffId ?? `operator:${session.operatorId}` });
        const err = await sendLink(courseId, own, event, event.course.name, via, session.email);
        if (err) return bad(err, 502);
        return NextResponse.json({ ok: true, sent: via });
      }
      case 'void': case 'paid_other': {
        if (!own) return bad('Pick a payment.');
        if (body.action === 'paid_other') { const denied = requirePermission(session, 'sheet.counter_payment'); if (denied) return denied; }
        const r = await settleOpenPayment(courseId, own.id, body.action === 'void' ? 'void' : { method: String(body.method ?? '') });
        if (!r.ok) return bad(r.error, r.status);
        return NextResponse.json({ ok: true });
      }
      case 'refund': case 'refund_retry': {
        { const denied = requirePermission(session, 'money.refund'); if (denied) return denied; }
        if (body.action === 'refund') {
          if (!own) return bad('Pick a payment.');
          const r = await refundPayment(courseId, own.id, { amount: body.amount, reason: body.reason }, session.email);
          if (!r.ok) return bad(r.error, r.status);
          return NextResponse.json({ ok: true, refund: r.value.status });
        }
        const refundId = String(body.refundId ?? '');
        const ref = await prisma.courseEventRefund.findFirst({ where: { id: refundId, payment: { eventId: id, courseId } }, select: { id: true } });
        if (!ref) return bad('That refund is gone — refresh the page.', 404);
        const r = await sendRefund(courseId, ref.id);
        if (!r.ok) return bad(r.error, r.status);
        return NextResponse.json({ ok: true, refund: r.value.status });
      }
      default:
        return bad('Unknown action.');
    }
  } catch (err) {
    // A Stripe or network failure while stopping a link: nothing was changed here.
    console.error(JSON.stringify({ ev: 'event_payment.route.fail', eventId: id, action: String(body.action), error: err instanceof Error ? err.message : String(err) }));
    return bad('Stripe didn’t answer — nothing was changed. Try again in a moment.', 502);
  }
}

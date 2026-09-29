// CAL-1 — Cal.com booking webhook. Turns a course's Cal.com booking into the
// inquiry's discovery Call, so /admin shows it exactly as it showed calls
// booked on the Google grid. Register in Cal.com → Settings → Developer →
// Webhooks: this URL, triggers Booking Created / Rescheduled / Cancelled, and
// the same secret as CALCOM_WEBHOOK_SECRET.
//
// Emails are Cal.com's job in this mode (it confirms to both sides), so none
// are sent here. Every branch answers 200 once the signature is good: a 4xx
// makes Cal.com retry a payload that will never apply (a test ping, a booking
// made straight on Cal.com without an invite link).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCalcomSignature, calcomCreatedBy } from '@/lib/calcom';
import { defaultAgenda, parseJson } from '@/lib/inquiry-call';

type Attendee = { name?: string; email?: string; phoneNumber?: string | null };
type Payload = {
  uid?: string;
  startTime?: string;
  endTime?: string;
  attendees?: Attendee[];
  responses?: { attendeePhoneNumber?: { value?: string } | string };
  metadata?: Record<string, unknown>;
  rescheduleUid?: string;
};

const fmtWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

async function timeline(inquiryId: string, status: string, text: string) {
  await prisma.inquiryStatusEvent.create({
    data: { inquiryId, fromStatus: status, toStatus: status, trigger: 'course', actorName: text },
  }).catch(err => console.error('Cal.com timeline event failed:', err));
}

function phoneOf(p: Payload, fallback: string): string {
  const r = p.responses?.attendeePhoneNumber;
  const fromResponses = typeof r === 'string' ? r : r?.value;
  const raw = p.attendees?.[0]?.phoneNumber || fromResponses || fallback;
  return String(raw).replace(/[^0-9+()\-. x]/g, '').trim().slice(0, 40);
}

export async function POST(req: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CALCOM_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  const raw = await req.text();
  if (!verifyCalcomSignature(raw, req.headers.get('x-cal-signature-256'), secret)) {
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 });
  }

  let body: { triggerEvent?: string; payload?: Payload };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ignored: 'unparseable' }); }
  const event = body.triggerEvent ?? '';
  const p = body.payload ?? {};
  const uid = typeof p.uid === 'string' ? p.uid : '';

  if (event === 'BOOKING_CANCELLED') {
    if (!uid) return NextResponse.json({ ignored: 'no uid' });
    const call = await prisma.call.findFirst({
      where: { createdBy: calcomCreatedBy(uid), outcome: 'scheduled' },
      select: { id: true, scheduledAt: true, inquiry: { select: { id: true, status: true } } },
    });
    if (!call) return NextResponse.json({ ignored: 'no matching call' });
    await prisma.call.update({ where: { id: call.id }, data: { outcome: 'cancelled', completedAt: new Date() } });
    if (call.inquiry) await timeline(call.inquiry.id, call.inquiry.status, `Course cancelled the call set for ${fmtWhen(call.scheduledAt)} (Cal.com)`);
    return NextResponse.json({ ok: true });
  }

  if (event !== 'BOOKING_CREATED' && event !== 'BOOKING_RESCHEDULED') {
    return NextResponse.json({ ignored: event || 'no triggerEvent' });
  }

  const start = p.startTime ? new Date(p.startTime) : null;
  const end = p.endTime ? new Date(p.endTime) : null;
  if (!uid || !start || Number.isNaN(start.getTime())) return NextResponse.json({ ignored: 'no uid or start' });
  const durationMin = end && !Number.isNaN(end.getTime()) ? Math.max(5, Math.round((end.getTime() - start.getTime()) / 60_000)) : 30;

  const token = typeof p.metadata?.invite === 'string' ? p.metadata.invite : '';
  const inq = /^[a-f0-9]{48}$/.test(token)
    ? await prisma.courseInquiry.findUnique({
        where: { callInviteToken: token },
        // Everything defaultAgenda reads — its type has these optional, so a
        // narrower select would compile and silently mark answered items open.
        select: {
          id: true, status: true, phone: true, detailsJson: true, needsJson: true,
          greenFeeRange: true, teeTimesPerDay: true, currentBookingMethod: true,
          hasResidentPricing: true, hasMemberPricing: true, hasCaddies: true, callSkippedReason: true,
        },
      })
    : null;

  // Idempotent: Cal.com retries, and a retry of an applied booking is a no-op.
  const already = await prisma.call.findFirst({ where: { createdBy: calcomCreatedBy(uid) }, select: { id: true } });
  if (already) return NextResponse.json({ ok: true, duplicate: true });

  // The call this booking replaces: the rescheduled Cal.com booking, else the
  // inquiry's current scheduled discovery call (a course re-booking fresh).
  const previous = await prisma.call.findFirst({
    where: {
      outcome: 'scheduled',
      OR: [
        ...(p.rescheduleUid ? [{ createdBy: calcomCreatedBy(p.rescheduleUid) }] : []),
        ...(inq ? [{ inquiryId: inq.id, kind: 'discovery' }] : []),
      ],
    },
    orderBy: { scheduledAt: 'desc' },
    select: { id: true, scheduledAt: true, inquiryId: true, phone: true },
  });

  const inquiryId = inq?.id ?? previous?.inquiryId ?? null;
  if (!inquiryId) return NextResponse.json({ ignored: 'no invite metadata' });
  const status = inq?.status ?? (await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { status: true } }))?.status ?? '';
  // A move keeps the number already on the call unless Cal.com sends a new one.
  const phone = phoneOf(p, previous?.phone || inq?.phone || '');

  if (previous) {
    await prisma.call.update({
      where: { id: previous.id },
      data: { scheduledAt: start, durationMin, phone, createdBy: calcomCreatedBy(uid) },
    });
    await timeline(inquiryId, status, `Course moved the call to ${fmtWhen(start)} (Cal.com)`);
    return NextResponse.json({ ok: true, moved: previous.id });
  }

  const agendaKeys = inq ? defaultAgenda(inq, parseJson(inq.detailsJson, null), parseJson(inq.needsJson, null)) : [];
  const created = await prisma.call.create({
    data: {
      kind: 'discovery', inquiryId, scheduledAt: start, durationMin, direction: 'we_call', phone,
      agendaJson: JSON.stringify(agendaKeys), bookedByCourse: true, createdBy: calcomCreatedBy(uid),
    },
    select: { id: true },
  });
  await timeline(inquiryId, status, `Course booked a call for ${fmtWhen(start)} (Cal.com)`);
  return NextResponse.json({ ok: true, created: created.id });
}

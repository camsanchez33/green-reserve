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
import { ALIVE_STATUSES } from '@/lib/inquiry-status';

type Attendee = { name?: string; email?: string; phoneNumber?: string | null };
type Payload = {
  uid?: string;
  startTime?: string;
  endTime?: string;
  attendees?: Attendee[];
  responses?: { attendeePhoneNumber?: { value?: string } | string } & Record<string, unknown>;
  metadata?: Record<string, unknown>;
  rescheduleUid?: string;
};

const fmtWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

async function timeline(inquiryId: string, status: string, text: string) {
  await prisma.inquiryStatusEvent.create({
    data: { inquiryId, fromStatus: status, toStatus: status, trigger: 'course', actorName: text },
  }).catch(err => console.error('Cal.com timeline event failed:', err));
}

/** A booking-form answer by any of its likely keys; Cal.com sends `{ value }` or a bare string. */
function answerOf(p: Payload, keys: string[]): string {
  const r = (p.responses ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    const s = typeof v === 'string' ? v : (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'string') ? (v as { value: string }).value : '';
    if (s.trim()) return s.trim().slice(0, 200);
  }
  return '';
}

function phoneOf(p: Payload, fallback: string): string {
  const r = p.responses?.attendeePhoneNumber;
  const fromResponses = typeof r === 'string' ? r : r?.value;
  const raw = p.attendees?.[0]?.phoneNumber || fromResponses || fallback;
  return String(raw).replace(/[^0-9+()\-. x]/g, '').trim().slice(0, 40);
}

export async function POST(req: NextRequest) {
  // Trimmed: a trailing newline pasted into Vercel made every signature fail.
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
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
  // Everything defaultAgenda reads — its type has these optional, so a
  // narrower select would compile and silently mark answered items open.
  const INQ_SELECT = {
    id: true, status: true, phone: true, detailsJson: true, needsJson: true,
    greenFeeRange: true, teeTimesPerDay: true, currentBookingMethod: true,
    hasResidentPricing: true, hasMemberPricing: true, hasCaddies: true, callSkippedReason: true,
  } as const;
  let inq = /^[a-f0-9]{48}$/.test(token)
    ? await prisma.courseInquiry.findUnique({ where: { callInviteToken: token }, select: INQ_SELECT })
    : null;

  // FB-1: the /for-courses thanks page links the plain Cal.com booker (no
  // invite token — a per-inquiry link there leaked which courses were already
  // in the pipeline). Such a booking is matched by the attendee's email, but
  // only when that picks out exactly ONE live inquiry submitted in the last 30
  // days — anything ambiguous is left for Cam to attach by hand, as before.
  // Not for reschedules: those carry the original booking's metadata.
  if (!inq && !token && !p.rescheduleUid) {
    const email = (p.attendees?.[0]?.email || '').trim().toLowerCase();
    if (email) {
      const matches = await prisma.courseInquiry.findMany({
        where: {
          email: { equals: email, mode: 'insensitive' },
          status: { in: [...ALIVE_STATUSES] },
          createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
        select: INQ_SELECT,
        take: 2,
      });
      if (matches.length === 1) inq = matches[0];
    }
  }

  // CAL-2 (review): a closed inquiry does not get a Call row from a stale link.
  // Cal.com has already put the booking in Cam's calendar, so say so on the
  // timeline rather than dropping it silently.
  if (inq && !(ALIVE_STATUSES as readonly string[]).includes(inq.status)) {
    await timeline(inq.id, inq.status, `Course booked ${fmtWhen(start)} on Cal.com, but this inquiry is ${inq.status} — not added as a call. Cancel it in Cal.com if it should not happen.`);
    return NextResponse.json({ ignored: `inquiry ${inq.status}` });
  }

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
        // Only a call that came FROM Cal.com is ever moved by it — never one
        // an admin scheduled by hand (review: the course's booking used to take
        // that over, and a later Cal.com cancel then cancelled the admin's call).
        ...(inq ? [{ inquiryId: inq.id, kind: 'discovery', createdBy: { startsWith: 'calcom:' } }] : []),
      ],
    },
    orderBy: { scheduledAt: 'desc' },
    select: { id: true, scheduledAt: true, inquiryId: true, phone: true },
  });

  const inquiryId = inq?.id ?? previous?.inquiryId ?? null;
  if (!inquiryId) {
    // UI-H-1 (HOMEPAGE_SPEC.md §4.2): a demo booked straight from the homepage
    // (/demo → Cal.com, tagged metadata.source=homepage) — or any fresh Cal.com
    // booking that matches no inquiry — opens a pending inquiry with its call,
    // so it shows in admin instead of living only in Cam's calendar. Only a new
    // booking (never a reschedule, never an invite-token booking), and inquiry
    // + call + timeline are one transaction: the uid check above is what makes
    // a Cal.com retry a no-op, and it only holds once the Call exists.
    if (event !== 'BOOKING_CREATED' || token || p.rescheduleUid) return NextResponse.json({ ignored: 'no invite metadata' });
    const who = p.attendees?.[0] ?? {};
    const email = (who.email || '').trim().slice(0, 200);
    if (!email) return NextResponse.json({ ignored: 'no attendee email' });
    const name = (who.name || '').trim().slice(0, 120);
    const [firstName = '', ...rest] = name.split(/\s+/).filter(Boolean);
    const courseName = answerOf(p, ['courseName', 'course', 'course_name', 'golfCourse', 'golf_course']);
    const fromHome = p.metadata?.source === 'homepage';
    const phone = phoneOf(p, '');
    const made = await prisma.$transaction(async tx => {
      const inquiry = await tx.courseInquiry.create({
        data: {
          firstName, lastName: rest.join(' '), contactName: name || email, contactTitle: '', email, phone,
          courseName, address: '', city: '', state: '', zipCode: '', courseType: '', lookingFor: [],
          source: 'Demo booking',
          additionalNotes: `Booked a demo on Cal.com${fromHome ? ' from the homepage' : ''} before filling in the inquiry form.`,
        },
        select: { id: true, status: true },
      });
      const call = await tx.call.create({
        data: { kind: 'discovery', inquiryId: inquiry.id, scheduledAt: start, durationMin, direction: 'we_call', phone, bookedByCourse: true, createdBy: calcomCreatedBy(uid) },
        select: { id: true },
      });
      await tx.inquiryStatusEvent.create({
        data: { inquiryId: inquiry.id, fromStatus: inquiry.status, toStatus: inquiry.status, trigger: 'course', actorName: `Booked a demo for ${fmtWhen(start)} on Cal.com${fromHome ? ' from the homepage' : ''}` },
      });
      return { inquiry: inquiry.id, call: call.id };
    });
    return NextResponse.json({ ok: true, created: made.call, inquiry: made.inquiry });
  }
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

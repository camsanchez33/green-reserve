// CALL_SCHEDULING_SPEC SC-2 §2 — the public "pick a call time" endpoint.
//
// Token-gated, no session. GET returns the open grid (or the honest fallback
// when Google cannot be read); POST books, reschedules or cancels. Every slot
// is re-verified server-side before a Call is written — a slot that has gone
// answers 409 slot_taken and the page reloads its grid.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { openSlots, HORIZON_DAYS, SLOT_MINUTES, fmtSlotDay, type CallPreference } from '@/lib/call-availability';
import { calendarConfigured, busyBlocks, createCallEvent, moveCallEvent, deleteCallEvent } from '@/lib/google-calendar';
import { AGENDA, defaultAgenda, parseJson } from '@/lib/inquiry-call';
import { inviteAgendaLines, inviteUrl } from '@/lib/call-invite';
import { sendCallBookedEmail, sendCallBookedAdminEmail, sendCalendarUnavailableAlert } from '@/lib/email';
import { ALIVE_STATUSES } from '@/lib/inquiry-status';

const SELECT = {
  id: true, status: true, courseName: true, contactName: true, firstName: true, email: true, phone: true,
  needsJson: true, detailsJson: true, greenFeeRange: true, teeTimesPerDay: true, currentBookingMethod: true,
  hasResidentPricing: true, hasMemberPricing: true, hasCaddies: true, callSkippedReason: true,
  callInviteToken: true, callInviteExpiresAt: true,
} as const;

type Inq = NonNullable<Awaited<ReturnType<typeof loadInquiry>>>;

async function loadInquiry(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return prisma.courseInquiry.findUnique({ where: { callInviteToken: token }, select: SELECT });
}

async function scheduledCall(inquiryId: string) {
  return prisma.call.findFirst({
    where: { inquiryId, kind: 'discovery', outcome: 'scheduled' },
    orderBy: { scheduledAt: 'desc' },
    select: { id: true, scheduledAt: true, durationMin: true, direction: true, phone: true, gcalEventId: true, bookedByCourse: true },
  });
}

function preferenceOf(inq: Inq): CallPreference {
  const needs = parseJson<{ callPreference?: { times?: string[]; days?: string[] } }>(inq.needsJson, {});
  return needs.callPreference ?? null;
}

/** All scheduled calls of either kind that could collide inside the horizon. */
async function blockingCalls(now: Date, excludeId?: string) {
  const horizon = new Date(now.getTime() + (HORIZON_DAYS + 1) * 86_400_000);
  const rows = await prisma.call.findMany({
    where: { outcome: 'scheduled', scheduledAt: { gte: new Date(now.getTime() - 4 * 3600_000), lte: horizon }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, scheduledAt: true, durationMin: true, outcome: true },
  });
  return rows;
}

async function grid(inq: Inq, now: Date, excludeCallId?: string) {
  if (!calendarConfigured()) return { unavailable: true as const, days: [] };
  let busy;
  try { busy = await busyBlocks(now, new Date(now.getTime() + (HORIZON_DAYS + 1) * 86_400_000)); }
  catch (err) {
    // S5: never show unverified slots. Tell Cam, once an hour per inquiry.
    if (await rateLimit(`calalert:${inq.id}`, 1, 3600)) {
      sendCalendarUnavailableAlert({ courseName: inq.courseName, inquiryId: inq.id, error: err instanceof Error ? err.message : String(err) })
        .catch(e => console.error('Calendar alert email failed:', e));
    }
    return { unavailable: true as const, days: [] };
  }
  const calls = await blockingCalls(now, excludeCallId);
  const days = openSlots(now, busy, calls, preferenceOf(inq)).map(d => ({
    date: d.date, label: fmtSlotDay(d.date),
    preferred: d.preferred.map(s => s.toISOString()), other: d.other.map(s => s.toISOString()),
  }));
  return { unavailable: false as const, days };
}

function inviteState(inq: Inq, booked: { id: string } | null) {
  // A declined or archived inquiry reads as an expired link — the decline
  // email is written on the same principle: nothing is revealed by this page.
  if (!ALIVE_STATUSES.includes(inq.status as (typeof ALIVE_STATUSES)[number])) return 'expired';
  if (booked) return 'ok';
  if (!inq.callInviteExpiresAt || inq.callInviteExpiresAt.getTime() < Date.now()) return 'expired';
  return 'ok';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!(await rateLimit(`callpage:${evidentiaryIp(req)}`, 60, 3600))) {
    return NextResponse.json({ error: 'Too many requests — try again in a little while.' }, { status: 429 });
  }
  const { token } = await params;
  const inq = await loadInquiry(token);
  if (!inq) return NextResponse.json({ error: 'invalid' }, { status: 404 });
  const booked = await scheduledCall(inq.id);
  const state = inviteState(inq, booked);
  if (state !== 'ok') return NextResponse.json({ error: state }, { status: 410 });
  const now = new Date();
  const g = booked ? { unavailable: false as const, days: [] } : await grid(inq, now);
  return NextResponse.json({
    courseName: inq.courseName,
    contactFirst: (inq.firstName || inq.contactName.split(' ')[0] || '').trim(),
    phone: booked?.phone || inq.phone,
    durationMin: SLOT_MINUTES,
    agendaLines: inviteAgendaLines(),
    booked: booked ? { scheduledAt: booked.scheduledAt.toISOString(), durationMin: booked.durationMin, direction: booked.direction, phone: booked.phone } : null,
    calendarUnavailable: g.unavailable,
    days: g.days,
  });
}

async function slotIsOpen(inq: Inq, startsAt: Date, now: Date, excludeCallId?: string): Promise<boolean | 'unavailable'> {
  const g = await grid(inq, now, excludeCallId);
  if (g.unavailable) return 'unavailable';
  const iso = startsAt.toISOString();
  return g.days.some(d => d.preferred.includes(iso) || d.other.includes(iso));
}

async function timeline(inquiryId: string, status: string, text: string) {
  await prisma.inquiryStatusEvent.create({
    data: { inquiryId, fromStatus: status, toStatus: status, trigger: 'course', actorName: text },
  }).catch(err => console.error('Call timeline event failed:', err));
}

const fmtWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!(await rateLimit(`callbook:${evidentiaryIp(req)}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many attempts — try again in a little while.' }, { status: 429 });
  }
  const { token } = await params;
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; if (!body || typeof body !== 'object') throw new Error(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const inq = await loadInquiry(token);
  if (!inq) return NextResponse.json({ error: 'invalid' }, { status: 404 });
  // Per-inquiry cap as well as per-IP: one link cannot churn book/cancel to
  // mail hello@ and write Google on every cycle.
  if (!(await rateLimit(`callbook:inq:${inq.id}`, 8, 86_400))) {
    return NextResponse.json({ error: 'That link has been used a lot today — reply to the email and we will sort it by hand.' }, { status: 429 });
  }
  const booked = await scheduledCall(inq.id);
  const state = inviteState(inq, booked);
  if (state !== 'ok') return NextResponse.json({ error: state }, { status: 410 });

  const action = String(body.action ?? '');
  const now = new Date();
  const phone = typeof body.phone === 'string'
    ? body.phone.replace(/[^0-9+()\-. x]/g, '').trim().slice(0, 40)
    : (booked?.phone || inq.phone);
  const direction = body.direction === 'they_call' ? 'they_call' : 'we_call';
  const agendaKeys = defaultAgenda(inq, parseJson(inq.detailsJson, null), parseJson(inq.needsJson, null));
  const agendaLabels = AGENDA.filter(a => agendaKeys.includes(a.key)).map(a => a.label);
  const manageUrl = inviteUrl(token);

  // ── cancel ──────────────────────────────────────────────────────────
  if (action === 'cancel') {
    if (!booked) return NextResponse.json({ error: 'Nothing is booked.' }, { status: 409 });
    await prisma.call.update({ where: { id: booked.id }, data: { outcome: 'cancelled', completedAt: now } });
    await timeline(inq.id, inq.status, `Course cancelled the call set for ${fmtWhen(booked.scheduledAt)}`);
    if (booked.gcalEventId) await deleteCallEvent(booked.gcalEventId);
    const emails = await notify('cancelled', inq, { scheduledAt: booked.scheduledAt, durationMin: booked.durationMin, direction: booked.direction, phone: booked.phone, id: booked.id }, agendaLabels, manageUrl);
    return NextResponse.json({ success: true, ...emails });
  }

  // ── book / reschedule ───────────────────────────────────────────────
  if (action !== 'book' && action !== 'reschedule') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  if (action === 'book' && booked) return NextResponse.json({ error: 'already_booked' }, { status: 409 });
  if (action === 'reschedule' && !booked) return NextResponse.json({ error: 'Nothing is booked.' }, { status: 409 });
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'Pick a time.' }, { status: 400 });

  const open = await slotIsOpen(inq, startsAt, now, action === 'reschedule' ? booked!.id : undefined);
  if (open === 'unavailable') return NextResponse.json({ error: 'calendar_unavailable' }, { status: 503 });
  if (!open) return NextResponse.json({ error: 'slot_taken' }, { status: 409 });

  let callId: string; let gcalEventId: string | null = null;
  // Book and reschedule share one guarded write: a SERIALIZABLE transaction
  // that re-reads every scheduled call in the window and tests overlap against
  // each, so two confirmations of the same slot cannot both land (a
  // serialization failure is answered as slot_taken, like a plain clash).
  const durationForWrite = action === 'book' ? SLOT_MINUTES : booked!.durationMin;
  let written: { id: string } | null;
  try {
    written = await prisma.$transaction(async tx => {
      const end = new Date(startsAt.getTime() + durationForWrite * 60_000);
      const nearby = await tx.call.findMany({
        where: {
          outcome: 'scheduled',
          scheduledAt: { lt: end, gte: new Date(startsAt.getTime() - 4 * 3600_000) },
          ...(action === 'reschedule' ? { id: { not: booked!.id } } : {}),
        },
        select: { id: true, scheduledAt: true, durationMin: true },
      });
      const clash = nearby.some(c => new Date(c.scheduledAt).getTime() + (c.durationMin || SLOT_MINUTES) * 60_000 > startsAt.getTime());
      if (clash) return null;
      if (action === 'book') {
        return tx.call.create({
          data: {
            kind: 'discovery', inquiryId: inq.id, scheduledAt: startsAt, durationMin: SLOT_MINUTES, direction, phone,
            agendaJson: JSON.stringify(agendaKeys), bookedByCourse: true, createdBy: 'course',
          },
          select: { id: true },
        });
      }
      return tx.call.update({ where: { id: booked!.id }, data: { scheduledAt: startsAt, phone, direction }, select: { id: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    // P2034: the database refused to serialize two writes racing for the slot.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') written = null;
    else throw err;
  }
  if (!written) return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
  callId = written.id;
  if (action === 'book') {
    await timeline(inq.id, inq.status, `Course booked a call for ${fmtWhen(startsAt)}`);
    gcalEventId = await createCallEvent({ id: callId, scheduledAt: startsAt, durationMin: SLOT_MINUTES, direction, phone, agendaLabels }, inq);
    if (gcalEventId) await prisma.call.update({ where: { id: callId }, data: { gcalEventId } });
  } else {
    await timeline(inq.id, inq.status, `Course moved the call to ${fmtWhen(startsAt)}`);
    if (booked!.gcalEventId) {
      const moved = await moveCallEvent(booked!.gcalEventId, startsAt, booked!.durationMin);
      gcalEventId = moved ? booked!.gcalEventId : null;
    } else {
      gcalEventId = await createCallEvent({ id: callId, scheduledAt: startsAt, durationMin: booked!.durationMin, direction, phone, agendaLabels }, inq);
      if (gcalEventId) await prisma.call.update({ where: { id: callId }, data: { gcalEventId } });
    }
  }

  // A reschedule keeps the call's real length (an admin may have booked 45 or 60).
  const durationMin = action === 'book' ? SLOT_MINUTES : booked!.durationMin;
  const emails = await notify(action === 'book' ? 'booked' : 'moved', inq, { id: callId, scheduledAt: startsAt, durationMin, direction, phone }, agendaLabels, manageUrl);
  return NextResponse.json({
    success: true,
    booked: { scheduledAt: startsAt.toISOString(), durationMin, direction, phone },
    calendarEvent: !!gcalEventId,
    ...emails,
  });
}

async function notify(
  kind: 'booked' | 'moved' | 'cancelled',
  inq: Inq,
  call: { id: string; scheduledAt: Date; durationMin: number; direction: string; phone: string },
  agendaLabels: string[],
  manageUrl: string,
) {
  const out: { courseEmailSent: boolean; adminEmailSent: boolean; emailError?: string } = { courseEmailSent: false, adminEmailSent: false };
  try {
    await sendCallBookedEmail({ kind, contactName: inq.contactName, email: inq.email, courseName: inq.courseName, callId: call.id, scheduledAt: call.scheduledAt, durationMin: call.durationMin, direction: call.direction, phone: call.phone, agendaLabels, manageUrl });
    out.courseEmailSent = true;
  } catch (err) { out.emailError = err instanceof Error ? err.message : String(err); console.error('Call booked email (course) failed:', err); }
  try {
    await sendCallBookedAdminEmail({ kind, contactName: inq.contactName, phone: call.phone, courseName: inq.courseName, inquiryId: inq.id, scheduledAt: call.scheduledAt, direction: call.direction });
    out.adminEmailSent = true;
  } catch (err) { console.error('Call booked email (admin) failed:', err); }
  return out;
}

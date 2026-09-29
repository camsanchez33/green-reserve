// The public "book a call" endpoint behind /call/[token]. Token-gated, no session.
//
// CAL-2 (Cam 2026-09-29): Cal.com is the ONLY scheduler. The Google Calendar
// grid this route used to build (SC-2) was never connected and is deleted, and
// so are this route's own book / reschedule / cancel writes: a course books,
// moves and cancels on Cal.com, and /api/calcom/webhook turns that into the
// inquiry's discovery Call. GET only reports what the page should show.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { inviteAgendaLines } from '@/lib/call-invite';
import { ALIVE_STATUSES } from '@/lib/inquiry-status';
import { calcomBookingUrl, calcomEmbedUrl, calcomManageLinks, calcomUidOf } from '@/lib/calcom';

const SLOT_MINUTES = 30;

async function loadInquiry(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return prisma.courseInquiry.findUnique({
    where: { callInviteToken: token },
    select: { id: true, status: true, courseName: true, contactName: true, firstName: true, email: true, phone: true, callInviteExpiresAt: true },
  });
}

async function scheduledCall(inquiryId: string) {
  return prisma.call.findFirst({
    where: { inquiryId, kind: 'discovery', outcome: 'scheduled' },
    orderBy: { scheduledAt: 'desc' },
    select: { scheduledAt: true, durationMin: true, direction: true, phone: true, createdBy: true },
  });
}

type Inq = NonNullable<Awaited<ReturnType<typeof loadInquiry>>>;

function inviteState(inq: Inq, booked: object | null) {
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

  const calBase = calcomBookingUrl();
  const contactFirst = (inq.firstName || inq.contactName.split(' ')[0] || '').trim();
  const bookedUid = booked ? calcomUidOf(booked.createdBy) : null;
  return NextResponse.json({
    // Cal.com's public booking page, prefilled, while nothing is booked — the
    // page sends the course straight there (Cam 2026-09-29: an embed rendered
    // blank live). metadata[invite] rides along so the webhook finds the
    // inquiry. Null when Cal.com is off: the page asks them to reply instead.
    calcomUrl: calBase && !booked
      ? calcomEmbedUrl(calBase, { token, name: inq.contactName || contactFirst, email: inq.email, phone: inq.phone })
      : null,
    // Cal.com's own reschedule / cancel pages — only for a call booked there.
    // A call Cam set up by hand has none; the page says to reply instead.
    calcomManage: bookedUid ? calcomManageLinks(bookedUid) : null,
    courseName: inq.courseName,
    contactFirst,
    phone: booked?.phone || inq.phone,
    durationMin: SLOT_MINUTES,
    agendaLines: inviteAgendaLines(),
    booked: booked ? { scheduledAt: booked.scheduledAt.toISOString(), durationMin: booked.durationMin, direction: booked.direction, phone: booked.phone } : null,
  });
}

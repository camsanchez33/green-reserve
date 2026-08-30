import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDetailsSubmittedNotification, sendDetailsSheetConfirmationEmail } from '@/lib/email';

// MP-1 fix-now #7 — a stale sheet link used to resurrect a closed inquiry.
//
// (a) The three handlers below blocked building/live/rejected but NOT
//     'archived', so the operator of an archived course could reopen their old
//     link, submit, and flip the inquiry back into the active funnel — past
//     every guarded lifecycle transition.
// (b) detailsToken never expired. There is no detailsTokenExpiry column and
//     MP-1 is a no-migration run, so the expiry is DERIVED from the ledger
//     that already records when the sheet was sent: the most recent event
//     whose toStatus is 'details_requested'. That row is written by the
//     request_details / resend_details actions, so a resend legitimately
//     restarts the clock, which is exactly the behaviour a real expiry wants.
const CLOSED_TO_SHEET = ['building', 'live', 'rejected', 'archived'];
export const DETAILS_TOKEN_TTL_DAYS = 60;

type SheetGate = { error: string; status: number } | null;

async function gateSheetAccess(inquiry: { id: string; status: string; createdAt: Date }): Promise<SheetGate> {
  if (CLOSED_TO_SHEET.includes(inquiry.status)) {
    return { error: 'This inquiry has already moved past the setup-sheet stage.', status: 409 };
  }
  const sentEvent = await prisma.inquiryStatusEvent.findFirst({
    where: { inquiryId: inquiry.id, toStatus: 'details_requested' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  // No event (pre-ledger inquiry) falls back to the inquiry's own age rather
  // than failing open — an unbounded token is the bug being fixed.
  const issuedAt = sentEvent?.createdAt ?? inquiry.createdAt;
  const ageDays = (Date.now() - issuedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays > DETAILS_TOKEN_TTL_DAYS) {
    return {
      error: 'This setup-sheet link has expired. Reply to your GreenReserve email and we will send you a fresh one.',
      status: 410,
    };
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { token, ...sectionDraft } = body;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const inquiry = await prisma.courseInquiry.findUnique({ where: { detailsToken: token as string } });
  if (!inquiry) return NextResponse.json({ error: 'Invalid link.' }, { status: 404 });
  const patchGate = await gateSheetAccess(inquiry);
  if (patchGate) return NextResponse.json({ error: patchGate.error }, { status: patchGate.status });

  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(inquiry.detailsJson || '{}'); } catch { /* empty */ }

  await prisma.courseInquiry.update({
    where: { id: inquiry.id },
    data: { detailsJson: JSON.stringify({ ...existing, ...sectionDraft }) },
  });

  return NextResponse.json({ saved: true });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const inquiry = await prisma.courseInquiry.findUnique({ where: { detailsToken: token } });
  if (!inquiry) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 404 });
  const gate = await gateSheetAccess(inquiry);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let details = {};
  try { details = inquiry.detailsJson ? JSON.parse(inquiry.detailsJson) : {}; } catch { /* ignore */ }
  let needs = {};
  try { needs = inquiry.needsJson ? JSON.parse(inquiry.needsJson) : {}; } catch { /* ignore */ }

  return NextResponse.json({
    courseName: inquiry.courseName,
    contactName: inquiry.contactName,
    courseType: inquiry.courseType,
    hasMemberPricing: inquiry.hasMemberPricing,
    hasResidentPricing: inquiry.hasResidentPricing,
    hasCaddies: inquiry.hasCaddies,
    needs,
    details,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, ...details } = body;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const inquiry = await prisma.courseInquiry.findUnique({ where: { detailsToken: token } });
  if (!inquiry) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 404 });
  const gate = await gateSheetAccess(inquiry);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Support both old format (nested schedule) and new flat format
  const sch = (details.schedule ?? {}) as Record<string, unknown>;
  const wdFee = details.greenFeeWeekday ?? sch.greenFeeWeekday;
  const weFee = details.greenFeeWeekend ?? sch.greenFeeWeekend;
  const firstTee = details.firstTeeTime ?? sch.startTime;
  const lastTee = details.lastTeeTime ?? sch.endTime;
  const missing: string[] = [];
  if (wdFee === '' || wdFee == null) missing.push('weekday green fee');
  if (weFee === '' || weFee == null) missing.push('weekend green fee');
  if (!firstTee) missing.push('first tee time');
  if (!lastTee) missing.push('last tee time');
  if (missing.length > 0) {
    return NextResponse.json({ error: `Please complete your tee sheet schedule before submitting: ${missing.join(', ')}.` }, { status: 400 });
  }

  await prisma.courseInquiry.update({
    where: { id: inquiry.id },
    data: { detailsJson: JSON.stringify(details), status: 'details_submitted' },
  });

  await prisma.inquiryStatusEvent.create({
    data: {
      inquiryId: inquiry.id,
      fromStatus: inquiry.status,
      toStatus: 'details_submitted',
      trigger: 'course',
      actorName: 'Course submitted their setup sheet',
    },
  });

  sendDetailsSubmittedNotification({
    courseName: inquiry.courseName,
    contactName: inquiry.contactName,
  }).catch(err => console.error('Details submitted notification failed:', err));

  sendDetailsSheetConfirmationEmail({
    firstName: inquiry.firstName || inquiry.contactName.split(' ')[0],
    contactName: inquiry.contactName,
    email: inquiry.email,
    courseName: inquiry.courseName,
    details,
  }).catch(err => console.error('Details sheet confirmation email failed:', err));

  return NextResponse.json({ success: true });
}

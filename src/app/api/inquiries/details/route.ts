import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDetailsSubmittedNotification, sendDetailsSheetConfirmationEmail } from '@/lib/email';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { token, ...sectionDraft } = body;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const inquiry = await prisma.courseInquiry.findUnique({ where: { detailsToken: token as string } });
  if (!inquiry) return NextResponse.json({ error: 'Invalid link.' }, { status: 404 });
  if (['building', 'live', 'rejected'].includes(inquiry.status)) {
    return NextResponse.json({ error: 'Sheet already submitted.' }, { status: 409 });
  }

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
  if (['building', 'live', 'rejected'].includes(inquiry.status)) {
    return NextResponse.json({ error: 'This inquiry has already moved past the setup-sheet stage.' }, { status: 409 });
  }

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
  if (['building', 'live', 'rejected'].includes(inquiry.status)) {
    return NextResponse.json({ error: 'This inquiry has already moved past the setup-sheet stage.' }, { status: 409 });
  }

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

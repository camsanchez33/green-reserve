import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDetailsSubmittedNotification } from '@/lib/email';

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

  // The schedule is what actually builds the bookable tee sheet — don't accept
  // a submission missing it, or we end up with a built course with no tee times.
  const sch = (details.schedule ?? {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (sch.greenFeeWeekday === '' || sch.greenFeeWeekday === undefined || sch.greenFeeWeekday === null) missing.push('weekday green fee');
  if (sch.greenFeeWeekend === '' || sch.greenFeeWeekend === undefined || sch.greenFeeWeekend === null) missing.push('weekend green fee');
  if (!sch.startTime) missing.push('first tee time');
  if (!sch.endTime) missing.push('last tee time');
  if (details.hasMemberPricing && (sch.memberRateWeekday === '' || sch.memberRateWeekday == null)) missing.push('member rate (weekday)');
  if (details.hasMemberPricing && (sch.memberRateWeekend === '' || sch.memberRateWeekend == null)) missing.push('member rate (weekend)');
  if (details.hasResidentPricing && (sch.residentRateWeekday === '' || sch.residentRateWeekday == null)) missing.push('resident rate (weekday)');
  if (details.hasResidentPricing && (sch.residentRateWeekend === '' || sch.residentRateWeekend == null)) missing.push('resident rate (weekend)');
  if (missing.length > 0) {
    return NextResponse.json({ error: `Please fill in your tee sheet schedule before submitting: ${missing.join(', ')}.` }, { status: 400 });
  }

  await prisma.courseInquiry.update({
    where: { id: inquiry.id },
    data: { detailsJson: JSON.stringify(details), status: 'details_submitted' },
  });

  sendDetailsSubmittedNotification({
    courseName: inquiry.courseName,
    contactName: inquiry.contactName,
  }).catch(err => console.error('Details submitted notification failed:', err));

  return NextResponse.json({ success: true });
}

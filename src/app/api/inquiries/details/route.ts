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

  return NextResponse.json({
    courseName: inquiry.courseName,
    contactName: inquiry.contactName,
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

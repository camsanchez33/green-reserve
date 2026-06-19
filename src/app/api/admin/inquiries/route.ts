import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key');
  return key === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const inquiries = await prisma.courseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(inquiries);
}

async function handleAction(inquiryId: string, action: string) {
  const inquiry = await prisma.courseInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'reject') {
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'rejected' } });
    return NextResponse.json({ success: true });
  }

  if (action === 'approve') {
    const tempPassword = randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const slug = inquiry.courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const verificationToken = randomBytes(32).toString('hex');

    const existing = await prisma.courseOperator.findUnique({ where: { email: inquiry.email } });
    if (existing) return NextResponse.json({ error: 'Operator with this email already exists' }, { status: 409 });

    const operator = await prisma.courseOperator.create({
      data: {
        email: inquiry.email,
        password: hashed,
        name: inquiry.contactName,
        emailVerified: false,
        verificationToken,
        onboardingStep: 0,
        course: {
          create: {
            slug,
            name: inquiry.courseName,
            type: inquiry.courseType,
            address: inquiry.address,
            city: inquiry.city,
            state: inquiry.state,
            zipCode: inquiry.zipCode,
            phone: inquiry.phone,
            website: inquiry.website,
            hasResidentPricing: inquiry.hasResidentPricing,
            hasMemberPricing: inquiry.hasMemberPricing,
            hasCaddies: inquiry.hasCaddies,
            active: false,
          },
        },
      },
    });

    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'approved' } });

    const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;
    return NextResponse.json({ success: true, tempPassword, setupLink, operatorId: operator.id });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// Admin dashboard sends PATCH
export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const inquiryId = body.id || body.inquiryId;
  return handleAction(inquiryId, body.action);
}

// Keep POST for backwards compat
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { inquiryId, action } = await req.json();
  return handleAction(inquiryId, action);
}

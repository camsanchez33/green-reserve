import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const required = ['contactName', 'contactTitle', 'email', 'phone', 'courseName', 'address', 'city', 'state', 'zipCode', 'courseType', 'currentBookingMethod'];
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
  }
  const inquiry = await prisma.courseInquiry.create({ data: body });
  return NextResponse.json({ success: true, id: inquiry.id });
}

export async function GET() {
  // Admin only — check admin secret
  const inquiries = await prisma.courseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(inquiries);
}

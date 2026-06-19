import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const required = ['contactName', 'contactTitle', 'email', 'phone', 'courseName', 'address', 'city', 'state', 'zipCode', 'courseType', 'currentBookingMethod'];
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
  }
  const inquiry = await prisma.courseInquiry.create({
    data: {
      contactName: body.contactName,
      contactTitle: body.contactTitle,
      email: body.email,
      phone: body.phone,
      courseName: body.courseName,
      address: body.address,
      city: body.city,
      state: body.state,
      zipCode: body.zipCode,
      website: body.website || '',
      courseType: body.courseType,
      currentBookingMethod: body.currentBookingMethod,
      teeTimesPerDay: body.teeTimesPerDay || null,
      greenFeeRange: body.greenFeeRange || '',
      hasResidentPricing: body.hasResidentPricing || false,
      hasMemberPricing: body.hasMemberPricing || false,
      hasCaddies: body.hasCaddies || false,
      pricingNotes: body.pricingNotes || '',
      facilitiesNotes: body.facilitiesNotes || '',
      lookingFor: body.lookingFor || [],
      additionalNotes: body.additionalNotes || '',
    },
  });
  return NextResponse.json({ success: true, id: inquiry.id });
}

export async function GET() {
  // Admin only — check admin secret
  const inquiries = await prisma.courseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(inquiries);
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInquiryNotification, sendInquiryConfirmation } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const required = ['firstName', 'lastName', 'contactTitle', 'email', 'phone', 'courseName', 'city', 'state', 'courseType'];
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
  }
  const contactName = `${body.firstName} ${body.lastName}`.trim();
  const inquiry = await prisma.courseInquiry.create({
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      contactName,
      contactTitle: body.contactTitle,
      email: String(body.email).trim().toLowerCase(),
      phone: body.phone,
      courseName: body.courseName,
      address: body.address || '',
      city: body.city,
      state: body.state,
      zipCode: body.zipCode || '',
      website: body.website || '',
      courseType: body.courseType,
      teeTimesPerDay: body.teeTimesPerDay || null,
      greenFeeRange: body.greenFeeRange || '',
      hasResidentPricing: body.hasResidentPricing || false,
      hasMemberPricing: body.hasMemberPricing || false,
      hasCaddies: body.hasCaddies || false,
      pricingNotes: body.pricingNotes || '',
      facilitiesNotes: body.facilitiesNotes || '',
      lookingFor: body.lookingFor || [],
      additionalNotes: body.additionalNotes || '',
      needsJson: body.needs ? JSON.stringify(body.needs) : '',
    },
  });

  const emailData = { firstName: body.firstName, contactName, email: body.email, courseName: body.courseName, needs: body.needs || null };
  sendInquiryNotification({
    contactName,
    contactTitle: body.contactTitle,
    email: body.email,
    phone: body.phone,
    courseName: body.courseName,
    city: body.city,
    state: body.state,
    courseType: body.courseType,
    currentBookingMethod: '',
    greenFeeRange: body.greenFeeRange || '',
    additionalNotes: body.additionalNotes || '',
  }).catch(err => console.error('Inquiry notification email failed:', err));

  sendInquiryConfirmation(emailData)
    .catch(err => console.error('Inquiry confirmation email failed:', err));

  return NextResponse.json({ success: true, id: inquiry.id });
}

export async function GET() {
  // Admin only — check admin secret
  const inquiries = await prisma.courseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(inquiries);
}

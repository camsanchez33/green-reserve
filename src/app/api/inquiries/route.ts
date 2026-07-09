import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInquiryNotification, sendInquiryConfirmation } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Honeypot: bots fill hidden fields, humans leave them blank. Silently accept but discard.
  if (body._website) return NextResponse.json({ success: true });

  const required = ['firstName', 'lastName', 'contactTitle', 'email', 'phone', 'courseName', 'city', 'state', 'courseType'];
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
  }

  const email = String(body.email).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const contactName = `${body.firstName} ${body.lastName}`.trim();
  const inquiry = await prisma.courseInquiry.create({
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      contactName,
      contactTitle: body.contactTitle,
      email,
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

  const emailData = { firstName: body.firstName, contactName, email, courseName: body.courseName, needs: body.needs || null };
  sendInquiryNotification({
    contactName,
    contactTitle: body.contactTitle,
    email,
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

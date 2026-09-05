import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInquiryNotification, sendInquiryConfirmation } from '@/lib/email';
import { ALIVE_STATUSES, encodeResubmit } from '@/lib/inquiry-status';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Honeypot: bots fill hidden fields, humans leave them blank. Silently accept but discard.
  if (body._website) return NextResponse.json({ success: true });

  // SD-1: the intake sends two emails per submission and creates a row; it had
  // no limit at all. Five an hour per connection is generous for a human.
  if (!(await rateLimit(`inquiry:${clientIp(req)}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many submissions from this connection — try again in an hour, or email hello@greenreserve.app.' }, { status: 429 });
  }

  const required = ['firstName', 'lastName', 'contactTitle', 'email', 'phone', 'courseName', 'city', 'state', 'courseType'];
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
  }

  const email = String(body.email).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const contactName = `${body.firstName} ${body.lastName}`.trim();

  // Duplicate-intake guard (MP-4a). This form is public and unauthenticated, so
  // the same course arrives twice for entirely ordinary reasons: an impatient
  // double-submit, or a follow-up a week later because nobody replied. Each one
  // used to create a second CourseInquiry — two rows in the pipeline for one
  // course, duplicated outreach, and a live risk of building the same course
  // twice.
  //
  // Only ALIVE inquiries dedupe. A course rejected or archived months ago that
  // applies again is a genuine new lead, not a duplicate.
  const courseName = String(body.courseName).trim();
  const city = String(body.city).trim();
  const state = String(body.state).trim();

  // A duplicate is the same COURSE, not the same person. The first version of
  // this guard also matched on email alone, which is wrong twice over: a
  // management company, or a GM who looks after two courses, submits both from
  // one address — and every one of those legitimate second courses was
  // silently absorbed into the first inquiry and never appeared in the
  // pipeline. Identity here is the course: name + city + state.
  const existing = await prisma.courseInquiry.findFirst({
    where: {
      status: { in: ALIVE_STATUSES },
      courseName: { equals: courseName, mode: 'insensitive' },
      city: { equals: city, mode: 'insensitive' },
      state: { equals: state, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  });

  if (existing) {
    // A self-loop event: it shows up on the timeline without changing status or
    // restarting the stage clock (see inquiry-status.stageEnteredAt, which
    // ignores fromStatus === toStatus for exactly this reason).
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: existing.id,
        fromStatus: existing.status,
        toStatus: existing.status,
        trigger: 'course',
        // Carry WHAT they submitted, not just that they did. A course
        // re-submitting is usually correcting something — a new phone number,
        // a fixed course name — and discarding it made the guard lossy. The
        // admin gets a diff against what is on file and decides; nothing is
        // overwritten behind their back.
        actorName: encodeResubmit({
          contactName, contactTitle: body.contactTitle || '', email,
          phone: body.phone || '', courseName, address: body.address || '',
          city, state, zipCode: body.zipCode || '', website: body.website || '',
          courseType: body.courseType || '', teeTimesPerDay: body.teeTimesPerDay || null,
          greenFeeRange: body.greenFeeRange || '', pricingNotes: body.pricingNotes || '',
          additionalNotes: body.additionalNotes || '',
          lookingFor: Array.isArray(body.lookingFor) ? body.lookingFor : [],
        }),
      },
    }).catch(err => console.error('Duplicate-intake event failed:', err));

    // The course still gets its confirmation — from their side nothing unusual
    // happened. The response shape is deliberately identical to a fresh submit:
    // a "duplicate" flag would turn this public endpoint into an oracle for
    // which courses are already in the pipeline. No admin new-lead notification
    // fires, because this is not a new lead.
    sendInquiryConfirmation({ firstName: body.firstName, contactName, email, courseName: body.courseName, needs: body.needs || null })
      .catch(err => console.error('Inquiry confirmation email failed:', err));

    return NextResponse.json({ success: true, id: existing.id });
  }
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

// GET deliberately removed (MP-1b). It was PUBLIC — no session check behind a
// comment that claimed "Admin only" — and returned every CourseInquiry with no
// select: contact names, emails, phones, adminNotes, detailsJson, and every
// detailsToken. Those tokens are the sole credential for the setup-sheet routes,
// so this handed out exactly what MP-1 #7 was built to protect. It had no
// caller: the public lead form only POSTs here (for-courses/ForCoursesContent
// .tsx:170) and the admin console reads /api/admin/inquiries, which is session-
// and role-gated. Deleted rather than gated — an endpoint nobody calls should
// not exist.

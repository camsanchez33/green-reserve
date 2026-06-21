import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendOperatorWelcomeEmail, sendDetailsRequestEmail } from '@/lib/email';

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key');
  return key === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const inquiries = await prisma.courseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(inquiries);
}

async function handleAction(inquiryId: string, action: string, payload?: Record<string, unknown>) {
  const inquiry = await prisma.courseInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Simple status transitions ──────────────────────────────────────
  if (action === 'mark_in_review') {
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'in_review' } });
    return NextResponse.json({ success: true });
  }

  if (action === 'reject') {
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'rejected' } });
    return NextResponse.json({ success: true });
  }

  // ── Request detail sheet (sends a tokenized link, moves to details_requested) ──
  if (action === 'request_details' || action === 'resend_details') {
    try {
      const detailsToken = inquiry.detailsToken ?? randomBytes(24).toString('hex');
      const detailsLink = `${process.env.NEXT_PUBLIC_URL}/for-courses/details?token=${detailsToken}`;

      await prisma.courseInquiry.update({
        where: { id: inquiryId },
        data: { detailsToken, status: 'details_requested' },
      });

      let emailSent = true;
      let emailError = '';
      try {
        await sendDetailsRequestEmail({
          contactName: inquiry.contactName,
          email: inquiry.email,
          courseName: inquiry.courseName,
          detailsLink,
        });
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('Details request email failed:', emailErr);
      }

      return NextResponse.json({ success: true, detailsLink, emailSent, emailError });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Add / replace admin note ───────────────────────────────────────
  if (action === 'add_note') {
    const note = String(payload?.note ?? '').trim();
    if (!note) return NextResponse.json({ error: 'Note is empty' }, { status: 400 });
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const existing = inquiry.adminNotes ? inquiry.adminNotes.trim() : '';
    const updated = existing ? `${existing}\n\n[${timestamp}]\n${note}` : `[${timestamp}]\n${note}`;
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { adminNotes: updated } });
    return NextResponse.json({ success: true, adminNotes: updated });
  }

  // ── Build course draft (was "approve") ────────────────────────────
  if (action === 'build_course') {
    try {
      const tempPassword = randomBytes(8).toString('hex');
      const hashed = await bcrypt.hash(tempPassword, 12);
      const baseSlug = inquiry.courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      let slug = baseSlug;
      const slugExists = await prisma.course.findUnique({ where: { slug } });
      if (slugExists) slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;
      const verificationToken = randomBytes(32).toString('hex');

      const operatorEmail = inquiry.email.trim().toLowerCase();
      const existing = await prisma.courseOperator.findUnique({ where: { email: operatorEmail } });
      if (existing) return NextResponse.json({ error: 'Operator with this email already exists' }, { status: 409 });

      // Pull in the submitted detail sheet (policies/facilities/pricing) if there is one,
      // so the operator's Settings page is pre-filled instead of all defaults.
      let d: Record<string, unknown> = {};
      try { d = inquiry.detailsJson ? JSON.parse(inquiry.detailsJson) : {}; } catch { /* ignore malformed json */ }
      const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);
      const num = (v: unknown, fallback: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);
      const bool = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback);
      const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);

      const operator = await prisma.courseOperator.create({
        data: {
          email: operatorEmail,
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
              active: false,
              liveStatus: 'draft',
              // ── From the detail sheet (defaults if not submitted) ──
              walkingAllowed: str(d.walkingAllowed, 'always'),
              cartRequired: bool(d.cartRequired, false),
              dresscode: arr(d.dresscode),
              cancellationHours: num(d.cancellationHours, 24),
              rainCheckPolicy: str(d.rainCheckPolicy, ''),
              publicAdvanceDays: num(d.publicAdvanceDays, 7),
              memberAdvanceDays: num(d.memberAdvanceDays, 14),
              hasMemberPricing: bool(d.hasMemberPricing, inquiry.hasMemberPricing),
              hasResidentPricing: bool(d.hasResidentPricing, inquiry.hasResidentPricing),
              residentCounty: str(d.residentCounty, ''),
              residentState: str(d.residentState, inquiry.state),
              hasCaddies: bool(d.hasCaddies, inquiry.hasCaddies),
              caddieType: str(d.caddieType, ''),
              hasDrivingRange: bool(d.hasDrivingRange, false),
              hasPuttingGreen: bool(d.hasPuttingGreen, false),
              hasShortGameArea: bool(d.hasShortGameArea, false),
              hasProShop: bool(d.hasProShop, false),
              restaurantType: str(d.restaurantType, 'none'),
              hasLessons: bool(d.hasLessons, false),
              hasClubRental: bool(d.hasClubRental, false),
              hasBagStorage: bool(d.hasBagStorage, false),
              hasGpsCarts: bool(d.hasGpsCarts, false),
              hasTournaments: bool(d.hasTournaments, false),
            },
          },
        },
        include: { course: true },
      });

      const builtCourseId = operator.course?.id ?? null;

      await prisma.courseInquiry.update({
        where: { id: inquiryId },
        data: { status: 'building', builtCourseId },
      });

      const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;

      // Don't swallow this — the admin needs to actually know if the email
      // failed, instead of seeing "success" when nothing was sent.
      let emailSent = true;
      let emailError = '';
      try {
        await sendOperatorWelcomeEmail({
          operatorName: inquiry.contactName,
          operatorEmail: inquiry.email,
          courseName: inquiry.courseName,
          tempPassword,
          setupLink,
        });
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('Welcome email failed:', emailErr);
      }

      return NextResponse.json({ success: true, tempPassword, setupLink, operatorId: operator.id, slug, emailSent, emailError });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Resend welcome email (generates a fresh temp password + setup link,
  // in case the original send failed or the operator lost it) ───────────
  if (action === 'resend_welcome') {
    try {
      if (!inquiry.builtCourseId) return NextResponse.json({ error: 'No course built for this inquiry yet' }, { status: 400 });
      const course = await prisma.course.findUnique({ where: { id: inquiry.builtCourseId }, include: { operator: true } });
      if (!course?.operator) return NextResponse.json({ error: 'No operator account found for this course' }, { status: 404 });

      const tempPassword = randomBytes(8).toString('hex');
      const hashed = await bcrypt.hash(tempPassword, 12);
      const verificationToken = randomBytes(32).toString('hex');

      await prisma.courseOperator.update({
        where: { id: course.operator.id },
        data: { password: hashed, verificationToken },
      });

      const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;

      let emailSent = true;
      let emailError = '';
      try {
        await sendOperatorWelcomeEmail({
          operatorName: inquiry.contactName,
          operatorEmail: inquiry.email,
          courseName: inquiry.courseName,
          tempPassword,
          setupLink,
        });
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('Resend welcome email failed:', emailErr);
      }

      return NextResponse.json({ success: true, tempPassword, setupLink, emailSent, emailError });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Mark live (admin confirms all set up, flips course live) ──────
  if (action === 'mark_live') {
    try {
      if (!inquiry.builtCourseId) return NextResponse.json({ error: 'No course built for this inquiry yet' }, { status: 400 });
      const builtCourse = await prisma.course.findUnique({ where: { id: inquiry.builtCourseId } });
      if (!builtCourse?.stripeAccountActive) {
        return NextResponse.json({ error: 'This course has not finished connecting Stripe (charges/payouts not enabled yet). They need to complete onboarding from their dashboard before going live.' }, { status: 400 });
      }
      await prisma.course.update({
        where: { id: inquiry.builtCourseId },
        data: { active: true, liveStatus: 'live' },
      });
      await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'live' } });
      return NextResponse.json({ success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const inquiryId = body.id || body.inquiryId;
  return handleAction(inquiryId, body.action, body);
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const inquiryId = body.id || body.inquiryId;
  return handleAction(inquiryId, body.action, body);
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await prisma.courseInquiry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendOperatorWelcomeEmail, sendDetailsRequestEmail, sendCourseLiveOrientationEmail } from '@/lib/email';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';
import { resolveAdminSession, requireRole, MANAGER_PLUS, OWNER_ONLY, type AdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const inquiries = await prisma.courseInquiry.findMany({
    orderBy: { createdAt: 'desc' },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json(inquiries);
}

async function logEvent(
  inquiryId: string,
  fromStatus: string,
  toStatus: string,
  trigger: 'system' | 'admin',
  actorName?: string,
) {
  await prisma.inquiryStatusEvent.create({
    data: { inquiryId, fromStatus, toStatus, trigger, actorName: actorName || null },
  });
}

async function handleAction(
  inquiryId: string,
  action: string,
  payload?: Record<string, unknown>,
  session?: AdminSession | null,
) {
  const inquiry = await prisma.courseInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const adminName = session?.name || 'Admin';

  // ── pending → in_review: triggered automatically when detail panel opens ──
  if (action === 'mark_opened') {
    if (inquiry.status !== 'pending') return NextResponse.json({ success: true, noOp: true });
    const now = new Date();
    await prisma.courseInquiry.update({
      where: { id: inquiryId },
      data: { status: 'in_review', reviewStartedAt: now },
    });
    await logEvent(inquiryId, 'pending', 'in_review', 'system', adminName);
    return NextResponse.json({ success: true });
  }

  // ── Simple status transitions ──────────────────────────────────────
  if (action === 'mark_in_review') {
    const from = inquiry.status;
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'in_review' } });
    await logEvent(inquiryId, from, 'in_review', 'admin', adminName);
    return NextResponse.json({ success: true });
  }

  if (action === 'reject') {
    const from = inquiry.status;
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'rejected' } });
    await logEvent(inquiryId, from, 'rejected', 'admin', adminName);
    return NextResponse.json({ success: true });
  }

  // ── Request detail sheet ──────────────────────────────────────────
  if (action === 'request_details' || action === 'resend_details') {
    try {
      const detailsToken = inquiry.detailsToken ?? randomBytes(24).toString('hex');
      const detailsLink = `${process.env.NEXT_PUBLIC_URL}/for-courses/details?token=${detailsToken}`;
      const from = inquiry.status;
      await prisma.courseInquiry.update({
        where: { id: inquiryId },
        data: { detailsToken, status: 'details_requested' },
      });
      if (from !== 'details_requested') {
        await logEvent(inquiryId, from, 'details_requested', 'admin', adminName);
      }
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
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
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

  // ── Build course draft ────────────────────────────────────────────
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

      let d: Record<string, unknown> = {};
      try { d = inquiry.detailsJson ? JSON.parse(inquiry.detailsJson) : {}; } catch { /* ignore */ }
      const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);
      const num = (v: unknown, fallback: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);
      const bool = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback);
      const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
      const flt = (v: unknown, fallback: number) => {
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
        if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
        return fallback;
      };

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
              slug, name: inquiry.courseName, type: inquiry.courseType,
              address: inquiry.address, city: inquiry.city, state: inquiry.state,
              zipCode: inquiry.zipCode, phone: inquiry.phone, website: inquiry.website,
              active: false, liveStatus: 'draft',
              walkingAllowed: str(d.walkingAllowed, 'always'), walkingNote: str(d.walkingNote, ''),
              cartRequired: bool(d.cartRequired, false), dresscode: arr(d.dresscode),
              cancellationHours: num(d.cancellationHours, 24), rainCheckPolicy: str(d.rainCheckPolicy, ''),
              publicAdvanceDays: num(d.publicAdvanceDays, 7), memberAdvanceDays: num(d.memberAdvanceDays, 14),
              hasMemberPricing: bool(d.hasMemberPricing, inquiry.hasMemberPricing),
              hasResidentPricing: bool(d.hasResidentPricing, inquiry.hasResidentPricing),
              residentCounty: str(d.residentCounty, ''), residentState: str(d.residentState, inquiry.state),
              hasCaddies: bool(d.hasCaddies, inquiry.hasCaddies), caddieType: str(d.caddieType, ''),
              caddieLooperRate: flt(d.caddieLooperRate, 0), caddieForeRate: flt(d.caddieForeRate, 0),
              caddieNote: str(d.caddieNote, ''), hasDrivingRange: bool(d.hasDrivingRange, false),
              rangeBallsFree: bool(d.rangeBallsFree, true), hasPuttingGreen: bool(d.hasPuttingGreen, false),
              hasShortGameArea: bool(d.hasShortGameArea, false), hasProShop: bool(d.hasProShop, false),
              proShopPhone: str(d.proShopPhone, ''), restaurantType: str(d.restaurantType, 'none'),
              hasCartGirl: bool(d.hasCartGirl, false), hasLessons: bool(d.hasLessons, false),
              hasClubRental: bool(d.hasClubRental, false), hasBagStorage: bool(d.hasBagStorage, false),
              hasGpsCarts: bool(d.hasGpsCarts, false), hasTournaments: bool(d.hasTournaments, false),
              tournamentFrequency: str(d.tournamentFrequency, ''),
            },
          },
        },
        include: { course: true },
      });

      const builtCourseId = operator.course?.id ?? null;
      const from = inquiry.status;
      await prisma.courseInquiry.update({
        where: { id: inquiryId },
        data: { status: 'building', builtCourseId },
      });
      await logEvent(inquiryId, from, 'building', 'admin', adminName);

      const sch = d.schedule as Record<string, unknown> | undefined;
      if (builtCourseId && sch && (sch.greenFeeWeekday || sch.greenFeeWeekend)) {
        await prisma.teeTimeSchedule.create({
          data: {
            courseId: builtCourseId, tierName: 'standard',
            daysOfWeek: Array.isArray(sch.daysOfWeek) ? sch.daysOfWeek as number[] : [],
            startTime: str(sch.startTime, '06:00'), endTime: str(sch.endTime, '18:00'),
            intervalMinutes: num(sch.intervalMinutes, 8), holes: 18,
            greenFeeWeekday: num(Number(sch.greenFeeWeekday), 0),
            greenFeeWeekend: num(Number(sch.greenFeeWeekend), 0),
            memberRateWeekday: sch.memberRateWeekday ? Number(sch.memberRateWeekday) : null,
            memberRateWeekend: sch.memberRateWeekend ? Number(sch.memberRateWeekend) : null,
            residentRateWeekday: sch.residentRateWeekday ? Number(sch.residentRateWeekday) : null,
            residentRateWeekend: sch.residentRateWeekend ? Number(sch.residentRateWeekend) : null,
            cartFee: num(Number(sch.cartFee), 0), walkingAllowed: bool(sch.walkingAllowed, true),
          },
        });
        const today = new Date();
        for (let i = 0; i < 8; i++) {
          const dt = new Date(today);
          dt.setDate(dt.getDate() + i);
          await generateTeeTimes(builtCourseId, dt.toISOString().split('T')[0]);
        }
      }

      const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;
      let emailSent = true;
      let emailError = '';
      try {
        await sendOperatorWelcomeEmail({
          operatorName: inquiry.contactName, operatorEmail: inquiry.email,
          courseName: inquiry.courseName, tempPassword, setupLink,
        });
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('Welcome email failed:', emailErr);
      }
      return NextResponse.json({ success: true, tempPassword, setupLink, operatorId: operator.id, slug, emailSent, emailError });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ── Resend welcome email ──────────────────────────────────────────
  if (action === 'resend_welcome') {
    try {
      if (!inquiry.builtCourseId) return NextResponse.json({ error: 'No course built yet' }, { status: 400 });
      const course = await prisma.course.findUnique({ where: { id: inquiry.builtCourseId }, include: { operator: true } });
      if (!course?.operator) return NextResponse.json({ error: 'No operator account found' }, { status: 404 });
      const tempPassword = randomBytes(8).toString('hex');
      const hashed = await bcrypt.hash(tempPassword, 12);
      const verificationToken = randomBytes(32).toString('hex');
      await prisma.courseOperator.update({ where: { id: course.operator.id }, data: { password: hashed, verificationToken } });
      const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;
      let emailSent = true;
      let emailError = '';
      try {
        await sendOperatorWelcomeEmail({
          operatorName: inquiry.contactName, operatorEmail: inquiry.email,
          courseName: inquiry.courseName, tempPassword, setupLink,
        });
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('Resend welcome email failed:', emailErr);
      }
      return NextResponse.json({ success: true, tempPassword, setupLink, emailSent, emailError });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ── Mark live ─────────────────────────────────────────────────────
  if (action === 'mark_live') {
    try {
      if (!inquiry.builtCourseId) return NextResponse.json({ error: 'No course built yet' }, { status: 400 });
      const builtCourse = await prisma.course.findUnique({ where: { id: inquiry.builtCourseId } });
      if (!builtCourse?.stripeAccountActive) {
        return NextResponse.json({ error: 'Course has not finished connecting Stripe yet.' }, { status: 400 });
      }
      await prisma.course.update({ where: { id: inquiry.builtCourseId }, data: { active: true, liveStatus: 'live' } });
      const now = new Date();
      const from = inquiry.status;
      await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: 'live', wentLiveAt: now } });
      await logEvent(inquiryId, from, 'live', 'admin', adminName);
      let emailSent = true;
      let emailError = '';
      try {
        await sendCourseLiveOrientationEmail({
          operatorName: inquiry.contactName, operatorEmail: inquiry.email,
          courseName: inquiry.courseName, courseSlug: builtCourse.slug,
        });
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error('Go-live orientation email failed:', emailErr);
      }
      return NextResponse.json({ success: true, emailSent, emailError });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ── set_status (drag-and-drop manual override) ────────────────────
  if (action === 'set_status') {
    const allowed = ['pending', 'in_review', 'details_requested', 'details_submitted', 'building', 'rejected'];
    const newStatus = String(payload?.newStatus ?? '');
    if (!allowed.includes(newStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    const from = inquiry.status;
    await prisma.courseInquiry.update({ where: { id: inquiryId }, data: { status: newStatus } });
    if (from !== newStatus) {
      await logEvent(inquiryId, from, newStatus, 'admin', adminName);
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const inquiryId = body.id || body.inquiryId;
  return handleAction(inquiryId, body.action, body, session);
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const inquiryId = body.id || body.inquiryId;
  return handleAction(inquiryId, body.action, body, session);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await prisma.courseInquiry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendOperatorWelcomeEmail } from '@/lib/email';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!slug) return NextResponse.json({ available: false });
  const exists = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
  return NextResponse.json({ available: !exists });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const {
      courseName, courseType, address, city, state, zipCode, phone, website,
      contactName, contactEmail: rawContactEmail, contactPhone,
      holes, par, hasMemberPricing, hasResidentPricing,
      slug: requestedSlug, inquiryId,
      // Fee seed
      seedWeekdayFee, seedWeekendFee, seedCartFee, seedWalkingAllowed,
      seedTwilightFee, seedSeasonOpen, seedSeasonClose,
      seedResidentWeekday, seedResidentWeekend, seedResidentNote,
      seedMemberAdvanceDays, seedStarterTierName, seedStarterTierFee,
      seedGuestRate, seedPackagesNote,
      // Schedule seed (from O2 details sheet)
      seedFirstTeeTime, seedLastTeeTime, seedIntervalMinutes, seedDaysOpen,
      seedHoles, seedDescription,
    } = body;

    if (!courseName || !contactName || !rawContactEmail || !contactPhone) {
      return NextResponse.json({ error: 'Course name, contact name, contact email, and contact phone are required' }, { status: 400 });
    }
    const contactEmail = String(rawContactEmail).trim().toLowerCase();

    const existing = await prisma.courseOperator.findUnique({ where: { email: contactEmail } });
    if (existing) return NextResponse.json({ error: 'An operator with this email already exists' }, { status: 409 });

    const baseSlug = requestedSlug
      ? String(requestedSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '') ||
        courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    const slugExists = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
    if (slugExists) slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;

    // Build description: use sheet description first, then any notes overflow
    const notesLines: string[] = [];
    if (seedTwilightFee != null && seedTwilightFee > 0) notesLines.push(`Twilight rate: $${seedTwilightFee}`);
    if (seedSeasonOpen) notesLines.push(`Season opens: ${MONTHS[parseInt(seedSeasonOpen)] || seedSeasonOpen}`);
    if (seedSeasonClose) notesLines.push(`Season closes: ${MONTHS[parseInt(seedSeasonClose)] || seedSeasonClose}`);
    if (seedResidentNote) notesLines.push(`Resident verification: ${seedResidentNote}`);
    if (seedGuestRate != null && seedGuestRate > 0) notesLines.push(`Guest-of-resort rate: $${seedGuestRate}`);
    if (seedPackagesNote) notesLines.push(`Resort packages: ${seedPackagesNote}`);
    const description = seedDescription
      ? String(seedDescription) + (notesLines.length > 0 ? '\n\n[Notes]\n' + notesLines.map((n: string) => '• ' + n).join('\n') : '')
      : notesLines.length > 0
        ? '[Setup Notes]\n' + notesLines.map((n: string) => '• ' + n).join('\n')
        : '';

    const tempPassword = randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const verificationToken = randomBytes(32).toString('hex');

    const operator = await prisma.courseOperator.create({
      data: {
        email: contactEmail,
        password: hashed,
        name: contactName,
        phone: contactPhone,
        emailVerified: true,
        verificationToken,
        onboardingStep: 1,
        course: {
          create: {
            slug,
            name: courseName,
            type: courseType || 'public',
            address: address || '',
            city: city || '',
            state: state || '',
            zipCode: zipCode || '',
            phone: phone || '',
            website: website || '',
            holes: holes ? Number(holes) : (seedHoles ? Number(seedHoles) : 18),
            par: par ? Number(par) : 72,
            description,
            hasMemberPricing: hasMemberPricing || courseType === 'semi-private',
            hasResidentPricing: hasResidentPricing || (courseType === 'municipal' && !!seedResidentWeekday),
            memberAdvanceDays: seedMemberAdvanceDays ? Number(seedMemberAdvanceDays) : 14,
            active: false,
          },
        },
      },
      include: { course: { select: { id: true } } },
    });

    const courseId = operator.course?.id ?? null;
    const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;

    // If this was created from an inquiry, mark it
    if (inquiryId && courseId) {
      await prisma.courseInquiry.update({
        where: { id: String(inquiryId) },
        data: { builtCourseId: courseId, status: 'building' },
      }).catch(() => {});
    }

    // Create seed TeeTimeSchedule if fee data provided
    let seedScheduleCreated = false;
    if (courseId && seedWeekdayFee != null && seedWeekendFee != null) {
      const daysArr = Array.isArray(seedDaysOpen) && seedDaysOpen.length > 0
        ? seedDaysOpen.map(Number)
        : [0, 1, 2, 3, 4, 5, 6];
      await prisma.teeTimeSchedule.create({
        data: {
          courseId,
          tierName: 'standard',
          daysOfWeek: daysArr,
          startTime: seedFirstTeeTime || '07:00',
          endTime: seedLastTeeTime || '17:30',
          intervalMinutes: seedIntervalMinutes ? Number(seedIntervalMinutes) : 10,
          holes: seedHoles ? Number(seedHoles) : 18,
          greenFeeWeekday: Number(seedWeekdayFee),
          greenFeeWeekend: Number(seedWeekendFee),
          cartFee: seedCartFee != null ? Number(seedCartFee) : 0,
          walkingAllowed: seedWalkingAllowed !== false,
          residentRateWeekday: seedResidentWeekday != null ? Number(seedResidentWeekday) : null,
          residentRateWeekend: seedResidentWeekend != null ? Number(seedResidentWeekend) : null,
        },
      });
      seedScheduleCreated = true;
    }

    // Create starter membership tier (semi-private)
    let seedTierCreated = false;
    if (courseId && seedStarterTierName) {
      await prisma.membershipTier.create({
        data: {
          courseId,
          name: seedStarterTierName,
          annualFee: seedStarterTierFee != null ? Number(seedStarterTierFee) : 0,
          advanceBookingDays: seedMemberAdvanceDays ? Number(seedMemberAdvanceDays) : 14,
        },
      });
      seedTierCreated = true;
    }

    sendOperatorWelcomeEmail({ operatorName: contactName, operatorEmail: contactEmail, courseName, tempPassword, setupLink })
      .catch(e => console.error('Welcome email failed:', e));

    return NextResponse.json({
      success: true, slug, tempPassword, setupLink, courseId, operatorId: operator.id,
      seedScheduleCreated, seedTierCreated,
      notesItems: notesLines,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

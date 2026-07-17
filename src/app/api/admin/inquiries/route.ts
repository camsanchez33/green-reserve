import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendOperatorWelcomeEmail, sendDetailsRequestEmail, sendCourseLiveOrientationEmail, sendDashboardAccessEmail, sendGoLiveSimpleEmail } from '@/lib/email';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';
import { resolveAdminSession, requireRole, MANAGER_PLUS, OWNER_ONLY, type AdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const inquiry = await prisma.courseInquiry.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(inquiry);
  }
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
      sendDetailsRequestEmail({
        contactName: inquiry.contactName,
        email: inquiry.email,
        courseName: inquiry.courseName,
        detailsLink,
      }).catch(emailErr => console.error('Details request email failed:', emailErr));
      return NextResponse.json({ success: true, detailsLink });
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

      const builtCourseId = operator.course?.[0]?.id ?? null;
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
      sendOperatorWelcomeEmail({
        operatorName: inquiry.contactName, operatorEmail: inquiry.email,
        courseName: inquiry.courseName, tempPassword, setupLink,
      }).catch(emailErr => console.error('Welcome email failed:', emailErr));
      return NextResponse.json({ success: true, tempPassword, setupLink, operatorId: operator.id, slug });
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
      sendOperatorWelcomeEmail({
        operatorName: inquiry.contactName, operatorEmail: inquiry.email,
        courseName: inquiry.courseName, tempPassword, setupLink,
      }).catch(emailErr => console.error('Resend welcome email failed:', emailErr));
      return NextResponse.json({ success: true, tempPassword, setupLink });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ── Send dashboard access (Building-stage early access) ───────────
  if (action === 'send_dashboard_access') {
    try {
      if (!inquiry.builtCourseId) return NextResponse.json({ error: 'No course built yet' }, { status: 400 });
      const course = await prisma.course.findUnique({ where: { id: inquiry.builtCourseId }, include: { operator: true } });
      if (!course?.operator) return NextResponse.json({ error: 'No operator account found' }, { status: 404 });
      const tempPassword = randomBytes(8).toString('hex');
      const hashed = await bcrypt.hash(tempPassword, 12);
      const verificationToken = randomBytes(32).toString('hex');
      await prisma.courseOperator.update({ where: { id: course.operator.id }, data: { password: hashed, verificationToken } });
      const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${verificationToken}`;
      sendDashboardAccessEmail({
        operatorName: inquiry.contactName, operatorEmail: inquiry.email,
        courseName: inquiry.courseName, tempPassword, setupLink,
      }).catch(emailErr => console.error('Dashboard access email failed:', emailErr));
      await logEvent(inquiryId, inquiry.status, inquiry.status, 'admin', `Dashboard access sent by ${adminName}`);
      return NextResponse.json({ success: true, tempPassword, setupLink });
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
      // Only send welcome email once — guard via welcomeEmailSentAt
      if (!builtCourse.welcomeEmailSentAt) {
        // If dashboard access was already sent, use shorter "you're live" email
        const events = await prisma.inquiryStatusEvent.findMany({
          where: { inquiryId },
          select: { actorName: true },
        });
        const hasDashboardAccess = events.some(e => e.actorName?.startsWith('Dashboard access sent'));
        const goLiveFn = hasDashboardAccess ? sendGoLiveSimpleEmail : sendCourseLiveOrientationEmail;
        goLiveFn({
          operatorName: inquiry.contactName, operatorEmail: inquiry.email,
          courseName: inquiry.courseName, courseSlug: builtCourse.slug,
        }).then(() => prisma.course.update({ where: { id: inquiry.builtCourseId! }, data: { welcomeEmailSentAt: new Date() } }))
          .catch(emailErr => console.error('Go-live email failed:', emailErr));
      }
      return NextResponse.json({ success: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ── Edit contact info ─────────────────────────────────────────────
  if (action === 'update_contact') {
    const p = payload as Record<string, string>;
    await prisma.courseInquiry.update({
      where: { id: inquiryId },
      data: {
        contactName: p.contactName?.trim() || inquiry.contactName,
        email: p.email?.trim().toLowerCase() || inquiry.email,
        phone: p.phone?.trim() ?? inquiry.phone,
        courseName: p.courseName?.trim() || inquiry.courseName,
        city: p.city?.trim() || inquiry.city,
        state: p.state?.trim() || inquiry.state,
      },
    });
    await logEvent(inquiryId, 'contact_updated', 'contact_updated', 'admin', adminName);
    return NextResponse.json({ success: true });
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

  // ── Create draft course (no email) ───────────────────────────────
  if (action === 'create_draft_course') {
    try {
      const operatorEmail = inquiry.email.trim().toLowerCase();
      const existingOp = await prisma.courseOperator.findUnique({ where: { email: operatorEmail } });
      if (existingOp && inquiry.builtCourseId) {
        return NextResponse.json({ courseId: inquiry.builtCourseId, needsReview: [], alreadyBuilt: true });
      }

      let d: Record<string, unknown> = {};
      try { d = inquiry.detailsJson ? JSON.parse(inquiry.detailsJson) : {}; } catch { /* ignore */ }

      const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);
      const num = (v: unknown, fallback: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);
      const bool = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback);
      const flt = (v: unknown, fallback: number) => {
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
        if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
        return fallback;
      };

      const sch = (d.schedule as Record<string, unknown>) || {};
      const fv2 = (d.facilitiesV2 as Record<string, unknown>) || {};
      const passes = Array.isArray(d.passes) ? (d.passes as Record<string, unknown>[]) : [];

      const firstTeeTime = str(d.firstTeeTime || sch.startTime, '');
      const lastTeeTime = str(d.lastTeeTime || sch.endTime, '');
      const intervalMins = flt(d.intervalMinutes || sch.intervalMinutes, 10);
      const daysOpen: number[] = Array.isArray(d.daysOpen) ? (d.daysOpen as number[]) : (Array.isArray(sch.daysOfWeek) ? (sch.daysOfWeek as number[]) : []);
      const greenFeeWeekday = flt(d.greenFeeWeekday || sch.greenFeeWeekday, 0);
      const greenFeeWeekend = flt(d.greenFeeWeekend || sch.greenFeeWeekend, 0);
      const cartFee = flt(d.cartFee || sch.cartFee, 0);

      const holes = flt(d.holes, 18) || 18;
      const par = flt(d.par, 72) || 72;
      // The generated tee sheet plays a standard round, not the course's total
      // hole count — a 27/36-hole course still tees off 18 at a time (the
      // per-nine combo model is a manual Schedule-tab setup, flagged above).
      const scheduleHoles = holes === 9 ? 9 : 18;

      const walkingRaw = str(d.walkingAllowed || sch.walkingAllowed, 'yes');
      const walkingAllowed = walkingRaw === 'yes' ? 'always' : walkingRaw;
      const walkingSchedule = walkingAllowed !== 'no';

      const hasDrivingRange = !!(fv2.range ?? d.hasDrivingRange);
      const drivingRangeType = str(fv2.rangeTeeType, '');
      const rangeBuckets = Array.isArray(fv2.rangeBuckets) ? (fv2.rangeBuckets as Record<string, unknown>[]) : [];
      const rangeBallsFree = rangeBuckets.length === 0;
      const rangeBallsSmallPrice = rangeBuckets[0] ? flt(rangeBuckets[0].price, 0) : 0;
      const rangeBallsMediumPrice = rangeBuckets[1] ? flt(rangeBuckets[1].price, 0) : 0;
      const rangeBallsLargePrice = rangeBuckets[2] ? flt(rangeBuckets[2].price, 0) : 0;
      const hasPuttingGreen = !!(fv2.puttingGreen ?? d.hasPuttingGreen);
      const hasShortGameArea = !!(fv2.chippingArea ?? d.hasShortGameArea);
      const hasProShop = !!(fv2.proShop ?? d.hasProShop);
      const hasLessons = !!(fv2.lessons ?? d.hasLessons);
      const proShopPhone = str(fv2.lessonsProPhone ?? d.proShopPhone, '');
      const hasClubRental = !!(fv2.clubRental ?? d.hasClubRental);
      const hasPushCartRental = !!(fv2.cartRental ?? d.hasPushCartRental);
      const pushCartRate = flt(fv2.cartRentalCost ?? d.pushCartRate, 0);
      const hasBagStorage = !!(fv2.bagStorage ?? d.hasBagStorage);
      const hasLockerRoom = !!(fv2.lockerRooms ?? d.hasLockerRoom);
      const hasGpsCarts = !!(fv2.gpsCarts ?? d.hasGpsCarts);
      const hasTournaments = !!(fv2.tournaments ?? d.hasTournaments);
      const tournamentFrequency = str(fv2.tournamentsFrequency ?? d.tournamentFrequency, '');
      const restaurantType = str(fv2.restaurantType ?? d.restaurantType, 'none') || 'none';

      const hasMemberPricing = passes.some(p => ['membership', 'season_pass', 'punch_card'].includes(str(p.type))) || bool(d.hasMemberPricing, inquiry.hasMemberPricing);
      const hasResidentPricing = passes.some(p => ['resident_card', 'resident_rate'].includes(str(p.type))) || bool(d.hasResidentPricing, inquiry.hasResidentPricing);
      const residentPass = passes.find(p => ['resident_card', 'resident_rate'].includes(str(p.type)));
      const residentCounty = str(residentPass?.residentWho ?? d.residentCounty, '');
      const memberPass = passes.find(p => ['membership', 'season_pass'].includes(str(p.type)));
      const memberPerRoundFee = (str(memberPass?.perRound) === 'yes') ? flt(memberPass?.perRoundFee, 0) : null;
      const residentWeekdayFee = residentPass ? flt(residentPass.residentWeekday ?? d.residentWeekday, 0) : null;
      const residentWeekendFee = residentPass ? flt(residentPass.residentWeekend ?? d.residentWeekend, 0) : null;

      const hasCancellationPolicy = d.cancellationPolicy === 'yes';
      const cancellationHours = hasCancellationPolicy ? num(Number(d.cancellationHours), 24) : 0;
      const lateCancellationFee = hasCancellationPolicy ? flt(d.lateFee, 0) : 0;

      const PASS_TYPE_LABELS: Record<string, string> = {
        membership: 'Membership', season_pass: 'Season Pass', resident_card: 'Resident Card',
        punch_card: 'Punch Card', other: 'Other',
      };
      // resident_rate = flat resident green fees with no card/tier — handled via
      // residentWeekday/residentWeekend on the TeeTimeSchedule above, not a tier.
      const tierPasses = passes.filter(p => str(p.type) !== 'resident_rate');

      const needsReview: string[] = [];
      if (!firstTeeTime || !lastTeeTime) needsReview.push('No tee time schedule — add via Schedule tab');
      if (!greenFeeWeekday && !greenFeeWeekend) needsReview.push('No green fees in sheet — set rates in Schedule tab');
      if (!str(d.description)) needsReview.push('No course description — add in Setup tab');
      if (!d.cancellationPolicy) needsReview.push('Cancellation policy not answered in sheet');
      if (holes === 27) needsReview.push('27-hole course: verify which 9-hole combos to set up as booking sheets');
      if (holes === 36) needsReview.push('36-hole course: verify two-course booking setup');

      // COURSE_LAYOUT_SPEC L1: map the sheet's multi-nine/combo answers into
      // real Nine + CourseProduct rows instead of just a build-notes flag.
      // Simple 9/18-hole courses create nothing here — flat Course fields
      // stay their display fallback (no forced backfill).
      type NineSpec = { name: string; par: number };
      type ProductSpec = { label: string; holes: number; nineNames: string[]; comboKey?: string };
      const nineSpecs: NineSpec[] = [];
      const productSpecs: ProductSpec[] = [];

      if (holes === 27 && str(d.layout27) === 'three_9s') {
        const nine27Names = (Array.isArray(d.nine27Names) ? d.nine27Names as string[] : []).filter(n => n && n.trim());
        const parsPerNine = (d.nine27ParsPerNine as Record<string, string>) || {};
        for (const name of nine27Names) nineSpecs.push({ name, par: num(Number(parsPerNine[name]), 36) });

        const combosEnabled = Array.isArray(d.nine27CombosEnabled) ? d.nine27CombosEnabled as string[] : [];
        for (const comboKey of combosEnabled) {
          const [a, b] = comboKey.split('+');
          if (!nine27Names.includes(a) || !nine27Names.includes(b)) continue;
          productSpecs.push({ label: `${a} + ${b}`, holes: 18, nineNames: [a, b], comboKey });
        }
        if (str(d.nine27BookableAlone) === 'yes') {
          for (const name of nine27Names) productSpecs.push({ label: name, holes: 9, nineNames: [name] });
        }
      } else if (holes === 27 && str(d.layout27) === '18_plus_9') {
        // The base 18 isn't itself split into named nines in the sheet —
        // only the separate 9 is. The base 18 stays the flat-field fallback.
        const separate9Name = str(d.separate9Name);
        if (separate9Name) {
          nineSpecs.push({ name: separate9Name, par: num(Number(d.separate9Par), 36) });
          if (str(d.separate9Bookable) === 'yes') {
            productSpecs.push({ label: separate9Name, holes: 9, nineNames: [separate9Name] });
          }
        }
      } else if (holes === 36 && str(d.layout36) === 'two_18s') {
        // Each named "course" here is a full 18 a golfer books whole — not
        // composed of named nines in the sheet, so no Nine rows, just two
        // 18-hole products.
        const course36Names = (Array.isArray(d.course36Names) ? d.course36Names as string[] : []).filter(n => n && n.trim());
        for (const name of course36Names) productSpecs.push({ label: name, holes: 18, nineNames: [] });
      }
      // holes===36 && layout36==='other' is free text only (course36LayoutDesc)
      // — nothing structured to map; the needsReview flag above covers it.
      if (existingOp) needsReview.push('Attached to existing operator account — no new login created');
      for (const p of tierPasses) {
        const tierName = str(p.name) || (str(p.type) === 'other' ? str(p.otherType, 'Other') : PASS_TYPE_LABELS[str(p.type)] || 'Membership');
        if (str(p.perRound) === 'yes' && str(p.perRoundType) === 'separate') {
          needsReview.push(`Tier "${tierName}": per-round fee is a surcharge on top of the green fee — Member Management only supports a flat override rate, set it manually`);
        }
        if (['season', 'per_punch'].includes(str(p.feePeriod))) {
          needsReview.push(`Tier "${tierName}": priced ${str(p.feePeriod) === 'per_punch' ? 'per punch' : 'per season'} — verify the billing period in Member Management`);
        }
      }

      const adminNotes = needsReview.length > 0
        ? `[BUILD NOTES]\n${needsReview.map(n => `• ${n}`).join('\n')}`
        : '';

      const baseSlug = inquiry.courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      let slug = baseSlug;
      const slugExists = await prisma.course.findUnique({ where: { slug } });
      if (slugExists) slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;

      const courseFields = {
        slug, name: inquiry.courseName, type: inquiry.courseType,
        address: inquiry.address, city: inquiry.city, state: inquiry.state,
        zipCode: inquiry.zipCode, phone: inquiry.phone,
        website: str(d.website, inquiry.website),
        description: str(d.description, ''),
        active: false, liveStatus: 'draft',
        holes: num(holes, 18), par: num(par, 72),
        walkingAllowed, walkingNote: str(d.walkingNote, ''),
        cartRequired: bool(d.cartRequired, false), dresscode: [],
        cancellationHours, lateCancellationFee, rainCheckPolicy: '',
        publicAdvanceDays: num(Number(d.publicAdvanceDays), 7),
        memberAdvanceDays: num(Number(d.memberAdvanceDays), 14),
        hasMemberPricing, hasResidentPricing,
        residentCounty, residentState: str(d.residentState, inquiry.state),
        hasCaddies: bool(d.hasCaddies, inquiry.hasCaddies),
        caddieType: '', caddieLooperRate: 0, caddieForeRate: 0, caddieNote: '',
        hasDrivingRange, drivingRangeType, rangeBallsFree,
        rangeBallsSmallPrice, rangeBallsMediumPrice, rangeBallsLargePrice,
        hasPuttingGreen, hasShortGameArea, hasProShop, proShopPhone,
        restaurantType, hasCartGirl: false, hasLessons, hasClubRental,
        hasPushCartRental, pushCartRate, hasBagStorage, hasLockerRoom,
        hasGpsCarts, hasTournaments, tournamentFrequency,
        adminNotes,
      };

      let builtCourseId: string | null = null;
      if (existingOp) {
        // V9-1b: operator having a course is no longer a dead-end.
        // - different name (or no courses at all) -> attach, no block
        // - same name but archived -> attach, no block (the old one is gone)
        // - same name and NOT archived -> banner (View existing / Create anyway)
        const existingCourses = await prisma.course.findMany({ where: { operatorId: existingOp.id } });
        const nameMatch = existingCourses.find(
          c => !c.archivedAt && c.name.trim().toLowerCase() === inquiry.courseName.trim().toLowerCase()
        );
        const force = payload?.force === true;
        if (nameMatch && !force) {
          return NextResponse.json({
            error: 'name_conflict',
            message: `${existingOp.name} already has an active course named "${nameMatch.name}".`,
            existingCourseId: nameMatch.id,
            existingCourseName: nameMatch.name,
          }, { status: 409 });
        }

        let attachData = courseFields;
        if (nameMatch && force) {
          let forcedSlug = `${slug}-2`;
          if (await prisma.course.findUnique({ where: { slug: forcedSlug } })) {
            forcedSlug = `${slug}-2-${randomBytes(3).toString('hex')}`;
          }
          attachData = { ...courseFields, slug: forcedSlug };
        }
        const newCourse = await prisma.course.create({ data: { operatorId: existingOp.id, ...attachData } });
        builtCourseId = newCourse.id;
      } else {
        const tempPassword = randomBytes(8).toString('hex');
        const hashed = await bcrypt.hash(tempPassword, 12);
        const verificationToken = randomBytes(32).toString('hex');
        const operator = await prisma.courseOperator.create({
          data: {
            email: operatorEmail,
            password: hashed,
            name: inquiry.contactName,
            emailVerified: false,
            verificationToken,
            onboardingStep: 0,
            course: { create: courseFields },
          },
          include: { course: true },
        });
        builtCourseId = operator.course?.[0]?.id ?? null;
      }
      const from = inquiry.status;
      await prisma.courseInquiry.update({
        where: { id: inquiryId },
        data: { status: 'building', builtCourseId },
      });
      await logEvent(inquiryId, from, 'building', 'admin', adminName);

      if (builtCourseId && firstTeeTime && lastTeeTime) {
        const effectiveDays = daysOpen.length > 0 ? daysOpen : [0, 1, 2, 3, 4, 5, 6];
        await prisma.teeTimeSchedule.create({
          data: {
            courseId: builtCourseId, tierName: 'standard',
            daysOfWeek: effectiveDays,
            startTime: firstTeeTime, endTime: lastTeeTime,
            intervalMinutes: num(intervalMins, 10), holes: scheduleHoles,
            greenFeeWeekday, greenFeeWeekend,
            memberRateWeekday: memberPerRoundFee, memberRateWeekend: memberPerRoundFee,
            residentRateWeekday: residentWeekdayFee, residentRateWeekend: residentWeekendFee,
            cartFee, walkingAllowed: walkingSchedule,
          },
        });
        const today = new Date();
        for (let i = 0; i < 8; i++) {
          const dt = new Date(today);
          dt.setDate(dt.getDate() + i);
          await generateTeeTimes(builtCourseId, dt.toISOString().split('T')[0]);
        }
      }

      const nineNameToId = new Map<string, string>();
      const comboKeyToProductId = new Map<string, string>();
      if (builtCourseId && (nineSpecs.length > 0 || productSpecs.length > 0)) {
        for (let i = 0; i < nineSpecs.length; i++) {
          const spec = nineSpecs[i];
          const nine = await prisma.nine.create({
            data: { courseId: builtCourseId, name: spec.name, par: spec.par, sortOrder: i },
          });
          nineNameToId.set(spec.name, nine.id);
        }
        for (let i = 0; i < productSpecs.length; i++) {
          const spec = productSpecs[i];
          const nineIds = spec.nineNames.map(n => nineNameToId.get(n)).filter((id): id is string => !!id);
          const product = await prisma.courseProduct.create({
            data: { courseId: builtCourseId, label: spec.label, holes: spec.holes, nineIds, active: true, sortOrder: i },
          });
          if (spec.comboKey) comboKeyToProductId.set(spec.comboKey, product.id);
        }
      }

      if (builtCourseId && Array.isArray(d.teeSets)) {
        const teeSets = d.teeSets as Record<string, unknown>[];
        for (let i = 0; i < teeSets.length; i++) {
          const ts = teeSets[i];
          if (!str(ts.name)) continue;
          const teeSet = await prisma.teeSet.create({
            data: {
              courseId: builtCourseId,
              name: str(ts.name),
              yardage: num(Number(ts.yardage) || 0, 0),
              rating: flt(ts.rating, 0),
              slope: num(Number(ts.slope) || 0, 0),
              sortOrder: i,
            },
          });

          // Per-nine yardage — keyed by nine name in the sheet, generic
          // across every layout (three_9s, the 18_plus_9 separate nine, etc).
          const nineYardages = (ts.nineYardages as Record<string, unknown>) || {};
          for (const [nineName, yardage] of Object.entries(nineYardages)) {
            const nineId = nineNameToId.get(nineName);
            if (!nineId || !yardage) continue;
            await prisma.teeSetNine.create({ data: { teeSetId: teeSet.id, nineId, yardage: num(Number(yardage), 0) } });
          }

          // Per-combo rating/slope — only meaningful for three_9s combos.
          const comboRatings = (ts.comboRatings as Record<string, { rating?: unknown; slope?: unknown }>) || {};
          for (const [comboKey, cr] of Object.entries(comboRatings)) {
            const productId = comboKeyToProductId.get(comboKey);
            if (!productId || !cr) continue;
            await prisma.courseProductTeeSet.create({
              data: { courseProductId: productId, teeSetId: teeSet.id, rating: flt(cr.rating, 0), slope: num(Number(cr.slope), 0) },
            });
          }
        }
      }

      if (builtCourseId && tierPasses.length > 0) {
        for (const p of tierPasses) {
          const type = str(p.type, 'membership');
          const name = str(p.name) || (type === 'other' ? str(p.otherType, 'Other') : PASS_TYPE_LABELS[type] || 'Membership');
          const perRound = str(p.perRound) === 'yes';
          const isFlatOverride = perRound && str(p.perRoundType) !== 'separate';
          const perRoundWeekday = isFlatOverride ? flt(p.perRoundWeekday || p.perRoundFee, 0) : null;
          const perRoundWeekend = isFlatOverride ? flt(p.perRoundWeekend, perRoundWeekday ?? 0) : null;

          const notesParts: string[] = [];
          if (str(p.includes)) notesParts.push(str(p.includes));
          if (perRound) {
            notesParts.push(
              str(p.perRoundType) === 'separate'
                ? `Per-round: separate fee on top of green fee (weekday $${flt(p.perRoundWeekday || p.perRoundFee, 0).toFixed(2)}${p.perRoundWeekend ? `, weekend $${flt(p.perRoundWeekend, 0).toFixed(2)}` : ''})`
                : 'Per-round: discounted green fee (set as tier rate above)'
            );
            if (str(p.perRoundCartIncluded) === 'yes') notesParts.push('Cart included');
          }
          if (type === 'resident_card') {
            if (str(p.residentWho)) notesParts.push(`Qualifies: ${str(p.residentWho)}`);
            notesParts.push(
              str(p.residentVerifType) === 'purchased'
                ? `Verification: purchased card${p.residentCardCost ? ` ($${flt(p.residentCardCost, 0).toFixed(2)})` : ''}${p.residentCardWhere ? `, ${str(p.residentCardWhere)}` : ''}${p.residentCardRenewal ? `, renews ${str(p.residentCardRenewal)}` : ''}`
                : 'Verification: free (ID at counter)'
            );
          }
          if (['season', 'per_punch'].includes(str(p.feePeriod))) {
            notesParts.push(`Billed ${str(p.feePeriod) === 'per_punch' ? 'per punch' : 'per season'}`);
          }

          await prisma.membershipTier.create({
            data: {
              courseId: builtCourseId,
              name,
              annualFee: flt(p.fee, 0),
              termMonths: str(p.feePeriod) === 'monthly' ? 1 : 12,
              greenFeeWeekday: perRoundWeekday,
              greenFeeWeekend: perRoundWeekend,
              notes: notesParts.join(' · '),
            },
          });
        }
      }

      return NextResponse.json({ courseId: builtCourseId, needsReview });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
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

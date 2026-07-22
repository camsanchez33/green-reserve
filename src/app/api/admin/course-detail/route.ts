import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { sendCourseLiveOrientationEmail } from '@/lib/email';
import { getApprovalState } from '@/lib/approval-state';
import { COMPLETED_BOOKING_STATUSES, computeCourseHealth } from '@/lib/course-metrics';
import { computeOpenChanges, CATEGORY_LABEL } from '@/lib/change-requests';
import { getCourseTimeline, isRemindersPaused, hasAcceptedAgreement, latestAgreementAcceptance } from '@/lib/course-timeline';
import { computeStripeGoLiveCheck } from '@/lib/go-live-preflight';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [course, recentBookings, totalBookings, revenue, staff, lastBookingAgg, priorBookingsCount, approval, unreadMessages, linkedInquiry, timeline] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, include: { operator: { select: { id: true, name: true, email: true, emailVerified: true, onboardingStep: true, phone: true } }, schedules: true } }),
    prisma.booking.findMany({ where: { courseId, status: { in: COMPLETED_BOOKING_STATUSES }, createdAt: { gte: thirtyDaysAgo } }, select: { id: true, golferName: true, golferEmail: true, players: true, totalAmount: true, createdAt: true, teeTime: { select: { date: true, time: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.booking.count({ where: { courseId, status: { in: COMPLETED_BOOKING_STATUSES } } }),
    prisma.booking.aggregate({ where: { courseId, status: { in: COMPLETED_BOOKING_STATUSES }, createdAt: { gte: thirtyDaysAgo } }, _sum: { greenFeeTotal: true, accessFeeTotal: true, totalAmount: true }, _count: { id: true } }),
    prisma.courseStaff.findMany({ where: { courseId }, select: { id: true, name: true, email: true, role: true, active: true } }),
    prisma.booking.aggregate({ where: { courseId }, _max: { createdAt: true } }),
    prisma.booking.count({ where: { courseId, status: { in: COMPLETED_BOOKING_STATUSES }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    getApprovalState(courseId),
    prisma.message.count({ where: { thread: { courseId }, senderType: 'operator', readAt: null, isBroadcast: false } }),
    prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true, createdAt: true, events: { select: { actorName: true, toStatus: true, createdAt: true } } } }),
    getCourseTimeline(courseId),
  ]);

  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const bookings30d = revenue._count.id;
  const health = computeCourseHealth({
    archivedAt: course.archivedAt,
    active: course.active,
    liveStatus: course.liveStatus,
    stripeAccountActive: course.stripeAccountActive,
    welcomeEmailSentAt: course.welcomeEmailSentAt,
    createdAt: course.createdAt,
    bookings30d,
    bookingsPrev30d: priorBookingsCount,
    hasLinkedInquiry: !!linkedInquiry,
  });

  const openChanges = linkedInquiry ? computeOpenChanges(linkedInquiry.events) : [];

  // A-05/ORPHAN SWEEP item 2 (FUTURE-PROOF) — the origin card: when did this
  // inquiry get picked up? First transition out of 'pending', falling back
  // to the inquiry's own createdAt if it was never explicitly moved (e.g.
  // built straight from the manual wizard).
  const acceptedEvent = linkedInquiry?.events.find(e => e.toStatus === 'in_review');
  const origin = linkedInquiry
    ? { inquiryId: linkedInquiry.id, acceptedAt: (acceptedEvent?.createdAt ?? linkedInquiry.createdAt).toISOString() }
    : null;

  return NextResponse.json({
    course,
    staff,
    recentBookings,
    totalBookings,
    revenue30d: {
      gross: (revenue._sum.totalAmount ?? 0) / 100,
      platform: (revenue._sum.accessFeeTotal ?? 0) / 100,
      greenFees: (revenue._sum.greenFeeTotal ?? 0) / 100,
    },
    bookings30d,
    lastBookingAt: lastBookingAgg._max.createdAt?.toISOString() ?? null,
    bookingsPrior30d: priorBookingsCount,
    // Approval is course-level truth, not inquiry trivia (RUN_QUEUE
    // "approval propagates + gates previews", item 1).
    approval: { status: approval.status, approvedAt: approval.approvedAt?.toISOString() ?? null },
    // A-04/A-05 shared brain: same worded-status logic the courses list uses.
    health,
    // ORPHAN SWEEP item 2 (FUTURE-PROOF) — the origin card. null means no
    // linked inquiry; the client shows that loudly, never pretends.
    origin,
    // A-05 item 3: Overview's "open items" — same computeOpenChanges brain
    // the inquiry detail page and the dashboard action queue use.
    openItems: {
      unreadMessages,
      openChanges: openChanges.map(c => CATEGORY_LABEL[c.category] || c.category),
      hasSchedule: (course.schedules ?? []).length > 0,
    },
    // A-05 items 4/5: course-timeline events (settings edits, reminders,
    // agreement acceptance, uploaded docs, notes) — null if there's no
    // linked inquiry to log against.
    timeline,
    remindersPaused: timeline ? isRemindersPaused(timeline) : false,
    // AGREEMENT = GO-LIVE GATE (RUN_QUEUE) — feeds the Setup checklist step
    // and the Overview health block the same way Stripe/approval already do.
    agreementAccepted: timeline ? !!latestAgreementAcceptance(timeline) : false,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { courseId, active, featured } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  // STRIPE RULE FINAL + AGREEMENT = GO-LIVE GATE (RUN_QUEUE) — "Set live" is
  // preflight-aware: the SAME two checks (go-live-preflight.ts /
  // course-timeline.ts) the inquiries mark_live action enforces, so this
  // page can never promise a go-live the server then refuses. Exactly two
  // absolutes, no override, ever — the old fee-conditional override path is
  // gone entirely.
  if (active === true) {
    const [stripeCheck, agreementOk] = await Promise.all([
      computeStripeGoLiveCheck(courseId),
      hasAcceptedAgreement(courseId),
    ]);
    if (stripeCheck && !stripeCheck.ok) {
      return NextResponse.json({ error: 'Stripe must be connected before this course can go live — no exceptions.', missing: 'stripe' }, { status: 400 });
    }
    if (!agreementOk) {
      return NextResponse.json({ error: 'The operator must accept the Operator Agreement before this course can go live — no exceptions.', missing: 'agreement' }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (active !== undefined) {
    data.active = active;
    data.liveStatus = active ? 'live' : 'draft';
  }
  if (featured !== undefined) data.featured = featured;
  const updated = await prisma.course.update({ where: { id: courseId }, data, include: { operator: { select: { name: true, email: true } } } });

  // Auto-advance linked inquiry from building → live when course is activated
  if (active === true) {
    const linked = await prisma.courseInquiry.findFirst({
      where: { builtCourseId: courseId, status: 'building' },
    });
    if (linked) {
      await prisma.courseInquiry.update({
        where: { id: linked.id },
        data: { status: 'live', wentLiveAt: new Date() },
      });
      await prisma.inquiryStatusEvent.create({
        data: {
          inquiryId: linked.id, fromStatus: 'building', toStatus: 'live',
          trigger: 'system', actorName: 'Course activated',
        },
      });
    }
    // Send welcome email once only — guard via welcomeEmailSentAt
    if (!updated.welcomeEmailSentAt && updated.operator) {
      try {
        await sendCourseLiveOrientationEmail({
          operatorName: updated.operator.name,
          operatorEmail: updated.operator.email,
          courseName: updated.name,
          courseSlug: updated.slug,
        });
        await prisma.course.update({ where: { id: courseId }, data: { welcomeEmailSentAt: new Date() } });
      } catch (e) {
        console.error('Go-live orientation email (course-detail activate) failed:', e);
      }
    }
  }

  return NextResponse.json(updated);
}

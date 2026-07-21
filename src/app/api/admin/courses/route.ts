import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { computeStripeGoLiveCheck } from '@/lib/go-live-preflight';
import { getApprovalState } from '@/lib/approval-state';
import { latestPageDecision } from '@/lib/change-requests';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Lightweight list for dropdowns — all courses including archived
  if (req.nextUrl.searchParams.get('simple') === '1') {
    const all = await prisma.course.findMany({
      select: { id: true, name: true, archivedAt: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(all);
  }

  // Lightweight single-course status — for preflight checks (e.g. Go Live).
  // Stripe check + approval state both come from the single shared brains
  // (go-live-preflight.ts / approval-state.ts) also used by mark_live's
  // server-side enforcement — the modal can never promise what the server
  // will then refuse.
  const statusId = req.nextUrl.searchParams.get('statusOf');
  if (statusId) {
    const course = await prisma.course.findUnique({
      where: { id: statusId },
      select: { id: true, operator: { select: { emailVerified: true } } },
    });
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [stripeCheck, approval] = await Promise.all([
      computeStripeGoLiveCheck(statusId),
      getApprovalState(statusId),
    ]);
    return NextResponse.json({
      stripeAccountActive: stripeCheck?.stripeAccountActive ?? false,
      stripeRequired: stripeCheck?.required ?? true,
      stripeOk: stripeCheck?.ok ?? false,
      lateCancellationFee: stripeCheck?.lateCancellationFee ?? 0,
      operatorEmailVerified: course.operator?.emailVerified ?? false,
      approvalStatus: approval.status,
    });
  }

  const showArchived = req.nextUrl.searchParams.get('showArchived') === '1';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [courses, bookingAggs, memberAggs, lastBookingAggs, priorBookingAggs] = await Promise.all([
    prisma.course.findMany({
      where: showArchived ? { archivedAt: { not: null } } : { archivedAt: null },
      include: { operator: { select: { email: true, name: true, onboardingStep: true, emailVerified: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.groupBy({
      by: ['courseId'],
      where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      _sum: { accessFeeTotal: true },
    }),
    prisma.courseMembership.groupBy({
      by: ['courseId'],
      where: { status: 'active' },
      _count: { id: true },
    }),
    prisma.booking.groupBy({
      by: ['courseId'],
      _max: { createdAt: true },
    }),
    prisma.booking.groupBy({
      by: ['courseId'],
      where: { status: 'confirmed', createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _count: { id: true },
    }),
  ]);

  const bookingMap = new Map(bookingAggs.map(b => [b.courseId, { count: b._count.id, revenue: (b._sum.accessFeeTotal ?? 0) / 100 }]));
  const memberMap = new Map(memberAggs.map(m => [m.courseId, m._count.id]));
  const lastBookingMap = new Map(lastBookingAggs.map(b => [b.courseId, b._max.createdAt?.toISOString() ?? null]));
  const priorBookingMap = new Map(priorBookingAggs.map(b => [b.courseId, b._count.id]));

  // Approval is course-level truth (item 1) — batched rather than N+1'd:
  // one inquiry lookup + one events lookup for every draft course at once,
  // then the SAME shared latestPageDecision brain everything else uses.
  const draftCourseIds = courses.filter(c => !c.active).map(c => c.id);
  const approvalByCourseId = new Map<string, 'none' | 'approved' | 'changes_requested'>();
  if (draftCourseIds.length > 0) {
    const inquiries = await prisma.courseInquiry.findMany({
      where: { builtCourseId: { in: draftCourseIds } },
      select: { id: true, builtCourseId: true },
    });
    const inquiryIds = inquiries.map(i => i.id);
    const events = inquiryIds.length > 0
      ? await prisma.inquiryStatusEvent.findMany({
          where: { inquiryId: { in: inquiryIds } },
          select: { inquiryId: true, actorName: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const eventsByInquiryId = new Map<string, typeof events>();
    for (const ev of events) {
      if (!eventsByInquiryId.has(ev.inquiryId)) eventsByInquiryId.set(ev.inquiryId, []);
      eventsByInquiryId.get(ev.inquiryId)!.push(ev);
    }
    for (const inq of inquiries) {
      if (!inq.builtCourseId) continue;
      approvalByCourseId.set(inq.builtCourseId, latestPageDecision(eventsByInquiryId.get(inq.id) ?? []) ?? 'none');
    }
  }

  const result = courses.map(c => ({
    ...c,
    bookings30d: bookingMap.get(c.id)?.count ?? 0,
    revenue30d: bookingMap.get(c.id)?.revenue ?? 0,
    activeMemberCount: memberMap.get(c.id) ?? 0,
    lastBookingAt: lastBookingMap.get(c.id) ?? null,
    bookingsPrior30d: priorBookingMap.get(c.id) ?? 0,
    approvalStatus: approvalByCourseId.get(c.id) ?? 'none',
  }));

  return NextResponse.json(result);
}

// Archive/restore/delete all route through src/lib/lifecycle.ts via
// POST /api/admin/archive-course (LIFECYCLE PARITY LAW — one shared service,
// no second implementation here). This DELETE handler had drifted from that
// (it archived the course but never actually flipped the linked inquiry's
// status, only logged a mislabeled event) and had no callers left — removed
// rather than fixed, since archivePair is the one place this logic belongs.

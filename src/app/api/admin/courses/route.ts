import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, VIEWER_PLUS, MANAGER_PLUS } from '@/lib/admin-session';
import { computeStripeGoLiveCheck } from '@/lib/go-live-preflight';
import { getApprovalState } from '@/lib/approval-state';
import { latestPageDecision } from '@/lib/change-requests';
import { COMPLETED_BOOKING_STATUSES, computeCourseHealth } from '@/lib/course-metrics';
import { hasAcceptedAgreement } from '@/lib/agreement-gate';
import { setupProgress } from '@/lib/course-setup';
import { nextCheckIn, lastContact, scheduledCheckIn } from '@/lib/course-checkin';
import { agreementDueByCourse } from '@/lib/agreement-required';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2b / viewer bug: the list is open to viewers, but HARDENING_SPEC gives
  // viewer no financial ledger and no PII — so below SUPPORT_PLUS the rows are
  // shaped (operator email, revenue30d, adminNotes, stripeAccountId removed)
  // at the bottom of this handler. The gate alone was not enough.
  if (!requireRole(session, VIEWER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const seesMoneyAndPii = requireRole(session, SUPPORT_PLUS);

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
    const [stripeCheck, approval, agreementAccepted] = await Promise.all([
      computeStripeGoLiveCheck(statusId),
      getApprovalState(statusId),
      hasAcceptedAgreement(statusId),
    ]);
    return NextResponse.json({
      stripeAccountActive: stripeCheck?.stripeAccountActive ?? false,
      stripeRequired: stripeCheck?.required ?? true,
      stripeOk: stripeCheck?.ok ?? false,
      lateCancellationFee: stripeCheck?.lateCancellationFee ?? 0,
      operatorEmailVerified: course.operator?.emailVerified ?? false,
      approvalStatus: approval.status,
      // AGREEMENT = GO-LIVE GATE (RUN_QUEUE) — the second absolute, no
      // override, same tier as Stripe.
      agreementAccepted,
    });
  }

  const showArchived = req.nextUrl.searchParams.get('showArchived') === '1';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // MP-10: the courses come first so every aggregate below is bounded to the
  // ids on this list (active OR archived, never both). The all-time
  // last-booking groupBy in particular scanned every booking of every course
  // — including the archived half that this response was about to drop.
  const courses = await prisma.course.findMany({
    where: showArchived ? { archivedAt: { not: null } } : { archivedAt: null },
    include: {
      operator: { select: { email: true, name: true, onboardingStep: true, emailVerified: true } },
      // CS-1: check-in calls — few per course, newest first.
      calls: {
        where: { kind: 'checkin' }, orderBy: { scheduledAt: 'desc' },
        select: { id: true, kind: true, scheduledAt: true, outcome: true, durationMin: true, direction: true, phone: true, completedAt: true, notes: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const listedIds = courses.map(c => c.id);
  const inListed = { courseId: { in: listedIds } };

  const [bookingAggs, memberAggs, lastBookingAggs, priorBookingAggs, linkedInquiries] = await Promise.all([
    prisma.booking.groupBy({
      by: ['courseId'],
      where: { ...inListed, status: { in: COMPLETED_BOOKING_STATUSES }, createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      _sum: { accessFeeTotal: true },
    }),
    prisma.courseMembership.groupBy({
      by: ['courseId'],
      where: { ...inListed, status: 'active' },
      _count: { id: true },
    }),
    // MP-5a: the one aggregate on this page with no status filter, so a
    // cancelled booking counted as the course's last activity — quietly
    // defeating the going-quiet detection this feeds.
    prisma.booking.groupBy({
      by: ['courseId'],
      where: { ...inListed, status: { in: COMPLETED_BOOKING_STATUSES } },
      _max: { createdAt: true },
    }),
    prisma.booking.groupBy({
      by: ['courseId'],
      where: { ...inListed, status: { in: COMPLETED_BOOKING_STATUSES }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _count: { id: true },
    }),
    // ORPHAN SWEEP tripwire (RUN_QUEUE) — every course should have a linked
    // inquiry; this is the cheap batched check the health brain needs to
    // flag one that doesn't, instead of pretending it's just another draft.
    // CS-1: the linked inquiry's id and its discovery calls ride along so a
    // "Getting live" row can show a scheduled discovery call as its next touch.
    prisma.courseInquiry.findMany({
      where: { builtCourseId: { not: null } },
      select: {
        id: true, builtCourseId: true,
        calls: { where: { kind: 'discovery' }, orderBy: { scheduledAt: 'desc' }, select: { id: true, kind: true, scheduledAt: true, outcome: true, durationMin: true, direction: true, completedAt: true } },
      },
    }),
  ]);

  const bookingMap = new Map(bookingAggs.map(b => [b.courseId, { count: b._count.id, revenue: (b._sum.accessFeeTotal ?? 0) / 100 }]));
  const memberMap = new Map(memberAggs.map(m => [m.courseId, m._count.id]));
  const lastBookingMap = new Map(lastBookingAggs.map(b => [b.courseId, b._max.createdAt?.toISOString() ?? null]));
  const priorBookingMap = new Map(priorBookingAggs.map(b => [b.courseId, b._count.id]));
  const linkedCourseIds = new Set(linkedInquiries.map(i => i.builtCourseId));
  // AG-3 §4: "Agreement due <date>" / "Agreement overdue" for the Status cell.
  const agreementDue = await agreementDueByCourse(listedIds);
  const linkedByCourseId = new Map(linkedInquiries.map(i => [i.builtCourseId as string, i]));

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

  const result = courses.map(c => {
    const bookings30d = bookingMap.get(c.id)?.count ?? 0;
    const bookingsPrior30d = priorBookingMap.get(c.id) ?? 0;
    const approvalStatus = approvalByCourseId.get(c.id) ?? 'none';
    const linked = linkedByCourseId.get(c.id);
    return {
      ...c,
      // CS-1: the five setup steps, the linked inquiry and its discovery calls.
      setup: setupProgress({ ...c, approvalStatus }),
      linkedInquiryId: linked?.id ?? null,
      inquiryCalls: linked?.calls ?? [],
      agreementDue: agreementDue.get(c.id) ?? null,
      bookings30d,
      revenue30d: bookingMap.get(c.id)?.revenue ?? 0,
      activeMemberCount: memberMap.get(c.id) ?? 0,
      lastBookingAt: lastBookingMap.get(c.id) ?? null,
      bookingsPrior30d,
      approvalStatus,
      // A-04 item 2: ONE worded status chip, worst truth wins — same brain
      // the course detail header uses (course-metrics.ts).
      health: computeCourseHealth({
        archivedAt: c.archivedAt,
        active: c.active,
        liveStatus: c.liveStatus,
        stripeAccountActive: c.stripeAccountActive,
        welcomeEmailSentAt: c.welcomeEmailSentAt,
        createdAt: c.createdAt,
        bookings30d,
        bookingsPrev30d: bookingsPrior30d,
        hasLinkedInquiry: linkedCourseIds.has(c.id),
      }),
    };
  });

  // CS-2 §1: the sheet as a CSV — same auth as the list, money and PII
  // blanked below SUPPORT_PLUS exactly as the JSON is.
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : '');
    const header = ['course', 'city', 'state', 'type', 'operator', 'operator email', 'live', 'health', 'health reason', 'setup done', 'next step', 'bookings 30d', 'fees 30d', 'next touch', 'last talked', 'live since', 'archived'];
    const lines = [header.map(esc).join(',')];
    for (const c of result) {
      const gettingLive = c.health.status === 'setup_incomplete' || c.health.status === 'orphaned';
      const touch = gettingLive ? scheduledCheckIn(c.inquiryCalls.map(x => ({ ...x, kind: 'checkin' }))) : null;
      const nextTouch = gettingLive ? (touch ? new Date(touch.scheduledAt) : null) : nextCheckIn(c, c.calls);
      const talked = lastContact([...c.calls, ...c.inquiryCalls]);
      lines.push([
        c.name, c.city, c.state, c.type || 'public',
        c.operator?.name ?? '', seesMoneyAndPii ? (c.operator?.email ?? '') : '',
        c.active ? 'yes' : 'no', c.health.label, c.health.reason,
        `${c.setup.done} of ${c.setup.total}`, c.setup.next?.short ?? '',
        c.bookings30d, seesMoneyAndPii ? c.revenue30d.toFixed(2) : '',
        iso(nextTouch), talked ? iso(talked.at) : '', iso(c.welcomeEmailSentAt), iso(c.archivedAt),
      ].map(esc).join(','));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(lines.join(String.fromCharCode(13, 10)), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="courses-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (seesMoneyAndPii) return NextResponse.json(result);
  return NextResponse.json(result.map(c => {
    const { adminNotes: _n, stripeAccountId: _s, operator, ...rest } = c;
    return { ...rest, adminNotes: '', stripeAccountId: null, revenue30d: null, operator: operator ? { ...operator, email: '' } : null };
  }));
}

// Archive/restore/delete all route through src/lib/lifecycle.ts via
// POST /api/admin/archive-course (LIFECYCLE PARITY LAW — one shared service,
// no second implementation here). This DELETE handler had drifted from that
// (it archived the course but never actually flipped the linked inquiry's
// status, only logged a mislabeled event) and had no callers left — removed
// rather than fixed, since archivePair is the one place this logic belongs.

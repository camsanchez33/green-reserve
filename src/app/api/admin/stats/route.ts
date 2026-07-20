import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { ACTIVE_STATUSES } from '@/lib/inquiry-status';

const COMPLETED = ['confirmed', 'completed'];

function weekStartKey(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().split('T')[0];
}
function dayKeyOf(d: Date) {
  return d.toISOString().split('T')[0];
}

type Bucket = { gross: number; fees: number };

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isSupportPlus = requireRole(session, SUPPORT_PLUS);

  const now = new Date();
  const startOfToday = new Date(dayKeyOf(now) + 'T00:00:00.000Z');
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const todayDateStr = dayKeyOf(now);

  // Money-ticker source ranges (A-01e — cumulative line, not bars):
  // 37 days back covers the day-ticker's "yesterday" and the week-ticker's
  // "this week so far" / "prior week to the same day" (both reuse dayMap).
  // The month-ticker's ghost (last calendar month) needs its own range since
  // it can reach ~60 days back.
  const dayMapStart = new Date(now.getTime() - 36 * 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const [
    totalCourses,
    archivedCourses,
    activeCourses,
    pendingInquiries,
    oldestPending,

    feesTodayAgg,
    checkInsToday,
    cancellationsToday,

    unreadMessages,
    newestUnread,

    draftCourses,
    draftCoursesCount,

    recentRevenue,
    prevRevenue,
    recentBookings,
    prevBookings,
    newCourses30d,
    newCoursesPrev30d,

    bookingsFor37d,
    prevMonthTickerBookings,

    failedCharges,
    failedChargesCount,
    noStripe,

    waitingOnUs,
    waitingOnUsCount,
    draftsAmber,
    draftsAmberCount,
    previewSentEventsRaw,
    sheetNoResponse,
    sheetNoResponseCount,
    threadsForUnanswered,

    newInquiriesMTD,
    sheetsOutMTDRaw,
    buildingMTDRaw,
    wentLiveMTD,
    teeSheetBookingsToday,
    activeCoursesList,
    bookingsByCourse30dRaw,
    bookingsByCoursePrev30dRaw,
  ] = await Promise.all([
    prisma.course.count({ where: { archivedAt: null } }),
    prisma.course.count({ where: { archivedAt: { not: null } } }),
    prisma.course.count({ where: { active: true } }),
    prisma.courseInquiry.count({ where: { status: 'pending' } }),
    prisma.courseInquiry.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),

    prisma.booking.aggregate({ where: { status: { in: COMPLETED }, createdAt: { gte: startOfToday } }, _sum: { accessFeeTotal: true }, _count: true }),
    prisma.booking.count({ where: { checkedInAt: { gte: startOfToday } } }),
    prisma.booking.count({ where: { cancelledAt: { gte: startOfToday } } }),

    isSupportPlus ? prisma.message.count({ where: { readAt: null, senderType: 'operator' } }).catch(() => 0) : Promise.resolve(0),
    isSupportPlus ? prisma.message.findFirst({ where: { readAt: null, senderType: 'operator' }, orderBy: { createdAt: 'desc' }, select: { senderName: true } }).catch(() => null) : Promise.resolve(null),

    prisma.course.findMany({ where: { active: false, archivedAt: null }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.course.count({ where: { active: false, archivedAt: null } }),

    prisma.booking.aggregate({ where: { status: { in: COMPLETED }, createdAt: { gte: thirtyDaysAgo } }, _sum: { accessFeeTotal: true } }),
    prisma.booking.aggregate({ where: { status: { in: COMPLETED }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { accessFeeTotal: true } }),
    prisma.booking.count({ where: { status: { in: COMPLETED }, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.booking.count({ where: { status: { in: COMPLETED }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.course.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.course.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),

    prisma.booking.findMany({ where: { status: { in: COMPLETED }, createdAt: { gte: dayMapStart } }, select: { createdAt: true, accessFeeTotal: true, totalAmount: true } }),
    prisma.booking.findMany({ where: { status: { in: COMPLETED }, createdAt: { gte: prevMonthStart, lt: startOfMonth } }, select: { createdAt: true, accessFeeTotal: true, totalAmount: true } }),

    isSupportPlus
      ? prisma.booking.findMany({
          where: { checkInFailReason: { not: '' }, checkedInAt: null },
          select: { id: true, courseId: true, golferName: true, totalAmount: true, checkInFailReason: true, createdAt: true, course: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
    isSupportPlus ? prisma.booking.count({ where: { checkInFailReason: { not: '' }, checkedInAt: null } }) : Promise.resolve(0),
    prisma.course.findMany({ where: { active: true, stripeAccountActive: false, archivedAt: null }, select: { id: true, name: true, slug: true }, take: 5 }),

    prisma.courseInquiry.findMany({
      where: { status: { in: ACTIVE_STATUSES.filter(s => s !== 'details_requested') }, updatedAt: { lt: threeDaysAgo } },
      select: { id: true, courseName: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 5,
    }),
    prisma.courseInquiry.count({ where: { status: { in: ACTIVE_STATUSES.filter(s => s !== 'details_requested') }, updatedAt: { lt: threeDaysAgo } } }),
    prisma.course.findMany({ where: { active: false, archivedAt: null, createdAt: { lt: twoDaysAgo } }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 5 }),
    prisma.course.count({ where: { active: false, archivedAt: null, createdAt: { lt: twoDaysAgo } } }),
    prisma.inquiryStatusEvent.findMany({
      where: { actorName: { startsWith: 'Preview sent' }, createdAt: { lt: fiveDaysAgo } },
      select: { inquiryId: true, createdAt: true, inquiry: { select: { id: true, courseName: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.courseInquiry.findMany({ where: { status: 'details_requested', updatedAt: { lt: sevenDaysAgo } }, select: { id: true, courseName: true, updatedAt: true }, orderBy: { updatedAt: 'asc' }, take: 5 }),
    prisma.courseInquiry.count({ where: { status: 'details_requested', updatedAt: { lt: sevenDaysAgo } } }),
    prisma.messageThread.findMany({
      select: { id: true, courseId: true, course: { select: { name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { senderType: true, senderName: true, createdAt: true } } },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    }),

    prisma.courseInquiry.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.inquiryStatusEvent.groupBy({ by: ['inquiryId'], where: { toStatus: 'details_requested', createdAt: { gte: startOfMonth } } }),
    prisma.inquiryStatusEvent.groupBy({ by: ['inquiryId'], where: { toStatus: 'building', createdAt: { gte: startOfMonth } } }),
    prisma.courseInquiry.count({ where: { wentLiveAt: { gte: startOfMonth } } }),
    prisma.booking.findMany({ where: { status: { in: COMPLETED }, teeTime: { date: todayDateStr } }, select: { checkedInAt: true, totalAmount: true, accessFeeTotal: true } }),
    prisma.course.findMany({ where: { active: true, archivedAt: null }, select: { id: true, name: true, createdAt: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { status: { in: COMPLETED }, createdAt: { gte: thirtyDaysAgo } }, _count: { id: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { status: { in: COMPLETED }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _count: { id: true } }),
  ]);

  // ---- top strip ----
  const topStrip = {
    feesToday: Number(feesTodayAgg._sum.accessFeeTotal ?? 0) / 100,
    bookingsToday: feesTodayAgg._count,
    checkInsToday,
    cancellationsToday,
    unreadMessages,
    unreadNewestSender: newestUnread?.senderName ?? null,
    waitingNewInquiries: pendingInquiries,
    waitingOldestAgeDays: oldestPending ? Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 86400000) : null,
    waitingDrafts: draftCoursesCount,
    waitingDraftsList: draftCourses.slice(0, 3).map(c => ({ id: c.id, name: c.name })),
  };

  // ---- action queue ----
  // Rows are GROUPED by course/inquiry where the same issue can genuinely
  // recur for one entity (failed charges) — at 1000 courses an ungrouped list
  // of individual charges is unusable. Every row carries a "doThis" line (the
  // literal next step) and rows whose fix is an email/nudge carry a `fire`
  // descriptor so the client can send it inline instead of just linking out.
  type QueueItem = { id: string; label: string; ageDays: number };
  type Row = {
    id: string; who: string; why: string; doThis: string; ageDays: number;
    actionLabel: string; href: string; amount?: string; count?: number; items?: QueueItem[];
    fire?: { kind: 'resend_preview' | 'resend_sheet' | 'send_nudge'; inquiryId?: string; courseId?: string };
  };

  const failedByCourse = new Map<string, { courseName: string; items: { id: string; golferName: string; amount: number; ageDays: number }[] }>();
  for (const b of failedCharges) {
    if (!failedByCourse.has(b.courseId)) failedByCourse.set(b.courseId, { courseName: b.course.name, items: [] });
    failedByCourse.get(b.courseId)!.items.push({
      id: b.id,
      golferName: b.golferName,
      amount: b.totalAmount / 100,
      ageDays: Math.floor((now.getTime() - b.createdAt.getTime()) / 86400000),
    });
  }
  const failedRows: Row[] = Array.from(failedByCourse.entries()).map(([courseId, g]) => {
    const total = g.items.reduce((s, i) => s + i.amount, 0);
    const oldest = Math.max(...g.items.map(i => i.ageDays));
    return {
      id: `fc-${courseId}`,
      who: g.courseName,
      why: `${g.items.length} failed charge${g.items.length === 1 ? '' : 's'} · $${total.toFixed(2)} · oldest ${oldest}d`,
      doThis: 'Card on file is failing at check-in — contact the golfer(s) to update payment, then retry from Revenue.',
      ageDays: oldest,
      actionLabel: 'Review',
      href: '/admin/revenue',
      count: g.items.length,
      items: g.items.length > 1 ? g.items.map(i => ({ id: i.id, label: `${i.golferName} — $${i.amount.toFixed(2)}`, ageDays: i.ageDays })) : undefined,
    };
  });

  const red: Row[] = [
    ...failedRows,
    ...noStripe.map(c => ({
      id: `ns-${c.id}`,
      who: c.name,
      why: 'Live but can’t take payments — Stripe incomplete',
      doThis: 'Operator hasn’t finished connecting their bank account — check their Setup tab and follow up if they’re stuck.',
      ageDays: 0,
      actionLabel: 'Fix Stripe',
      href: `/admin/courses?courseId=${c.id}&tab=overview`,
    })),
  ];
  const redCount = failedChargesCount + noStripe.length;

  const waitingOnUsDoThis: Record<string, string> = {
    pending: 'Review the inquiry and either request their details sheet or reject it.',
    in_review: 'Finish reviewing — request their details sheet or reject it.',
    details_submitted: 'Sheet’s back — review their answers and build the course.',
    building: 'Course is mid-build — finish it, then send dashboard access or go live.',
  };
  const waitingOnUsRows: Row[] = waitingOnUs.map(i => ({
    id: `wu-${i.id}`,
    who: i.courseName,
    why: `Waiting on us — ${i.status.replace('_', ' ')}`,
    doThis: waitingOnUsDoThis[i.status] ?? 'Needs our next action.',
    ageDays: Math.floor((now.getTime() - i.updatedAt.getTime()) / 86400000),
    actionLabel: 'Open',
    href: `/admin/inquiries/${i.id}`,
  }));

  const draftsAmberRows: Row[] = draftsAmber.map(c => ({
    id: `dr-${c.id}`,
    who: c.name,
    why: 'Draft not yet live',
    doThis: 'Course was built but setup was never finished — complete it and go live from its Overview tab.',
    ageDays: Math.floor((now.getTime() - c.createdAt.getTime()) / 86400000),
    actionLabel: 'Review',
    href: `/admin/courses?courseId=${c.id}&tab=overview`,
  }));

  const previewSeen = new Set<string>();
  const previewSentAmber: Row[] = [];
  for (const ev of previewSentEventsRaw) {
    if (previewSeen.has(ev.inquiryId)) continue;
    previewSeen.add(ev.inquiryId);
    // Allow-list, not deny-list: only inquiries still actually in the active
    // pipeline can be "stalled." An inquiry whose course later got archived
    // keeps its old InquiryStatusEvent history, so denying just 'live'/
    // 'rejected' let stale 'archived' inquiries surface here forever.
    if (!ev.inquiry || !(ACTIVE_STATUSES as readonly string[]).includes(ev.inquiry.status)) continue;
    previewSentAmber.push({
      id: `ps-${ev.inquiryId}`,
      who: ev.inquiry.courseName,
      why: 'Preview sent, no reply',
      doThis: 'They haven’t responded to the preview — resend it or call to confirm they saw it.',
      ageDays: Math.floor((now.getTime() - ev.createdAt.getTime()) / 86400000),
      actionLabel: 'Open',
      href: `/admin/inquiries/${ev.inquiryId}`,
      fire: { kind: 'resend_preview', inquiryId: ev.inquiryId },
    });
  }

  const sheetNoResponseRows: Row[] = sheetNoResponse.map(i => ({
    id: `sh-${i.id}`,
    who: i.courseName,
    why: 'Sheet sent, no response',
    doThis: 'They haven’t submitted their details sheet — resend the link or follow up by phone.',
    ageDays: Math.floor((now.getTime() - i.updatedAt.getTime()) / 86400000),
    actionLabel: 'Open',
    href: `/admin/inquiries/${i.id}`,
    fire: { kind: 'resend_sheet', inquiryId: i.id },
  }));

  const threadAmber: Row[] = threadsForUnanswered
    .filter(t => t.messages[0]?.senderType === 'operator' && t.messages[0].createdAt < twoDaysAgo)
    .map(t => ({
      id: `msg-${t.id}`,
      who: t.course.name,
      why: `Message from ${t.messages[0].senderName}, unanswered`,
      doThis: 'They’re waiting on a reply — send a quick nudge or a full response.',
      ageDays: Math.floor((now.getTime() - t.messages[0].createdAt.getTime()) / 86400000),
      actionLabel: 'Reply',
      href: '/admin/messages',
      fire: { kind: 'send_nudge', courseId: t.courseId },
    }));

  const amber: Row[] = [
    ...waitingOnUsRows,
    ...draftsAmberRows,
    ...previewSentAmber,
    ...sheetNoResponseRows,
    ...threadAmber,
  ].sort((a, b) => b.ageDays - a.ageDays).slice(0, 5);

  const amberCount = waitingOnUsCount + draftsAmberCount + previewSentAmber.length + sheetNoResponseCount + threadAmber.length;

  // ---- revenue: cumulative money ticker (A-01e — supersedes the A-01c bars) ----
  // Every point is inherently an honest "so far" comparison: both the current
  // line and its ghost are only ever drawn up to the SAME elapsed x-position,
  // so there's no separate in-progress special-case to apply — the design
  // itself can't produce a finished-vs-unfinished mismatch.
  const dayMap: Record<string, Bucket> = {};
  for (let i = 36; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap[dayKeyOf(d)] = { gross: 0, fees: 0 };
  }
  const todayHourly: Bucket[] = Array.from({ length: 24 }, () => ({ gross: 0, fees: 0 }));
  const yesterdayHourly: Bucket[] = Array.from({ length: 24 }, () => ({ gross: 0, fees: 0 }));
  for (const b of bookingsFor37d) {
    const gross = b.totalAmount / 100;
    const fees = b.accessFeeTotal / 100;
    const dk = dayKeyOf(b.createdAt);
    if (dayMap[dk]) { dayMap[dk].gross += gross; dayMap[dk].fees += fees; }
    if (b.createdAt >= startOfToday) {
      const bucket = todayHourly[b.createdAt.getUTCHours()];
      bucket.gross += gross; bucket.fees += fees;
    } else if (b.createdAt >= yesterdayStart) {
      const bucket = yesterdayHourly[b.createdAt.getUTCHours()];
      bucket.gross += gross; bucket.fees += fees;
    }
  }

  // Day view: cumulative fees since midnight vs yesterday's cumulative at the
  // same time-of-day — "am I ahead of yesterday" in one glance.
  const currentHour = now.getUTCHours();
  const dayTicker: { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number }[] = [];
  {
    let curGross = 0, curFees = 0, ghostGross = 0, ghostFees = 0;
    for (let h = 0; h <= currentHour; h++) {
      curGross += todayHourly[h].gross; curFees += todayHourly[h].fees;
      ghostGross += yesterdayHourly[h].gross; ghostFees += yesterdayHourly[h].fees;
      dayTicker.push({ t: h, gross: curGross, fees: curFees, ghostGross, ghostFees });
    }
  }

  // Week view: cumulative since Monday vs last week's line to the same day.
  const thisWeekMonday = new Date(weekStartKey(now) + 'T00:00:00.000Z');
  const elapsedDaysThisWeek = Math.floor((startOfToday.getTime() - thisWeekMonday.getTime()) / 86400000) + 1;
  const priorWeekMonday = new Date(thisWeekMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekTicker: { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number }[] = [];
  {
    let curGross = 0, curFees = 0, ghostGross = 0, ghostFees = 0;
    for (let i = 0; i < elapsedDaysThisWeek; i++) {
      const curBucket = dayMap[dayKeyOf(new Date(thisWeekMonday.getTime() + i * 86400000))] ?? { gross: 0, fees: 0 };
      const ghostBucket = dayMap[dayKeyOf(new Date(priorWeekMonday.getTime() + i * 86400000))] ?? { gross: 0, fees: 0 };
      curGross += curBucket.gross; curFees += curBucket.fees;
      ghostGross += ghostBucket.gross; ghostFees += ghostBucket.fees;
      weekTicker.push({ t: i, gross: curGross, fees: curFees, ghostGross, ghostFees });
    }
  }

  // Month view: cumulative since the 1st vs last month's line to the same day.
  const prevMonthDaily: Record<number, Bucket> = {};
  for (const b of prevMonthTickerBookings) {
    const dom = b.createdAt.getUTCDate();
    if (!prevMonthDaily[dom]) prevMonthDaily[dom] = { gross: 0, fees: 0 };
    prevMonthDaily[dom].gross += b.totalAmount / 100;
    prevMonthDaily[dom].fees += b.accessFeeTotal / 100;
  }
  const daysElapsedThisMonth = now.getUTCDate();
  const monthTicker: { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number }[] = [];
  {
    let curGross = 0, curFees = 0, ghostGross = 0, ghostFees = 0;
    for (let d = 1; d <= daysElapsedThisMonth; d++) {
      const curBucket = dayMap[dayKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d)))] ?? { gross: 0, fees: 0 };
      const ghostBucket = prevMonthDaily[d] ?? { gross: 0, fees: 0 };
      curGross += curBucket.gross; curFees += curBucket.fees;
      ghostGross += ghostBucket.gross; ghostFees += ghostBucket.fees;
      monthTicker.push({ t: d, gross: curGross, fees: curFees, ghostGross, ghostFees });
    }
  }

  const revenue = { day: dayTicker, week: weekTicker, month: monthTicker };

  // ---- bottom trio (replaces Top Courses — rankings without purpose) ----
  const pipeline = {
    newInquiries: newInquiriesMTD,
    sheetsOut: sheetsOutMTDRaw.length,
    building: buildingMTDRaw.length,
    wentLive: wentLiveMTD,
  };

  // A-01f: lead with OUR take (GR fees), not the course's gross — the
  // headline is $1.50/player across today's uncompleted rounds. Spec text
  // also asked to fold in "pending late-cancel fees," but those charges are
  // 100% course revenue today (chargeOnConnectedAccount is called with
  // applicationFeeCents: 0 for late-cancel charges in both
  // cron/cancellation-cutoff and cron/hourly) — GR takes no cut, so
  // including them would misstate "our take" in the exact way this fix is
  // meant to prevent. Left out; flagged in REVISE_QUEUE.md for Cam.
  const uncheckedInToday = teeSheetBookingsToday.filter(b => b.checkedInAt === null);
  const teeSheetToday = {
    roundsToday: teeSheetBookingsToday.length,
    checkInsDone: teeSheetBookingsToday.filter(b => b.checkedInAt !== null).length,
    grFeesExpected: uncheckedInToday.reduce((s, b) => s + b.accessFeeTotal, 0) / 100,
    grossExpected: uncheckedInToday.reduce((s, b) => s + b.totalAmount, 0) / 100,
  };

  // Course health watchlist: courses trending DOWN vs their own prior 30d.
  // Only judged once a course has >=60d of history — otherwise "0 bookings"
  // just means it's new, not declining. Operator-inactivity is a real signal
  // Cam asked for too, but there's no login-timestamp field on CourseOperator
  // today — adding one is a schema change, out of scope for a revise run, so
  // this watchlist covers booking-volume decline only for now.
  const curBookingsMap = new Map(bookingsByCourse30dRaw.map(r => [r.courseId, r._count.id]));
  const prevBookingsMap = new Map(bookingsByCoursePrev30dRaw.map(r => [r.courseId, r._count.id]));
  const watchlistRaw: { id: string; name: string; reason: string; severity: number }[] = [];
  for (const c of activeCoursesList) {
    if (c.createdAt > sixtyDaysAgo) continue;
    const cur = curBookingsMap.get(c.id) ?? 0;
    const prev = prevBookingsMap.get(c.id) ?? 0;
    if (prev === 0 && cur === 0) continue;
    if (cur === 0 && prev > 0) {
      watchlistRaw.push({ id: c.id, name: c.name, reason: `Zero bookings in 30d (had ${prev} prior)`, severity: 1000 + prev });
    } else if (prev > 0) {
      const dropPct = ((prev - cur) / prev) * 100;
      if (dropPct > 40) watchlistRaw.push({ id: c.id, name: c.name, reason: `Bookings down ${dropPct.toFixed(0)}% vs prior 30d (${cur} vs ${prev})`, severity: dropPct });
    }
  }
  const courseHealthWatchlist = watchlistRaw.sort((a, b) => b.severity - a.severity).slice(0, 5).map(({ severity: _severity, ...rest }) => rest);

  return NextResponse.json({
    pendingInquiries,
    topStrip,
    actionQueue: { red, redCount, amber, amberCount },
    revenue,
    thirtyDay: {
      activeCourses,
      totalCourses,
      archivedCourses,
      newCourses30d,
      newCoursesPrev30d,
      bookings30d: recentBookings,
      bookingsPrev30d: prevBookings,
      fees30d: Number(recentRevenue._sum.accessFeeTotal ?? 0) / 100,
      feesPrev30d: Number(prevRevenue._sum.accessFeeTotal ?? 0) / 100,
    },
    bottomTrio: { pipeline, teeSheetToday, courseHealthWatchlist },
  });
}

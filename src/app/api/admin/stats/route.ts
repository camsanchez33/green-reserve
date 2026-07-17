import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';

const COMPLETED = ['confirmed', 'completed'];

function weekStartKey(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().split('T')[0];
}
function monthKeyOf(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function dayKeyOf(d: Date) {
  return d.toISOString().split('T')[0];
}

type Bucket = { gross: number; fees: number; bookings: number };

function seriesFromMap(map: Record<string, Bucket>, show: number, ghostKey?: (key: string) => string) {
  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  return entries.slice(-show).map(([key, v]) => {
    let ghost: Bucket = { gross: 0, fees: 0, bookings: 0 };
    if (ghostKey) {
      ghost = map[ghostKey(key)] ?? ghost;
    } else {
      const idx = entries.findIndex(([k]) => k === key);
      ghost = idx > 0 ? entries[idx - 1][1] : ghost;
    }
    return { key, gross: v.gross, fees: v.fees, bookings: v.bookings, ghostGross: ghost.gross, ghostFees: ghost.fees };
  });
}

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
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1));

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

    bookingsForChart,

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

    prisma.booking.findMany({ where: { status: { in: COMPLETED }, createdAt: { gte: chartStart } }, select: { createdAt: true, accessFeeTotal: true, totalAmount: true } }),

    isSupportPlus
      ? prisma.booking.findMany({
          where: { checkInFailReason: { not: '' }, checkedInAt: null },
          select: { id: true, courseId: true, golferName: true, totalAmount: true, checkInFailReason: true, createdAt: true, course: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : Promise.resolve([]),
    isSupportPlus ? prisma.booking.count({ where: { checkInFailReason: { not: '' }, checkedInAt: null } }) : Promise.resolve(0),
    prisma.course.findMany({ where: { active: true, stripeAccountActive: false, archivedAt: null }, select: { id: true, name: true, slug: true }, take: 5 }),

    prisma.courseInquiry.findMany({
      where: { status: { in: ['pending', 'in_review', 'details_submitted', 'building'] }, updatedAt: { lt: threeDaysAgo } },
      select: { id: true, courseName: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 5,
    }),
    prisma.courseInquiry.count({ where: { status: { in: ['pending', 'in_review', 'details_submitted', 'building'] }, updatedAt: { lt: threeDaysAgo } } }),
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
  };

  // ---- action queue ----
  type Row = { id: string; who: string; why: string; ageDays: number; actionLabel: string; href: string; amount?: string };

  const red: Row[] = [
    ...failedCharges.map(b => ({
      id: `fc-${b.id}`,
      who: `${b.golferName} · ${b.course.name}`,
      why: `Charge failed — ${b.checkInFailReason || 'decline'}`,
      ageDays: Math.floor((now.getTime() - b.createdAt.getTime()) / 86400000),
      actionLabel: 'Review',
      href: '/admin/revenue',
      amount: `$${(b.totalAmount / 100).toFixed(2)}`,
    })),
    ...noStripe.map(c => ({
      id: `ns-${c.id}`,
      who: c.name,
      why: 'Live but can’t take payments — Stripe incomplete',
      ageDays: 0,
      actionLabel: 'Fix Stripe',
      href: `/admin/courses?courseId=${c.id}&tab=overview`,
    })),
  ];
  const redCount = failedChargesCount + noStripe.length;

  const previewSeen = new Set<string>();
  const previewSentAmber: Row[] = [];
  for (const ev of previewSentEventsRaw) {
    if (previewSeen.has(ev.inquiryId)) continue;
    previewSeen.add(ev.inquiryId);
    if (!ev.inquiry || ev.inquiry.status === 'live' || ev.inquiry.status === 'rejected') continue;
    previewSentAmber.push({
      id: `ps-${ev.inquiryId}`,
      who: ev.inquiry.courseName,
      why: 'Preview sent, no reply',
      ageDays: Math.floor((now.getTime() - ev.createdAt.getTime()) / 86400000),
      actionLabel: 'Open',
      href: `/admin/inquiries/${ev.inquiryId}`,
    });
  }

  const threadAmber: Row[] = threadsForUnanswered
    .filter(t => t.messages[0]?.senderType === 'operator' && t.messages[0].createdAt < twoDaysAgo)
    .map(t => ({
      id: `msg-${t.id}`,
      who: t.course.name,
      why: `Message from ${t.messages[0].senderName}, unanswered`,
      ageDays: Math.floor((now.getTime() - t.messages[0].createdAt.getTime()) / 86400000),
      actionLabel: 'Reply',
      href: '/admin/messages',
    }));

  const amber: Row[] = [
    ...waitingOnUs.map(i => ({
      id: `wu-${i.id}`,
      who: i.courseName,
      why: `Waiting on us — ${i.status.replace('_', ' ')}`,
      ageDays: Math.floor((now.getTime() - i.updatedAt.getTime()) / 86400000),
      actionLabel: 'Open',
      href: `/admin/inquiries/${i.id}`,
    })),
    ...draftsAmber.map(c => ({
      id: `dr-${c.id}`,
      who: c.name,
      why: 'Draft not yet live',
      ageDays: Math.floor((now.getTime() - c.createdAt.getTime()) / 86400000),
      actionLabel: 'Review',
      href: `/admin/courses?courseId=${c.id}&tab=overview`,
    })),
    ...previewSentAmber,
    ...sheetNoResponse.map(i => ({
      id: `sh-${i.id}`,
      who: i.courseName,
      why: 'Sheet sent, no response',
      ageDays: Math.floor((now.getTime() - i.updatedAt.getTime()) / 86400000),
      actionLabel: 'Nudge',
      href: `/admin/inquiries/${i.id}`,
    })),
    ...threadAmber,
  ].sort((a, b) => b.ageDays - a.ageDays).slice(0, 5);

  const amberCount = waitingOnUsCount + draftsAmberCount + previewSentAmber.length + sheetNoResponseCount + threadAmber.length;

  // ---- revenue chart (day/week/month, gross+fees, ghost prior period) ----
  const dayMap: Record<string, Bucket> = {};
  for (let i = 36; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap[dayKeyOf(d)] = { gross: 0, fees: 0, bookings: 0 };
  }
  const weekMap: Record<string, Bucket> = {};
  const curWeekMonday = new Date(weekStartKey(now) + 'T00:00:00.000Z');
  for (let i = 12; i >= 0; i--) {
    const d = new Date(curWeekMonday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekMap[dayKeyOf(d)] = { gross: 0, fees: 0, bookings: 0 };
  }
  const monthMap: Record<string, Bucket> = {};
  for (let i = 12; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthMap[monthKeyOf(d)] = { gross: 0, fees: 0, bookings: 0 };
  }
  for (const b of bookingsForChart) {
    const gross = b.totalAmount / 100;
    const fees = b.accessFeeTotal / 100;
    const dk = dayKeyOf(b.createdAt);
    if (dayMap[dk]) { dayMap[dk].gross += gross; dayMap[dk].fees += fees; dayMap[dk].bookings += 1; }
    const wk = weekStartKey(b.createdAt);
    if (weekMap[wk]) { weekMap[wk].gross += gross; weekMap[wk].fees += fees; weekMap[wk].bookings += 1; }
    const mk = monthKeyOf(b.createdAt);
    if (monthMap[mk]) { monthMap[mk].gross += gross; monthMap[mk].fees += fees; monthMap[mk].bookings += 1; }
  }

  const revenue = {
    day: seriesFromMap(dayMap, 30, key => {
      const d = new Date(key + 'T00:00:00.000Z');
      d.setUTCDate(d.getUTCDate() - 7);
      return dayKeyOf(d);
    }),
    week: seriesFromMap(weekMap, 12),
    month: seriesFromMap(monthMap, 12),
  };

  // ---- top courses (30d), with trend arrow ----
  const topCoursesRaw = await prisma.booking.groupBy({
    by: ['courseId'],
    where: { status: { in: COMPLETED }, createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
    _sum: { accessFeeTotal: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });
  const topCourseIds = topCoursesRaw.map(r => r.courseId);
  const [topCourseDetails, prevTopCoursesRaw] = await Promise.all([
    topCourseIds.length ? prisma.course.findMany({ where: { id: { in: topCourseIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
    topCourseIds.length
      ? prisma.booking.groupBy({ by: ['courseId'], where: { status: { in: COMPLETED }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }, courseId: { in: topCourseIds } }, _count: { id: true } })
      : Promise.resolve([]),
  ]);
  const courseMap = Object.fromEntries(topCourseDetails.map(c => [c.id, c]));
  const prevCountMap = Object.fromEntries(prevTopCoursesRaw.map(r => [r.courseId, r._count.id]));
  const topCourses = topCoursesRaw.map(r => ({
    id: r.courseId,
    name: courseMap[r.courseId]?.name ?? 'Unknown',
    bookings: r._count.id,
    revenue: Number(r._sum.accessFeeTotal ?? 0) / 100,
    prevBookings: prevCountMap[r.courseId] ?? 0,
  }));

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
    topCourses,
  });
}

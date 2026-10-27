import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn, clockIn, addDaysStr } from '@/lib/course-time';
import { computeAnalytics, previousRange, type Range } from '@/lib/analytics';
import { recentCloses } from '@/lib/register-close';

// DENSE-2 (Cam 2026-10-27, after Toast's Sales Summary and Stripe's Today): Money's
// Sales view. Every figure is computeAnalytics' (lib/analytics.ts) — the same
// definitions as Analytics, Home and the tee sheet strip, so no two pages disagree:
// collected course share by day, weekday and hour, what it was for, how it was paid,
// and the period before for the change. Today runs against the same weekday last
// week, hour by hour. The cash drawer is the course's latest register count
// (lib/register-close.ts), for logins that can close out. Read-only, the session's course only, money.payments.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range: Range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -27), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });

  const lastWeek = addDaysStr(today, -7);
  const [a, before, day, dayBefore, closes] = await Promise.all([
    computeAnalytics(session.courseId, range),
    computeAnalytics(session.courseId, previousRange(range)),
    computeAnalytics(session.courseId, { from: today, to: today }),
    computeAnalytics(session.courseId, { from: lastWeek, to: lastWeek }),
    // The drawer count is the close-out's (shop.close) — money.payments alone doesn't widen who sees it.
    can(session, 'shop.close') ? recentCloses(session.courseId, 1) : Promise.resolve([]),
  ]);
  const r = a.revenue;
  return NextResponse.json({
    range: a.range, today, lastWeek, clock: clockIn(course?.timezone),
    bucket: r.bucket,
    series: r.series.map(x => ({ key: x.key, collectedCents: x.collectedCents, gapCents: Math.max(0, x.gapCents) })),
    byDow: r.byDow, byHour: r.byHour,
    collectedCents: r.collectedCents, beforeCollectedCents: before.revenue.collectedCents,
    summary: {
      greenCents: r.greenCents, cartCents: r.cartCents,
      rangeCents: Math.max(0, r.collectedCents - r.greenCents - r.cartCents),
      lateFeesKeptCents: r.lateFeesKeptCents,
      shopOnRoundsCents: r.beyond.shopOnRoundsCents,
      walkUpCents: r.beyond.walkUpCents, walkUpSales: r.beyond.walkUpSales,
      greenReserveFeesCents: r.greenReserveFeesCents,
    },
    paid: { cardCents: r.cardCents, counterCents: r.counterCents, outstandingCents: r.outstandingCents, outstandingGroups: r.outstandingBookings },
    todayByHour: day.revenue.byHour, lastWeekByHour: dayBefore.revenue.byHour,
    todayCollectedCents: day.revenue.collectedCents, lastWeekCollectedCents: dayBefore.revenue.collectedCents,
    drawer: closes[0] ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

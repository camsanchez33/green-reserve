import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { shopReport } from '@/lib/shop-report';

// SHOP-4 (Cam 2026-10-30): Analytics → Pro shop. What sold, by item and category,
// gated like the rest of Analytics; cost and margin for the owner only. This course only.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'analytics.view'); if (denied) return denied; }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -29), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });
  const r = await shopReport(session.courseId, range, { cost: !session.isStaff });
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}

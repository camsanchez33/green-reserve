import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { shopReport } from '@/lib/shop-report';
import { previousRange } from '@/lib/analytics';
import { stockValue, shopLedgerCents } from '@/lib/analytics-page';

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
  // Analytics page (Cam 2026-11-17): what's on the shelf (cost for the owner only, as margin) and the shop's
  // revenue from the ledger — shop and food & beverage, the Revenue page's own split. Categories stay line-based.
  const [r, before, stock, ledgerSalesCents] = await Promise.all([
    shopReport(session.courseId, range, { cost: !session.isStaff }),
    shopReport(session.courseId, previousRange(range), { cost: false }),
    stockValue(session.courseId, { cost: !session.isStaff }),
    shopLedgerCents(session.courseId, range),
  ]);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // "On the month before": each category's sales over the same length of time just before.
  const was = new Map((before?.categories ?? []).map(c => [c.category, c.salesCents]));
  const categories = r.categories.map(c => ({ ...c, beforeSalesCents: was.get(c.category) ?? 0 }));
  // The ledger's shop money only with money.payments (the Revenue page's gate); the line-based report stays as it was.
  return NextResponse.json({ ...r, categories, stock, ...(can(session, 'money.payments') ? { ledgerSalesCents } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
}

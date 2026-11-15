import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn, addDaysStr, DEFAULT_TZ, isValidTimezone } from '@/lib/course-time';
import { eventInvoices } from '@/lib/event-invoices';

// Revenue page (Cam 2026-11-15): event invoices for Payments (paid ?from..to, default the last
// 30 days) and Pending (every one still open). Read-only, the session's course, money.payments.
// canResend only for a login with "Run events" — the resend itself is the event route's.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const tz = course?.timezone && isValidTimezone(course.timezone) ? course.timezone : DEFAULT_TZ;
  const today = todayIn(tz);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -29), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });
  const r = await eventInvoices(session.courseId, tz, range, { mayResend: can(session, 'events.manage') });
  return NextResponse.json({ range, ...r }, { headers: { 'Cache-Control': 'no-store' } });
}

// DASH-D Home (Cam 2026-11-01, "month vs goal"): the course's revenue goal for a month.
// Reading it is money (money.payments, via /api/operator/home); setting it is a course
// setting (settings.edit). One goal per month — golf is seasonal. PUT { month, cents }.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';

const MAX_CENTS = 100_000_000_00; // $100M — a typo guard, not a business rule

export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'settings.edit'); if (denied) return denied; }
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }
  const body = await req.json().catch(() => null) as { month?: unknown; cents?: unknown } | null;
  const month = typeof body?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) ? body.month : null;
  if (!month) return NextResponse.json({ error: 'Pick a month.' }, { status: 400 });
  // null clears the month's goal (the row stays, with no amount — nothing is deleted).
  const cents = body?.cents === null ? null : typeof body?.cents === 'number' && Number.isInteger(body.cents) ? body.cents : NaN;
  if (cents !== null && !(cents > 0 && cents <= MAX_CENTS)) return NextResponse.json({ error: 'Enter the goal in dollars, more than $0.' }, { status: 400 });
  const setBy = session.staffId ?? `operator:${session.operatorId}`;
  await prisma.courseMonthGoal.upsert({
    where: { courseId_month: { courseId: session.courseId, month } },
    create: { courseId: session.courseId, month, cents, setBy },
    update: { cents, setBy },
  });
  return NextResponse.json({ month, cents });
}

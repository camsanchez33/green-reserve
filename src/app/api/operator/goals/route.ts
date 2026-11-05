// HOME-2 (Cam 2026-11-05, "set goals for certain metrics"): set or remove a month's goal on one
// metric (lib/course-goals). Setting a goal is a course setting (settings.edit); a money goal also
// needs money.payments, the same as seeing it. PUT { month, metric, target } — target null removes
// it (the row stays with no target; nothing is deleted).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { isGoalMetric, goalMetric, GOAL_MAX } from '@/lib/course-goals';

export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'settings.edit'); if (denied) return denied; }
  const body = await req.json().catch(() => null) as { month?: unknown; metric?: unknown; target?: unknown } | null;
  const month = typeof body?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) ? body.month : null;
  if (!month) return NextResponse.json({ error: 'Pick a month.' }, { status: 400 });
  if (!isGoalMetric(body?.metric)) return NextResponse.json({ error: 'Pick what the goal is for.' }, { status: 400 });
  const metric = body.metric;
  const m = goalMetric(metric);
  if (m.money) { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }
  const target = body?.target === null ? null : typeof body?.target === 'number' && Number.isInteger(body.target) ? body.target : NaN;
  if (target !== null && !(target > 0 && target <= GOAL_MAX[m.unit]))
    return NextResponse.json({ error: m.unit === 'pct' ? 'Enter a percent from 1 to 100.' : m.unit === 'cents' ? 'Enter the goal in dollars, more than $0.' : 'Enter a number more than 0.' }, { status: 400 });
  const setBy = session.staffId ?? `operator:${session.operatorId}`;
  await prisma.courseGoal.upsert({
    where: { courseId_month_metric: { courseId: session.courseId, month, metric } },
    create: { courseId: session.courseId, month, metric, target, setBy },
    update: { target, setBy },
  });
  return NextResponse.json({ month, metric, target });
}

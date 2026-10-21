import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, OWNER_ONLY, ownerGateError } from '@/lib/admin-session';
import { startOfPlatformDay } from '@/lib/admin-day';
import { GOAL_METRICS, isGoalMetric, listGoals } from '@/lib/admin-goals';

// AW-4b (Cam 2026-10-21): Admin → Goals. Support+ can see them; only the owner
// adds or removes one. A fees target arrives in dollars and is kept in cents.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Goals are for support and above.' }, { status: 403 });
  return NextResponse.json({ goals: await listGoals(new Date()), canEdit: requireRole(session, OWNER_ONLY) });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const body = await req.json().catch(() => null) as { metric?: unknown; target?: unknown; dueDate?: unknown } | null;
  if (!body || !isGoalMetric(body.metric)) return NextResponse.json({ error: 'Pick what the goal measures.' }, { status: 400 });
  const raw = Number(body.target);
  if (!Number.isFinite(raw) || raw <= 0) return NextResponse.json({ error: 'The target must be a number above zero.' }, { status: 400 });
  const target = GOAL_METRICS[body.metric].unit === 'cents' ? Math.round(raw * 100) : Math.round(raw);
  if (target < 1 || target > 1_000_000_000) return NextResponse.json({ error: 'That target is out of range.' }, { status: 400 });
  if (typeof body.dueDate !== 'string' || !DATE.test(body.dueDate)) return NextResponse.json({ error: 'Pick the date the goal is due.' }, { status: 400 });
  // Due at the END of that day, platform time (US Eastern, like every admin day).
  const dayStart = startOfPlatformDay(new Date(`${body.dueDate}T12:00:00Z`));
  const dueAt = startOfPlatformDay(new Date(dayStart.getTime() + 36 * 3_600_000));
  const now = new Date();
  if (dueAt <= now) return NextResponse.json({ error: 'The due date has to be in the future.' }, { status: 400 });
  const goal = await prisma.adminGoal.create({ data: { metric: body.metric, target, dueAt, startsAt: now, createdBy: session.name } });
  await prisma.adminAuditLog.create({ data: { adminId: session.adminId, action: 'goal_created', targetType: 'admin_goal', targetId: goal.id } })
    .catch(err => console.error('goal audit failed:', err));
  return NextResponse.json({ ok: true, id: goal.id });
}

export async function DELETE(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which goal?' }, { status: 400 });
  const { count } = await prisma.adminGoal.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'That goal is already gone — refresh the page.' }, { status: 404 });
  await prisma.adminAuditLog.create({ data: { adminId: session.adminId, action: 'goal_deleted', targetType: 'admin_goal', targetId: id } })
    .catch(err => console.error('goal audit failed:', err));
  return NextResponse.json({ ok: true });
}

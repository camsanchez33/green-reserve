import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { previewScheduleChange, type ScheduleChange } from '@/lib/schedule-preview';
import { SchedulePlanError, type SchedulePlan } from '@/lib/schedule-service';
import type { CoursePlan } from '@/lib/course-plan';

// Schedule rework (Cam 2026-10-19): what a save would do to the tee sheet,
// shown before it is saved. Read-only — writes nothing. Same permission as saving.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const op = body?.op;
  let change: ScheduleChange;
  if (op === 'create' && body?.body && typeof body.body === 'object') change = { op, body: body.body as Record<string, unknown> };
  else if (op === 'update' && typeof body?.id === 'string' && body.data && typeof body.data === 'object') change = { op, id: body.id, data: body.data as Record<string, unknown> };
  else if (op === 'delete' && typeof body?.id === 'string') change = { op, id: body.id };
  // W2-6 Schedule simplification: the whole course plan.
  else if (op === 'course' && body?.plan && typeof body.plan === 'object') change = { op, plan: body.plan as CoursePlan };
  else if (op === 'plan' && body?.plan && typeof body.plan === 'object' && Array.isArray((body.plan as SchedulePlan).replaces)
    && Array.isArray((body.plan as SchedulePlan).periods) && (body.plan as SchedulePlan).periods.every(p => p && typeof p === 'object')) change = { op, plan: body.plan as SchedulePlan };
  else return NextResponse.json({ error: 'Tell us what you are changing.' }, { status: 400 });

  let preview;
  try { preview = await previewScheduleChange(session.courseId, change); }
  catch (err) { if (err instanceof SchedulePlanError) return NextResponse.json({ error: err.message }, { status: 400 }); throw err; }
  if (!preview) return NextResponse.json({ error: 'That schedule isn’t on this course.' }, { status: 404 });
  return NextResponse.json(preview);
}

import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS, SUPPORT_PLUS } from '@/lib/admin-session';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, ScheduleConflictError, ScheduleProductError } from '@/lib/schedule-service';

// L2: the service refuses a save that would double-book a nine (409) or names a
// product this course does not own (400); everything else is unchanged.
function scheduleError(err: unknown) {
  if (err instanceof ScheduleConflictError) return NextResponse.json({ error: err.message, conflict: true }, { status: 409 });
  if (err instanceof ScheduleProductError) return NextResponse.json({ error: err.message }, { status: 400 });
  return null;
}

// MP-5d: this route and /api/operator/schedule are thin callers of ONE
// schedule service. The rebuild-the-window rule, the cents conversion and the
// timeline log all live there, so neither surface can drift from the other.

// GET /api/admin/schedule?courseId=X
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2d: GET was session-only while POST/PATCH/DELETE here are MANAGER_PLUS — it exposes every rate a course charges.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  return NextResponse.json(await listSchedules(courseId));
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { courseId } = body;
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  if (!body.startTime || !body.endTime) return NextResponse.json({ error: 'First and last tee are required' }, { status: 400 });

  try { return NextResponse.json(await createSchedule(courseId, body, { actor: session.name })); }
  catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, courseId: _ignored, ...data } = await req.json();
  void _ignored;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const updated = await updateSchedule(id, data, { actor: session.name });
    if (!updated) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
}

export async function DELETE(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const removed = await deleteSchedule(id, { actor: session.name });
  if (!removed) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

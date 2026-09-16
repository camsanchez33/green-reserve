import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, ScheduleConflictError, ScheduleProductError } from '@/lib/schedule-service';

// L2: the service refuses a save that would double-book a nine (409) or names a
// product this course does not own (400); everything else is unchanged.
function scheduleError(err: unknown) {
  if (err instanceof ScheduleConflictError) return NextResponse.json({ error: err.message, conflict: true }, { status: 409 });
  if (err instanceof ScheduleProductError) return NextResponse.json({ error: err.message }, { status: 400 });
  return null;
}

// MP-5d: thin caller of the shared schedule service (see lib/schedule-service).
// Before this, PATCH and DELETE here did NOT rebuild the tee-sheet window, so
// an operator who deleted, paused or re-priced a schedule kept selling the old
// times at the old price for up to eight days — the same bug MP-5a had already
// fixed on the admin side only. GET and PATCH also returned raw rows (cents
// columns) to a page that reads dollar fields; every response is wire-shaped
// now. The session's course is the scope: nothing here can touch another
// course's rows.

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await listSchedules(session.courseId));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  if (!body.startTime || !body.endTime) return NextResponse.json({ error: 'First and last tee are required' }, { status: 400 });
  try { return NextResponse.json(await createSchedule(session.courseId, body)); }
  catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const { id, courseId: _ignored, ...data } = await req.json();
  void _ignored;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const updated = await updateSchedule(id, data, { scopeCourseId: session.courseId });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const removed = await deleteSchedule(id, { scopeCourseId: session.courseId });
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

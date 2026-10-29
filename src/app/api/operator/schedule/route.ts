import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, saveSchedulePlan, saveCoursePlan, ScheduleConflictError, ScheduleProductError, SchedulePlanError, type SchedulePlan } from '@/lib/schedule-service';
import type { CoursePlan } from '@/lib/course-plan';

// A schedule change rebuilds every bookable day (lib/tee-sheet-engine regenerateUpcoming), up to a year ahead.
export const maxDuration = 120;

// L2: the service refuses a save that would double-book a nine (409) or names a
// product this course does not own (400); everything else is unchanged.
function scheduleError(err: unknown) {
  if (err instanceof ScheduleConflictError) return NextResponse.json({ error: err.message, conflict: true }, { status: 409 });
  if (err instanceof ScheduleProductError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof SchedulePlanError) return NextResponse.json({ error: err.message }, { status: 400 });
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
  { const denied = requirePermission(session, 'schedule.view'); if (denied) return denied; } // SP-A
  return NextResponse.json(await listSchedules(session.courseId));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  if (!body.startTime || !body.endTime) return NextResponse.json({ error: 'First and last tee are required' }, { status: 400 });
  try { return NextResponse.json(await createSchedule(session.courseId, body)); }
  catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
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
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const removed = await deleteSchedule(id, { scopeCourseId: session.courseId });
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

// W2-4: save a whole schedule — its shared hours and every price period — at
// once (lib/schedule-service saveSchedulePlan). Returns the course's schedules.
export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const raw = await req.json().catch(() => null) as (SchedulePlan & { coursePlan?: CoursePlan }) | null;
  // W2-6 Schedule simplification: the Schedule page saves the whole course plan at once.
  if (raw?.coursePlan) {
    try { return NextResponse.json(await saveCoursePlan(session.courseId, raw.coursePlan)); }
    catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
  }
  const body = raw;
  if (!body || !Array.isArray(body.periods) || !Array.isArray(body.replaces)) return NextResponse.json({ error: 'Tell us what you are changing.' }, { status: 400 });
  try {
    const rows = await saveSchedulePlan(session.courseId, body);
    if (!rows) return NextResponse.json({ error: 'That schedule isn’t on this course. Refresh and try again.' }, { status: 404 });
    return NextResponse.json(rows);
  } catch (err) { const r = scheduleError(err); if (r) return r; throw err; }
}

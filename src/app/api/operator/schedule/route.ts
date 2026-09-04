import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession } from '@/lib/session';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule } from '@/lib/schedule-service';

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

  const body = await req.json();
  if (!body.startTime || !body.endTime) return NextResponse.json({ error: 'First and last tee are required' }, { status: 400 });
  return NextResponse.json(await createSchedule(session.courseId, body));
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, courseId: _ignored, ...data } = await req.json();
  void _ignored;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updated = await updateSchedule(id, data, { scopeCourseId: session.courseId });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const removed = await deleteSchedule(id, { scopeCourseId: session.courseId });
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

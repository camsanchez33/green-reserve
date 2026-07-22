import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { logRemindersPaused } from '@/lib/course-timeline';

// A-05 item 4b — per-course kill switch for the auto-chase onboarding
// reminders (see /api/cron/chase-onboarding). Logged to the course timeline
// the same way every other admin-side event is (course-timeline.ts).
export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { courseId, paused } = await req.json();
  if (!courseId || typeof paused !== 'boolean') return NextResponse.json({ error: 'Missing courseId or paused' }, { status: 400 });
  const ok = await logRemindersPaused(courseId, session.name, paused);
  if (!ok) return NextResponse.json({ error: 'No linked inquiry to log against for this course' }, { status: 400 });
  return NextResponse.json({ success: true });
}

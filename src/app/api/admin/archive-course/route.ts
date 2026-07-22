import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { archivePair, restorePair } from '@/lib/lifecycle';

// Thin wrapper — all lifecycle mutation logic lives in src/lib/lifecycle.ts
// (LIFECYCLE PARITY LAW) so /admin/courses* and /admin/inquiries* can never
// drift into one-sided archive/restore/delete.
//
// DELETION DOCTRINE (RUN_QUEUE): anything that ever became a course is
// never permanently deleted — archive only. hard_delete is intentionally
// NOT an action this route accepts anymore (it used to be, owner-only);
// deletePair() still exists in lifecycle.ts for a deliberate owner-run
// pre-launch test-data cleanup script, but there is no UI or API path to
// it from the admin app itself.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId, action } = await req.json();
  if (!courseId || !action) return NextResponse.json({ error: 'Missing courseId or action' }, { status: 400 });

  if (action === 'archive') {
    const result = await archivePair(courseId, session.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Course not found' ? 404 : 400 });
    return NextResponse.json({ success: true, changed: result.changed });
  }

  if (action === 'restore') {
    const result = await restorePair(courseId, session.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Course not found' ? 404 : 400 });
    return NextResponse.json({ success: true, changed: result.changed });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

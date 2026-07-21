import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS, OWNER_ONLY } from '@/lib/admin-session';
import { archivePair, restorePair, deletePair } from '@/lib/lifecycle';

// Thin wrapper — all lifecycle mutation logic lives in src/lib/lifecycle.ts
// (LIFECYCLE PARITY LAW) so /admin/courses* and /admin/inquiries* can never
// drift into one-sided archive/restore/delete.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId, action, confirmName } = await req.json();
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

  if (action === 'hard_delete') {
    if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
    const result = await deletePair(courseId, confirmName, session.name);
    if (!result.ok) return NextResponse.json({ error: result.error, hasHistory: result.hasHistory }, { status: result.error === 'Course not found' ? 404 : 400 });
    return NextResponse.json({ success: true, changed: result.changed });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

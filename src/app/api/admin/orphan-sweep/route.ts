import { NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, OWNER_ONLY } from '@/lib/admin-session';
import { sweepOrphanCourses } from '@/lib/lifecycle';

// ORPHAN SWEEP (RUN_QUEUE) — GET always dry-runs (prints the list, no
// mutations); POST actually executes, owner-only since it can delete rows
// (only orphan courses with zero real history — anything with history is
// archived, never deleted, no exceptions).
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await sweepOrphanCourses(session.name, true);
  return NextResponse.json({ dryRun: true, items });
}

export async function POST() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
  const items = await sweepOrphanCourses(session.name, false);
  return NextResponse.json({ dryRun: false, items });
}

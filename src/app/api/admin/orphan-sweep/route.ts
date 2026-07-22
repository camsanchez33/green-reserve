import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, OWNER_ONLY } from '@/lib/admin-session';
import { sweepOrphanCourses, listAcknowledgedOrphans, forceDeleteOrphan } from '@/lib/lifecycle';

// ORPHAN SWEEP (RUN_QUEUE) — GET always dry-runs (prints the list, no
// mutations); POST actually executes, owner-only since it can delete rows
// (only orphan courses with zero real history — anything with history is
// archived, never deleted, no exceptions). `acknowledged` are already-
// handled orphans (archived + flagged by a prior run) — informational only,
// excluded from `items` so the banner doesn't nag forever about them (RUN_QUEUE
// "orphan banner loops forever"), but still individually force-deletable
// below via an explicit owner override.
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [items, acknowledged] = await Promise.all([
    sweepOrphanCourses(session.name, true),
    listAcknowledgedOrphans(),
  ]);
  return NextResponse.json({ dryRun: true, items, acknowledged });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // Owner-authorized override — hard-deletes ONE SPECIFIC already-orphaned
  // course regardless of history (Cam's DaisyLinks exception). Refuses
  // outright if the course turns out to have a real inquiry link.
  if (body.forceDeleteId) {
    const result = await forceDeleteOrphan(body.forceDeleteId, body.confirmName ?? '', session.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, deleted: result.deleted });
  }

  const items = await sweepOrphanCourses(session.name, false);
  return NextResponse.json({ dryRun: false, items });
}

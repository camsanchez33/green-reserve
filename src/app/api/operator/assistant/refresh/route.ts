import { NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { getCourseBrief } from '@/lib/assistant/brief';

// ASSIST-1: "Refresh now" on What it knows. The brief already rebuilds on every question; this rebuilds both
// audiences now and stamps the time, so staff can see it took their change.

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  const [staff, golfer] = await Promise.all([
    getCourseBrief(session.courseId, 'staff', { force: true }),
    getCourseBrief(session.courseId, 'golfer', { force: true }),
  ]);
  if (!staff || !golfer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    knows: {
      staff: { sections: staff.sections, builtAt: staff.builtAt.toISOString() },
      golfer: { sections: golfer.sections, builtAt: golfer.builtAt.toISOString() },
    },
  });
}

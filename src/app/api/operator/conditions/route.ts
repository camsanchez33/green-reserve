import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';

/** R-AUTH-005 (Cam 2026-10-26): the alert is a short public notice on the booking page. */
const COURSE_ALERT_MAX = 280;

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'sheet.course_alert');
  if (denied) return denied;
  const body = await req.json().catch(() => null) as { conditions?: unknown } | null;
  const raw = body?.conditions ?? '';
  if (typeof raw !== 'string') return NextResponse.json({ error: 'The alert must be text.' }, { status: 400 });
  const conditions = raw.trim();
  if (conditions.length > COURSE_ALERT_MAX) return NextResponse.json({ error: `Keep the alert to ${COURSE_ALERT_MAX} characters — it is ${conditions.length}.` }, { status: 400 });
  const updated = await prisma.course.update({
    where: { id: session.courseId },
    data: { conditions, conditionsUpdatedAt: conditions ? new Date() : null },
  });
  return NextResponse.json({ conditions: updated.conditions });
}

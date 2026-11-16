import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';

// PRICE-2 (Cam 2026-10-30): the course's last-minute deal, on the Schedule page beside its
// prices and promo codes. Reading needs schedule.view, changing it schedule.edit, like the
// prices themselves. This course only.
// Retired (Cam 2026-11-16, lib/last-minute): no deal applies to a new price, so the setting
// can no longer be changed; reading it stays so an old page still loads.
const FIELDS = { lastMinuteOn: true, lastMinuteHours: true, lastMinutePct: true, lastMinuteCounter: true, lastMinuteStack: true } as const;

async function gate(key: 'schedule.view' | 'schedule.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, key);
  return denied ? { res: denied } : { session };
}

export async function GET() {
  const g = await gate('schedule.view');
  if ('res' in g) return g.res;
  const deal = await prisma.course.findUnique({ where: { id: g.session.courseId }, select: FIELDS });
  if (!deal) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  // Retired: shown as off whatever the stored column says, so no page shows a deal that no longer applies.
  return NextResponse.json({ deal: { ...deal, lastMinuteOn: false }, retired: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH() {
  const g = await gate('schedule.edit');
  if ('res' in g) return g.res;
  return NextResponse.json({ error: 'Last-minute deals were removed. Use a promo code instead.' }, { status: 410 });
}

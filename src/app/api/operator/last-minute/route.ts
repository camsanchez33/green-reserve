import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { dealSettingsError } from '@/lib/last-minute';

// PRICE-2 (Cam 2026-10-30): the course's last-minute deal, on the Schedule page beside its
// prices and promo codes. Reading needs schedule.view, changing it schedule.edit, like the
// prices themselves. This course only.
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
  return NextResponse.json({ deal }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const g = await gate('schedule.edit');
  if ('res' in g) return g.res;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const why = dealSettingsError(b);
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const data: Record<string, boolean | number> = {};
  for (const k of ['lastMinuteOn', 'lastMinuteCounter', 'lastMinuteStack'] as const) if (typeof b[k] === 'boolean') data[k] = b[k] as boolean;
  for (const k of ['lastMinuteHours', 'lastMinutePct'] as const) if (b[k] !== undefined) data[k] = Number(b[k]);
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const deal = await prisma.course.update({ where: { id: g.session.courseId }, data, select: FIELDS });
  return NextResponse.json({ deal });
}

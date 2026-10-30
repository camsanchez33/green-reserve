import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { readDemandMode, demandSettingsError, refreshDemand } from '@/lib/demand-pricing';

// PRICE-5 (Cam 2026-10-30): demand pricing on the Schedule page, beside the last-minute deal.
// Reading needs schedule.view; changing the settings or applying suggestions schedule.edit,
// like the prices themselves. This course only.
const FIELDS = { demandMode: true, demandFloorPct: true, demandCeilingPct: true, demandSuggestedAt: true } as const;

async function gate(key: 'schedule.view' | 'schedule.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, key);
  return denied ? { res: denied } : { session };
}

async function state(courseId: string) {
  const [settings, hours] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: FIELDS }),
    prisma.demandPrice.findMany({ where: { courseId }, orderBy: [{ dow: 'asc' }, { hour: 'asc' }], select: { dow: true, hour: true, pct: true, suggestedPct: true, fillPct: true, courseFillPct: true } }),
  ]);
  // What golfers are charged: each percent inside the course's current floor and ceiling.
  const clamp = (n: number) => settings ? Math.max(settings.demandFloorPct - 100, Math.min(settings.demandCeilingPct - 100, n)) : n;
  return { settings, hours: hours.map(h => ({ ...h, pct: clamp(h.pct), suggestedPct: clamp(h.suggestedPct) })) };
}

export async function GET() {
  const g = await gate('schedule.view');
  if ('res' in g) return g.res;
  const s = await state(g.session.courseId);
  if (!s.settings) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  return NextResponse.json(s, { headers: { 'Cache-Control': 'no-store' } });
}

/** Settings: mode, floor, ceiling. Turning it on works out the first suggestions straight away. */
export async function PATCH(req: NextRequest) {
  const g = await gate('schedule.edit');
  if ('res' in g) return g.res;
  const courseId = g.session.courseId;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const now = await prisma.course.findUnique({ where: { id: courseId }, select: FIELDS });
  if (!now) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const why = demandSettingsError(b, now);
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const data: { demandMode?: string; demandFloorPct?: number; demandCeilingPct?: number } = {};
  if (b.demandMode !== undefined) {
    const m = readDemandMode(b.demandMode);
    if (!m) return NextResponse.json({ error: 'Pick off, suggest or automatic.' }, { status: 400 });
    data.demandMode = m;
  }
  if (b.demandFloorPct !== undefined) data.demandFloorPct = Number(b.demandFloorPct);
  if (b.demandCeilingPct !== undefined) data.demandCeilingPct = Number(b.demandCeilingPct);
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  await prisma.course.update({ where: { id: courseId }, data });
  let result: string | null = null;
  if (data.demandMode && data.demandMode !== 'off' && now.demandMode === 'off') result = await refreshDemand(courseId);
  // Switching to automatic applies what is already suggested now, not at the next weekly run.
  if (data.demandMode === 'auto' && now.demandMode === 'suggest') {
    const rows = await prisma.demandPrice.findMany({ where: { courseId }, select: { id: true, suggestedPct: true } });
    await prisma.$transaction(rows.map(r => prisma.demandPrice.update({ where: { id: r.id }, data: { pct: r.suggestedPct } })));
  }
  return NextResponse.json({ ...(await state(courseId)), result });
}

/** apply: every hour takes its suggestion. reset: every hour back to the course's own rate. */
export async function POST(req: NextRequest) {
  const g = await gate('schedule.edit');
  if ('res' in g) return g.res;
  const courseId = g.session.courseId;
  const b = await req.json().catch(() => ({})) as { action?: unknown };
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { demandMode: true } });
  if (!c) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  if (b.action === 'apply') {
    if (c.demandMode === 'off') return NextResponse.json({ error: 'Turn demand pricing on first.' }, { status: 409 });
    const rows = await prisma.demandPrice.findMany({ where: { courseId }, select: { id: true, suggestedPct: true } });
    await prisma.$transaction(rows.map(r => prisma.demandPrice.update({ where: { id: r.id }, data: { pct: r.suggestedPct } })));
  } else if (b.action === 'reset') {
    await prisma.demandPrice.updateMany({ where: { courseId }, data: { pct: 0 } });
  } else {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  return NextResponse.json(await state(courseId));
}

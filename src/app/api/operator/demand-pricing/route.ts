import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { readDemandMode, demandSettingsError, refreshDemand, demandHistory } from '@/lib/demand-pricing';

// PRICE-5 (Cam 2026-10-30): demand pricing on the Schedule page, beside the last-minute deal.
// Reading needs schedule.view; changing the settings or applying suggestions schedule.edit,
// like the prices themselves. This course only.
// SCHED-1 (Cam 2026-11-16): `history` says how many days of the course's own tee times there are
// and when it unlocks (3 months). Locked, it can't be turned on, moved to automatic or applied;
// turning it off, resetting and the floor and ceiling always work.
const FIELDS = { demandMode: true, demandFloorPct: true, demandCeilingPct: true, demandSuggestedAt: true } as const;

async function gate(key: 'schedule.view' | 'schedule.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, key);
  return denied ? { res: denied } : { session };
}

async function state(courseId: string) {
  const [course, hours] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { ...FIELDS, timezone: true } }),
    prisma.demandPrice.findMany({ where: { courseId }, orderBy: [{ dow: 'asc' }, { hour: 'asc' }], select: { dow: true, hour: true, pct: true, suggestedPct: true, fillPct: true, courseFillPct: true } }),
  ]);
  if (!course) return { settings: null, history: null, hours: [] };
  const { timezone, ...settings } = course;
  const history = await demandHistory(courseId, timezone);
  // What golfers are charged: each percent inside the course's current floor and ceiling.
  const clamp = (n: number) => Math.max(settings.demandFloorPct - 100, Math.min(settings.demandCeilingPct - 100, n));
  return { settings, history, hours: hours.map(h => ({ ...h, pct: clamp(h.pct), suggestedPct: clamp(h.suggestedPct) })) };
}

/** 409 while the course has less than 3 months of its own tee times; null once unlocked. */
async function lockedError(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  const h = await demandHistory(courseId, c?.timezone ?? 'America/New_York');
  return h.unlocked ? null : NextResponse.json({ error: `Demand pricing unlocks after ${h.daysNeeded} days of your own tee times. You have ${h.daysOfData}.`, history: h }, { status: 409 });
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
  // Locked: never turned on or moved to automatic (staying where it is, or off, is fine).
  if (data.demandMode && data.demandMode !== 'off' && data.demandMode !== now.demandMode) {
    const locked = await lockedError(courseId);
    if (locked) return locked;
  }
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
    const locked = await lockedError(courseId);
    if (locked) return locked;
    const rows = await prisma.demandPrice.findMany({ where: { courseId }, select: { id: true, suggestedPct: true } });
    await prisma.$transaction(rows.map(r => prisma.demandPrice.update({ where: { id: r.id }, data: { pct: r.suggestedPct } })));
  } else if (b.action === 'reset') {
    await prisma.demandPrice.updateMany({ where: { courseId }, data: { pct: 0 } });
  } else {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  return NextResponse.json(await state(courseId));
}

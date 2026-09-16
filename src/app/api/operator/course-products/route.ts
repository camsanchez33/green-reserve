import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { regenerateUpcoming } from '@/lib/tee-sheet-engine';
import { findScheduleConflict } from '@/lib/schedule-conflict';

/** L2 review: after a product's nines change, every pair of running schedules must still be legal. */
async function conflictAfterNineChange(courseId: string, productId: string, nineIds: string[]): Promise<string | null> {
  const [schedules, products, nines] = await Promise.all([
    prisma.teeTimeSchedule.findMany({ where: { courseId, active: true }, select: { id: true, productId: true, daysOfWeek: true, startTime: true, endTime: true, active: true } }),
    prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, label: true, nineIds: true } }),
    prisma.nine.findMany({ where: { courseId }, select: { id: true, name: true } }),
  ]);
  const next = products.map(p => (p.id === productId ? { ...p, nineIds } : p));
  for (const s of schedules) {
    const why = findScheduleConflict(s, schedules.filter(o => o.id !== s.id), next, nines);
    if (why) return why;
  }
  return null;
}

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // L2: `scheduleCount` lets the Course & Layout tab say which products still
  // have no schedule (and so generate no tee times).
  const rows = await prisma.courseProduct.findMany({
    where: { courseId: session.courseId }, orderBy: { sortOrder: 'asc' },
    // Running schedules only — a paused one generates no tee times.
    include: { _count: { select: { schedules: { where: { active: true } } } } },
  });
  return NextResponse.json(rows.map(({ _count, ...p }) => ({ ...p, scheduleCount: _count.schedules })));
}

// Every nineId a product claims must actually belong to this operator's course —
// otherwise a crafted request could reference another course's Nine rows.
async function validNineIds(courseId: string, nineIds: unknown): Promise<string[]> {
  if (!Array.isArray(nineIds)) return [];
  const ids = nineIds.filter((x): x is string => typeof x === 'string');
  if (ids.length === 0) return [];
  const owned = await prisma.nine.findMany({ where: { id: { in: ids }, courseId }, select: { id: true } });
  return owned.map(n => n.id);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  if (!body.label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 });

  const nineIds = await validNineIds(session.courseId, body.nineIds);
  const count = await prisma.courseProduct.count({ where: { courseId: session.courseId } });
  const product = await prisma.courseProduct.create({
    data: {
      courseId: session.courseId,
      label: String(body.label).trim(),
      holes: Number(body.holes) || 18,
      nineIds,
      active: body.active !== false,
      sortOrder: count,
    },
  });
  return NextResponse.json({ ...product, scheduleCount: 0 });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.courseProduct.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nineIds = data.nineIds !== undefined ? await validNineIds(session.courseId, data.nineIds) : existing.nineIds;
  if (data.nineIds !== undefined && nineIds.join() !== existing.nineIds.join()) {
    const why = await conflictAfterNineChange(session.courseId, id, nineIds);
    if (why) return NextResponse.json({ error: `That change would double-book a nine: ${why}` }, { status: 409 });
  }

  const updated = await prisma.courseProduct.update({
    where: { id },
    data: {
      label: data.label !== undefined ? String(data.label).trim() : existing.label,
      holes: data.holes !== undefined ? Number(data.holes) : existing.holes,
      nineIds,
      active: data.active !== undefined ? data.active : existing.active,
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder,
    },
  });
  // L2 review: a round switched off (or its hole count changed) must leave the
  // sheet now, not after tonight's cron — the MP-5a rule, applied to products.
  if (updated.active !== existing.active || updated.holes !== existing.holes) await regenerateUpcoming(session.courseId);
  const scheduleCount = await prisma.teeTimeSchedule.count({ where: { productId: id, active: true } });
  return NextResponse.json({ ...updated, scheduleCount });
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // L2 review: deleting a round that still has schedules would turn them into
  // whole-course schedules (SET NULL) that keep generating slots. Refuse.
  const attached = await prisma.teeTimeSchedule.count({ where: { productId: id, courseId: session.courseId } });
  if (attached > 0) return NextResponse.json({ error: `This round still has ${attached} schedule${attached === 1 ? '' : 's'} — delete or move them on Schedules first.` }, { status: 409 });
  const removed = await prisma.courseProduct.deleteMany({ where: { id, courseId: session.courseId } });
  if (removed.count > 0) await regenerateUpcoming(session.courseId);
  return NextResponse.json({ success: true });
}

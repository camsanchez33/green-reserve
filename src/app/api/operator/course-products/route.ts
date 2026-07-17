import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(
    await prisma.courseProduct.findMany({ where: { courseId: session.courseId }, orderBy: { sortOrder: 'asc' } })
  );
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
  return NextResponse.json(product);
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.courseProduct.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nineIds = data.nineIds !== undefined ? await validNineIds(session.courseId, data.nineIds) : existing.nineIds;

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
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.courseProduct.deleteMany({ where: { id, courseId: session.courseId } });
  return NextResponse.json({ success: true });
}

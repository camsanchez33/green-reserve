import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(
    await prisma.nine.findMany({ where: { courseId: session.courseId }, orderBy: { sortOrder: 'asc' } })
  );
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const count = await prisma.nine.count({ where: { courseId: session.courseId } });
  const nine = await prisma.nine.create({
    data: {
      courseId: session.courseId,
      name: String(body.name).trim(),
      par: Number(body.par) || 36,
      sortOrder: count,
    },
  });
  return NextResponse.json(nine);
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.nine.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.nine.update({
    where: { id },
    data: {
      name: data.name !== undefined ? String(data.name).trim() : existing.name,
      par: data.par !== undefined ? Number(data.par) : existing.par,
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

  const existing = await prisma.nine.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A product built from this nine would be left with a dangling reference
  // (nineIds is a plain string array, not an FK — Prisma can't cascade it).
  const inUse = await prisma.courseProduct.findFirst({
    where: { courseId: session.courseId, nineIds: { has: id } },
  });
  if (inUse) {
    return NextResponse.json({ error: `"${existing.name}" is used by the product "${inUse.label}" — remove it from that product first.` }, { status: 409 });
  }

  await prisma.nine.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

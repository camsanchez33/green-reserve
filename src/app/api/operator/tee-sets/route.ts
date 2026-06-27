import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const teeSets = await prisma.teeSet.findMany({ where: { courseId: session.courseId }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(teeSets);
}

export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const teeSets: unknown[] = Array.isArray(body.teeSets) ? body.teeSets : [];

  await prisma.$transaction([
    prisma.teeSet.deleteMany({ where: { courseId: session.courseId } }),
    ...teeSets
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && !!(t as Record<string, unknown>).name)
      .map((t, i) => prisma.teeSet.create({
        data: {
          courseId: session.courseId,
          name: String(t.name).trim(),
          yardage: Number(t.yardage) || 0,
          rating: Number(t.rating) || 0,
          slope: Number(t.slope) || 0,
          sortOrder: i,
        },
      })),
  ]);

  const updated = await prisma.teeSet.findMany({ where: { courseId: session.courseId }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(updated);
}

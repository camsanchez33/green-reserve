import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const teeSets = await prisma.teeSet.findMany({ where: { courseId: course.id }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(teeSets);
}

// Full replace — onboarding/settings send the whole list at once rather than
// diffing individual rows, which is simpler for a short list that's edited as a unit.
export async function PUT(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const body = await req.json();
  const teeSets: unknown[] = Array.isArray(body.teeSets) ? body.teeSets : [];

  await prisma.$transaction([
    prisma.teeSet.deleteMany({ where: { courseId: course.id } }),
    ...teeSets
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && !!(t as Record<string, unknown>).name)
      .map((t, i) => prisma.teeSet.create({
        data: {
          courseId: course.id,
          name: String(t.name).trim(),
          yardage: Number(t.yardage) || 0,
          rating: Number(t.rating) || 0,
          slope: Number(t.slope) || 0,
          sortOrder: i,
        },
      })),
  ]);

  const updated = await prisma.teeSet.findMany({ where: { courseId: course.id }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(updated);
}

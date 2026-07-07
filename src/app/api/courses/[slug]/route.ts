import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeDbCourse } from '@/lib/normalize-course';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const dbCourse = await prisma.course.findUnique({
    where: { slug },
    include: { schedules: { where: { active: true }, select: { greenFeeWeekday: true } } },
  });

  // Only live, onboarded courses are visible to golfers — a draft/building
  // course has no real tee sheet yet, so there's nothing to show or book.
  if (!dbCourse || !dbCourse.active || dbCourse.liveStatus !== 'live' || dbCourse.archivedAt) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  const cheapest = dbCourse.schedules.length > 0 ? Math.min(...dbCourse.schedules.map(s => s.greenFeeWeekday)) : 0;
  return NextResponse.json(normalizeDbCourse(dbCourse, cheapest));
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { normalizeDbCourse } from '@/lib/normalize-course';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const dbCourse = await prisma.course.findUnique({
    where: { slug },
    include: {
      schedules: { where: { active: true }, select: { greenFeeWeekdayCents: true } },
      photos: { orderBy: { sortOrder: 'asc' as const } },
    },
  });

  // Only live, onboarded courses are visible to golfers — a draft/building
  // course has no real tee sheet yet, so there's nothing to show or book.
  if (!dbCourse || !dbCourse.active || dbCourse.liveStatus !== 'live' || dbCourse.archivedAt) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  // MP-3 B2d: schedules are cents; the public course page shows a "from $X" price, so convert here.
  const cheapestCents = dbCourse.schedules.length > 0 ? Math.min(...dbCourse.schedules.map((s: { greenFeeWeekdayCents: number }) => s.greenFeeWeekdayCents)) : 0;
  const cheapest = centsToDollarsOr0(cheapestCents);
  return NextResponse.json(normalizeDbCourse(dbCourse, cheapest));
}

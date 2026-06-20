import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeDbCourse } from '@/lib/normalize-course';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') || undefined;
  const type = searchParams.get('type') || undefined;
  const state = searchParams.get('state') || undefined;
  const featured = searchParams.get('featured') === '1' || undefined;

  // Only real, live, onboarded courses are shown to golfers. Courses still in
  // the inquiry/build pipeline (draft/building) aren't bookable yet, so they
  // shouldn't appear in search — a course card that dead-ends at checkout is
  // worse than not listing it at all.
  const where: Record<string, unknown> = { active: true, liveStatus: 'live', city: { not: '' } };
  if (type) where.type = type;
  if (state) where.state = state;
  if (featured) where.featured = true;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { state: { contains: q, mode: 'insensitive' } },
    ];
  }

  const dbCourses = await prisma.course.findMany({
    where,
    include: { schedules: { where: { active: true }, select: { greenFeeWeekday: true } } },
    orderBy: [{ featured: 'desc' }, { rating: 'desc' }],
  });

  const normalized = dbCourses.map(c => {
    const cheapest = c.schedules.length > 0 ? Math.min(...c.schedules.map(s => s.greenFeeWeekday)) : 0;
    return normalizeDbCourse(c, cheapest);
  });

  return NextResponse.json(normalized);
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCourseBySlug, generateTeeTimes } from '@/lib/courses-data';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  try {
    // Check if course is in live DB
    const dbCourse = await prisma.course.findUnique({ where: { slug } });
    if (dbCourse) {
      const teeTimes = await prisma.teeTime.findMany({
        where: { courseId: dbCourse.id, date, status: { not: 'unavailable' } },
        orderBy: { time: 'asc' },
      });
      return NextResponse.json(teeTimes);
    }
  } catch { /* fall through */ }

  // Fallback: deterministic static tee times
  const course = getCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json(generateTeeTimes(course, date));
}

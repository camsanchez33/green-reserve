import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeDbCourse } from '@/lib/normalize-course';
import { verifyPreviewToken } from '@/lib/preview-token';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';

  const tokenCourseId = await verifyPreviewToken(token);
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }

  const dbCourse = await prisma.course.findUnique({
    where: { id: courseId },
    include: { photos: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!dbCourse) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const cheapest = await prisma.teeTime.findFirst({
    where: { courseId, status: { not: 'blocked' } },
    orderBy: { greenFee: 'asc' },
    select: { greenFee: true },
  });

  return NextResponse.json(normalizeDbCourse(dbCourse, cheapest?.greenFee ?? 0));
}

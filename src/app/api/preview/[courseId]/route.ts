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

  let pageApprovalStatus: 'none' | 'approved' | 'changes_requested' = 'none';
  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true } });
  if (inquiry) {
    const [latest] = await prisma.inquiryStatusEvent.findMany({
      where: { inquiryId: inquiry.id, actorName: { in: ['Course approved their page', 'Course requested changes to their page'] } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (latest?.actorName === 'Course approved their page') pageApprovalStatus = 'approved';
    else if (latest?.actorName === 'Course requested changes to their page') pageApprovalStatus = 'changes_requested';
  }

  return NextResponse.json({
    ...normalizeDbCourse(dbCourse, cheapest?.greenFee ?? 0),
    page_approval_status: pageApprovalStatus,
  });
}

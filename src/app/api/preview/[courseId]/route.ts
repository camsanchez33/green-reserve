import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeDbCourse } from '@/lib/normalize-course';
import { verifyPreviewToken } from '@/lib/preview-token';
import { CHANGES_REQUESTED_PREFIX, LEGACY_CHANGES_REQUESTED_MARKER, isChangesRequestedEvent } from '@/lib/change-requests';

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
      where: {
        inquiryId: inquiry.id,
        OR: [
          { actorName: 'Course approved their page' },
          { actorName: LEGACY_CHANGES_REQUESTED_MARKER },
          { actorName: { startsWith: CHANGES_REQUESTED_PREFIX } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (latest?.actorName === 'Course approved their page') pageApprovalStatus = 'approved';
    else if (isChangesRequestedEvent(latest?.actorName)) pageApprovalStatus = 'changes_requested';
  }

  return NextResponse.json({
    ...normalizeDbCourse(dbCourse, cheapest?.greenFee ?? 0),
    page_approval_status: pageApprovalStatus,
    // Lets the preview banner tell "still pre-live" apart from "already
    // live, stop showing the review-loop controls" (RUN_QUEUE "review loop
    // doesn't understand already-live").
    is_live: dbCourse.active && dbCourse.liveStatus === 'live',
  });
}

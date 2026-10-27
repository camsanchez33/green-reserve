import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { normalizeDbCourse } from '@/lib/normalize-course';
import { verifyViewToken } from '@/lib/preview-token';
import { coursePageDecision } from '@/lib/approval-state';
import { CHANGES_REQUESTED_PREFIX, LEGACY_CHANGES_REQUESTED_MARKER, isChangesRequestedEvent } from '@/lib/change-requests';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';

  // The course's preview link or the admin's look (verifyViewToken); approving stays preview-only.
  const tokenCourseId = (await verifyViewToken(token))?.courseId;
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }

  const dbCourse = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      photos: { orderBy: { sortOrder: 'asc' } },
      teeSets: { orderBy: { sortOrder: 'asc' }, select: { name: true, yardage: true, rating: true, slope: true } },
      nines: { orderBy: { sortOrder: 'asc' }, select: { name: true, par: true } },
      // CART-1: About's walking line sums these up.
      schedules: { where: { active: true }, select: { walkingAllowed: true, walkingWeekend: true } },
    },
  });
  if (!dbCourse) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const cheapest = await prisma.teeTime.findFirst({
    where: { courseId, status: { not: 'blocked' } },
    orderBy: { greenFeeCents: 'asc' },
    select: { greenFeeCents: true },
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
  } else {
    pageApprovalStatus = coursePageDecision(dbCourse.pageDecision); // built without an inquiry
  }

  return NextResponse.json({
    ...normalizeDbCourse(dbCourse, centsToDollarsOr0(cheapest?.greenFeeCents)),
    page_approval_status: pageApprovalStatus,
    // Lets the preview banner tell "still pre-live" apart from "already
    // live, stop showing the review-loop controls" (RUN_QUEUE "review loop
    // doesn't understand already-live").
    is_live: dbCourse.active && dbCourse.liveStatus === 'live',
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { CHANGES_REQUESTED_PREFIX, LEGACY_CHANGES_REQUESTED_MARKER, isChangesRequestedEvent } from '@/lib/change-requests';

// Never cache — the dashboard's live/draft banner reads this and must
// reflect the DB the moment admin flips it, not a stale open-tab response.
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json(course);

  let pageApprovalStatus: 'none' | 'approved' | 'changes_requested' = 'none';
  if (!course.active || course.liveStatus !== 'live') {
    const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: course.id }, select: { id: true } });
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
  }

  return NextResponse.json({ ...course, pageApprovalStatus });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const updated = await prisma.course.update({
    where: { id: session.courseId },
    data: {
      name: body.name ?? course.name,
      type: body.type ?? course.type,
      city: body.city ?? course.city,
      state: body.state ?? course.state,
      address: body.address ?? course.address,
      phone: body.phone ?? course.phone,
      website: body.website ?? course.website,
      bookingUrl: body.bookingUrl ?? course.bookingUrl,
      description: body.description ?? course.description,
      holes: body.holes ? Number(body.holes) : course.holes,
      par: body.par ? Number(body.par) : course.par,
      yardage: body.yardage ? Number(body.yardage) : course.yardage,
      slope: body.slope ? Number(body.slope) : course.slope,
      active: body.active !== undefined ? body.active : course.active,
      brandColor: body.brandColor ?? course.brandColor,
      establishedYear: body.establishedYear !== undefined ? (body.establishedYear ? Number(body.establishedYear) : null) : course.establishedYear,
    },
  });
  return NextResponse.json(updated);
}

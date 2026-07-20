import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPreviewToken } from '@/lib/preview-token';
import { sendCourseApprovedNotification } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// Approval is advisory, not automatic — going live stays an admin action.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';

  const tokenCourseId = await verifyPreviewToken(token);
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }

  const courseAllowed = await rateLimit(`preview-approve:${courseId}`, 10, 3600);
  const ipAllowed = await rateLimit(`preview-approve-ip:${clientIp(req)}`, 30, 3600);
  if (!courseAllowed || !ipAllowed) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  // Same no-silent-failure fix as /api/operator/approve-page: don't report
  // success while quietly recording nothing.
  if (!inquiry) {
    return NextResponse.json({ error: 'This course has no linked inquiry — approval can’t be recorded. Contact GreenReserve support.' }, { status: 409 });
  }

  await prisma.inquiryStatusEvent.create({
    data: {
      inquiryId: inquiry.id,
      fromStatus: inquiry.status,
      toStatus: inquiry.status,
      trigger: 'course',
      actorName: 'Course approved their page',
    },
  });

  // Fire-and-forget (A6 item 2 pattern) — never await an email send in the
  // request path.
  sendCourseApprovedNotification({ courseName: course.name, contactName: inquiry.contactName || course.name })
    .catch(err => console.error('Course-approved notification email failed:', err));

  return NextResponse.json({ ok: true });
}

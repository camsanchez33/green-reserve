import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';
import { signPreviewToken } from '@/lib/preview-token';
import { sendPreviewEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { inquiryId, courseId: rawCourseId } = await req.json() as {
    inquiryId?: string;
    courseId?: string;
  };

  const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';

  if (inquiryId) {
    const inquiry = await prisma.courseInquiry.findUnique({ where: { id: inquiryId } });
    if (!inquiry) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    if (!inquiry.builtCourseId) {
      return NextResponse.json({ error: 'No course built for this inquiry yet' }, { status: 400 });
    }

    const courseId = String(inquiry.builtCourseId);
    const token = await signPreviewToken(courseId);
    const previewUrl = `${base}/preview/${courseId}?token=${token}`;

    await sendPreviewEmail({
      contactName: inquiry.contactName,
      contactEmail: inquiry.email,
      courseName: inquiry.courseName,
      previewUrl,
    });

    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId,
        fromStatus: inquiry.status,
        toStatus: inquiry.status,
        trigger: 'admin',
        actorName: `Preview sent by ${session.name}`,
      },
    });

    return NextResponse.json({ ok: true, previewUrl });
  }

  if (rawCourseId) {
    const course = await prisma.course.findUnique({
      where: { id: rawCourseId },
      select: { name: true, operatorId: true },
    });
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    if (!course.operatorId) {
      return NextResponse.json({ error: 'Course has no operator' }, { status: 400 });
    }

    const operator = await prisma.courseOperator.findUnique({
      where: { id: course.operatorId },
      select: { name: true, email: true },
    });
    if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

    const token = await signPreviewToken(rawCourseId);
    const previewUrl = `${base}/preview/${rawCourseId}?token=${token}`;

    await sendPreviewEmail({
      contactName: operator.name,
      contactEmail: operator.email,
      courseName: course.name,
      previewUrl,
    });

    return NextResponse.json({ ok: true, previewUrl });
  }

  return NextResponse.json({ error: 'inquiryId or courseId required' }, { status: 400 });
}

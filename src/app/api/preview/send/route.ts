import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';
import { signPreviewToken } from '@/lib/preview-token';
import { sendPreviewWithDashboardAccessEmail } from '@/lib/email';
import { getApprovalState } from '@/lib/approval-state';

// RUN_QUEUE "Send Preview = one combined send": pressing Send Preview sends
// ONE email with both the page preview AND dashboard login access.
// "approval propagates + gates previews": once approved (this round),
// sending another preview is blocked here — not just hidden client-side —
// until a change request or an explicit "Request re-review" reopens it
// (src/lib/change-requests.ts scopeToCurrentRound is the single anchor).
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

    const gate = await getApprovalState(courseId);
    if (gate.sendPreviewGated) {
      return NextResponse.json({ error: 'This course already approved their page — request re-review or wait for a change request before sending another preview.' }, { status: 409 });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId }, include: { operator: true } });
    if (!course?.operator) return NextResponse.json({ error: 'No operator account found' }, { status: 404 });

    const token = await signPreviewToken(courseId);
    const previewUrl = `${base}/preview/${courseId}?token=${token}`;

    const tempPassword = randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const verificationToken = randomBytes(32).toString('hex');
    await prisma.courseOperator.update({ where: { id: course.operator.id }, data: { password: hashed, verificationToken } });
    const setupLink = `${base}/dashboard/verify?token=${verificationToken}`;

    await sendPreviewWithDashboardAccessEmail({
      contactName: inquiry.contactName,
      contactEmail: inquiry.email,
      courseName: inquiry.courseName,
      previewUrl, tempPassword, setupLink,
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

    return NextResponse.json({ ok: true, previewUrl, tempPassword, setupLink });
  }

  if (rawCourseId) {
    const gate = await getApprovalState(rawCourseId);
    if (gate.sendPreviewGated) {
      return NextResponse.json({ error: 'This course already approved their page — request re-review or wait for a change request before sending another preview.' }, { status: 409 });
    }

    const course = await prisma.course.findUnique({
      where: { id: rawCourseId },
      select: { name: true, operatorId: true },
    });
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    if (!course.operatorId) {
      return NextResponse.json({ error: 'Course has no operator' }, { status: 400 });
    }

    const operator = await prisma.courseOperator.findUnique({ where: { id: course.operatorId } });
    if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

    const token = await signPreviewToken(rawCourseId);
    const previewUrl = `${base}/preview/${rawCourseId}?token=${token}`;

    const tempPassword = randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const verificationToken = randomBytes(32).toString('hex');
    await prisma.courseOperator.update({ where: { id: operator.id }, data: { password: hashed, verificationToken } });
    const setupLink = `${base}/dashboard/verify?token=${verificationToken}`;

    await sendPreviewWithDashboardAccessEmail({
      contactName: operator.name,
      contactEmail: operator.email,
      courseName: course.name,
      previewUrl, tempPassword, setupLink,
    });

    const linkedInquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: rawCourseId } });
    if (linkedInquiry) {
      await prisma.inquiryStatusEvent.create({
        data: {
          inquiryId: linkedInquiry.id,
          fromStatus: linkedInquiry.status,
          toStatus: linkedInquiry.status,
          trigger: 'admin',
          actorName: `Preview sent by ${session.name}`,
        },
      });
    }

    return NextResponse.json({ ok: true, previewUrl, tempPassword, setupLink });
  }

  return NextResponse.json({ error: 'inquiryId or courseId required' }, { status: 400 });
}

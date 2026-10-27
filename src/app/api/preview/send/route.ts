import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { signPreviewToken } from '@/lib/preview-token';
import { sendDashboardSetupEmail, sendPageReadyInDashboardEmail } from '@/lib/email';
import { issueSetupLink, hasSetUp, SETUP_LINK_DAYS } from '@/lib/operator-setup';
import { getApprovalState } from '@/lib/approval-state';
import { withAudit } from '@/lib/admin-audit';

// RUN_QUEUE "Send Preview = one combined send", reworked Cam 2026-10-27: no
// password is ever emailed. An owner still setting up gets the one "set your
// password" email (lib/operator-setup) — their dashboard then walks them to the
// page to review and approve. An owner who already signs in gets a note that the
// page is ready in their dashboard; their sign-in is NOT touched (this route used
// to reset the password on every send, locking out owners who had chosen theirs).
// "approval propagates + gates previews": once approved (this round),
// sending another preview is blocked here — not just hidden client-side —
// until a change request or an explicit "Request re-review" reopens it
// (src/lib/change-requests.ts scopeToCurrentRound is the single anchor).
/** Email the owner about their page. Returns an error message, or null when it went. */
async function tellOwner(op: { id: string; name: string; email: string; lastLoginAt: Date | null; emailVerified: boolean }, courseName: string): Promise<string | null> {
  try {
    if (hasSetUp(op)) await sendPageReadyInDashboardEmail({ operatorName: op.name, operatorEmail: op.email, courseName });
    else await sendDashboardSetupEmail({ operatorName: op.name, operatorEmail: op.email, courseName, setupUrl: await issueSetupLink(op.id), pageReady: true, linkDays: SETUP_LINK_DAYS });
    return null;
  } catch (err) {
    console.error('Preview email failed:', err);
    return `The preview email did not send (${err instanceof Error ? err.message : 'unknown error'}). Their sign-in is unchanged. Try again.`;
  }
}

async function sendPreview(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  // MP-2b: this route mints an owner's sign-in (setup) link and emails it, so it
  // stays MANAGER_PLUS like every sibling that touches an owner's sign-in.
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

    const sendErr = await tellOwner(course.operator, inquiry.courseName);
    if (sendErr) return NextResponse.json({ error: sendErr }, { status: 502 });

    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId,
        fromStatus: inquiry.status,
        toStatus: inquiry.status,
        trigger: 'admin',
        actorName: `Preview sent by ${session.name}`,
      },
    });

    // The setup link is never returned — only the email carries it.
    return NextResponse.json({ ok: true, previewUrl });
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

    const sendErr = await tellOwner(operator, course.name);
    if (sendErr) return NextResponse.json({ error: sendErr }, { status: 502 });

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

    // The setup link is never returned — only the email carries it.
    return NextResponse.json({ ok: true, previewUrl });
  }

  return NextResponse.json({ error: 'inquiryId or courseId required' }, { status: 400 });
}

// BRAIN-1a: sending a course its preview is recorded.
export const POST = withAudit(sendPreview, body => ({ action: 'send_preview', targetType: body.courseId ? 'course' : 'inquiry', targetId: String(body.courseId ?? body.inquiryId ?? ''), courseId: String(body.courseId ?? '') || null }));

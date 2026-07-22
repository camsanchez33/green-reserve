import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { sendOnboardingChaseEmail } from '@/lib/email';
import { logReminderSent } from '@/lib/course-timeline';

const MISSING_STEP_LABEL: Record<string, string> = {
  agreement: 'Accept the Operator Agreement',
  stripe: 'Connect payments with Stripe',
};

// AGREEMENT = GO-LIVE GATE / STRIPE RULE FINAL (RUN_QUEUE) — the one-click
// reminder nudge for either of the two go-live absolutes. Reuses the same
// chase-email template and timeline logging the onboarding auto-chase cron
// already uses, so a manual nudge and an automatic one look identical in
// the course's history.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId, missing } = await req.json();
  if (!courseId || (missing !== 'agreement' && missing !== 'stripe')) {
    return NextResponse.json({ error: 'Missing courseId or invalid "missing" value' }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { operator: { select: { name: true, email: true } } } });
  if (!course?.operator) return NextResponse.json({ error: 'No operator account found for this course' }, { status: 404 });

  try {
    await sendOnboardingChaseEmail({
      operatorName: course.operator.name,
      operatorEmail: course.operator.email,
      courseName: course.name,
      remainingSteps: [MISSING_STEP_LABEL[missing]],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to send reminder' }, { status: 500 });
  }

  await logReminderSent(courseId, missing);
  return NextResponse.json({ success: true });
}

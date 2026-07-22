import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendOnboardingChaseEmail } from '@/lib/email';
import { getApprovalState } from '@/lib/approval-state';
import { getCourseTimeline, isRemindersPaused, lastReminderSentAt, reminderSentCount, logReminderSent } from '@/lib/course-timeline';

// A-05 item 4b — auto-chase reminders for courses that haven't finished
// onboarding: 3d, 7d, 14d after the course record was created, then weekly.
// Stops the instant the course goes active (that's "completion" here — the
// last checklist step). Per-course kill switch via course-timeline markers.
// Runs once daily (Vercel Hobby cron cap).
const THRESHOLDS_DAYS = [3, 7, 14]; // index = reminders already sent

function daysBetween(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 86400000;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.course.findMany({
    where: { active: false, archivedAt: null, operatorId: { not: null } },
    include: {
      operator: { select: { name: true, email: true, emailVerified: true } },
      schedules: { select: { id: true }, take: 1 },
    },
  });

  const results: { courseId: string; sent: boolean; reason: string }[] = [];

  for (const course of candidates) {
    if (!course.operator) continue;
    const events = await getCourseTimeline(course.id);
    if (!events) { results.push({ courseId: course.id, sent: false, reason: 'no linked inquiry' }); continue; }
    if (isRemindersPaused(events)) { results.push({ courseId: course.id, sent: false, reason: 'paused' }); continue; }

    const lastSent = lastReminderSentAt(events);
    if (lastSent && daysBetween(now, lastSent) < 1) { results.push({ courseId: course.id, sent: false, reason: 'sent today' }); continue; }

    const count = reminderSentCount(events);
    const daysSinceCreated = daysBetween(now, course.createdAt);
    const nextThreshold = count < THRESHOLDS_DAYS.length ? THRESHOLDS_DAYS[count] : THRESHOLDS_DAYS[THRESHOLDS_DAYS.length - 1] + (count - THRESHOLDS_DAYS.length + 1) * 7;
    if (daysSinceCreated < nextThreshold) { results.push({ courseId: course.id, sent: false, reason: `not due (day ${daysSinceCreated.toFixed(1)} of ${nextThreshold})` }); continue; }

    const approval = await getApprovalState(course.id);
    const remainingSteps: string[] = [];
    if (!course.operator.emailVerified) remainingSteps.push('Verify your account email');
    if (approval.status !== 'approved') remainingSteps.push('Approve your page (check your email for the preview)');
    if (!course.stripeAccountActive) remainingSteps.push('Connect payments with Stripe');
    if (course.schedules.length === 0) remainingSteps.push('Set your tee time schedule and pricing');
    if (remainingSteps.length === 0) remainingSteps.push('Go live from your dashboard');

    try {
      await sendOnboardingChaseEmail({
        operatorName: course.operator.name,
        operatorEmail: course.operator.email,
        courseName: course.name,
        remainingSteps,
      });
      await logReminderSent(course.id, `day${nextThreshold}`);
      results.push({ courseId: course.id, sent: true, reason: `day${nextThreshold}` });
    } catch (e) {
      console.error('chase-onboarding send failed for', course.id, e);
      results.push({ courseId: course.id, sent: false, reason: 'send failed' });
    }
  }

  return NextResponse.json({ processed: candidates.length, results });
}

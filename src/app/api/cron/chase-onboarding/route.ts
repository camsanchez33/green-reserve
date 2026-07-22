import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendOnboardingChaseEmail } from '@/lib/email';
import { getApprovalState } from '@/lib/approval-state';
import { getCourseTimeline, isRemindersPaused, lastReminderSentAt, reminderSentCount, logReminderSent, latestAgreementAcceptance } from '@/lib/course-timeline';

// A-05 item 4b — auto-chase reminders for courses that haven't finished
// onboarding: 3d, 7d, 14d after the course record was created, then weekly.
// Stops the instant the course goes active (that's "completion" here — the
// last checklist step). Per-course kill switch via course-timeline markers.
// Runs once daily (Vercel Hobby cron cap).
//
// AGREEMENT = GO-LIVE GATE item 3 — a SEPARATE, narrower chase also covers
// already-LIVE legacy courses whose operator predates the clickwrap: same
// cadence/pause switch, but the only possible remaining step is accepting
// the agreement (everything else is already done, by definition of being
// live), and "completion" here is acceptance, not going active.
const THRESHOLDS_DAYS = [3, 7, 14]; // index = reminders already sent

function daysBetween(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 86400000;
}

function isDue(events: Awaited<ReturnType<typeof getCourseTimeline>>, createdAt: Date, now: Date): { due: false; reason: string } | { due: true; nextThreshold: number } {
  if (!events) return { due: false, reason: 'no linked inquiry' };
  if (isRemindersPaused(events)) return { due: false, reason: 'paused' };
  const lastSent = lastReminderSentAt(events);
  if (lastSent && daysBetween(now, lastSent) < 1) return { due: false, reason: 'sent today' };
  const count = reminderSentCount(events);
  const daysSinceCreated = daysBetween(now, createdAt);
  const nextThreshold = count < THRESHOLDS_DAYS.length ? THRESHOLDS_DAYS[count] : THRESHOLDS_DAYS[THRESHOLDS_DAYS.length - 1] + (count - THRESHOLDS_DAYS.length + 1) * 7;
  if (daysSinceCreated < nextThreshold) return { due: false, reason: `not due (day ${daysSinceCreated.toFixed(1)} of ${nextThreshold})` };
  return { due: true, nextThreshold };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results: { courseId: string; sent: boolean; reason: string }[] = [];

  const preLive = await prisma.course.findMany({
    where: { active: false, archivedAt: null, operatorId: { not: null } },
    include: {
      operator: { select: { name: true, email: true, emailVerified: true } },
      schedules: { select: { id: true }, take: 1 },
    },
  });

  for (const course of preLive) {
    if (!course.operator) continue;
    const events = await getCourseTimeline(course.id);
    const status = isDue(events, course.createdAt, now);
    if (!status.due) { results.push({ courseId: course.id, sent: false, reason: status.reason }); continue; }

    const approval = await getApprovalState(course.id);
    const remainingSteps: string[] = [];
    if (!course.operator.emailVerified) remainingSteps.push('Verify your account email');
    if (approval.status !== 'approved') remainingSteps.push('Approve your page (check your email for the preview)');
    if (!course.stripeAccountActive) remainingSteps.push('Connect payments with Stripe');
    if (course.schedules.length === 0) remainingSteps.push('Set your tee time schedule and pricing');
    if (!events || !latestAgreementAcceptance(events)) remainingSteps.push('Accept the Operator Agreement');
    if (remainingSteps.length === 0) remainingSteps.push('Go live from your dashboard');

    try {
      await sendOnboardingChaseEmail({ operatorName: course.operator.name, operatorEmail: course.operator.email, courseName: course.name, remainingSteps });
      await logReminderSent(course.id, `day${status.nextThreshold}`);
      results.push({ courseId: course.id, sent: true, reason: `day${status.nextThreshold}` });
    } catch (e) {
      console.error('chase-onboarding send failed for', course.id, e);
      results.push({ courseId: course.id, sent: false, reason: 'send failed' });
    }
  }

  // Legacy live courses missing only the agreement.
  const live = await prisma.course.findMany({
    where: { active: true, archivedAt: null, operatorId: { not: null } },
    include: { operator: { select: { name: true, email: true } } },
  });

  for (const course of live) {
    if (!course.operator) continue;
    const events = await getCourseTimeline(course.id);
    if (events && latestAgreementAcceptance(events)) continue; // already accepted — nothing to chase
    const status = isDue(events, course.createdAt, now);
    if (!status.due) { results.push({ courseId: course.id, sent: false, reason: status.reason }); continue; }

    try {
      await sendOnboardingChaseEmail({ operatorName: course.operator.name, operatorEmail: course.operator.email, courseName: course.name, remainingSteps: ['Accept the Operator Agreement'] });
      await logReminderSent(course.id, `day${status.nextThreshold}`);
      results.push({ courseId: course.id, sent: true, reason: `day${status.nextThreshold} (legacy agreement)` });
    } catch (e) {
      console.error('chase-onboarding (legacy agreement) send failed for', course.id, e);
      results.push({ courseId: course.id, sent: false, reason: 'send failed' });
    }
  }

  return NextResponse.json({ processed: preLive.length + live.length, results });
}

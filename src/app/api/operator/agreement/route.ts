import { NextResponse } from 'next/server';
import { resolveDashboardSession } from '@/lib/session';
import { logAgreementAccepted, getCourseTimeline, latestAgreementAcceptance } from '@/lib/course-timeline';

// A-05 item 5a — Operator Agreement clickwrap, an extension of the existing
// first-login onboarding flow (dashboard/onboarding). Acceptance (version +
// who + when) is logged to the course timeline — no schema change.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const events = await getCourseTimeline(session.courseId);
  return NextResponse.json({ agreement: events ? latestAgreementAcceptance(events) : null });
}

export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ok = await logAgreementAccepted(session.courseId, session.email);
  if (!ok) return NextResponse.json({ error: 'Could not record acceptance' }, { status: 400 });
  return NextResponse.json({ success: true });
}

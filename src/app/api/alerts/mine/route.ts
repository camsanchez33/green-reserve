// ALERTS-2: a logged-in member's own alerts at this course (gr_member only).
import { NextRequest, NextResponse } from 'next/server';
import { loggedInAt } from '@/lib/member-session';
import { memberAlerts } from '@/lib/tee-time-alerts';

export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get('courseId') ?? '';
  // loggedInAt: this course's log-in, and only while the course has Log in on.
  const session = courseId ? await loggedInAt(courseId) : null;
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ alerts: await memberAlerts(courseId, session.email) });
}

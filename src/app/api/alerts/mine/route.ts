// ALERTS-2: a logged-in member's own alerts at this course (gr_member only).
import { NextRequest, NextResponse } from 'next/server';
import { getMemberSession } from '@/lib/member-session';
import { memberAlerts } from '@/lib/tee-time-alerts';

export async function GET(req: NextRequest) {
  const session = await getMemberSession();
  const courseId = req.nextUrl.searchParams.get('courseId') ?? '';
  if (!session || !courseId || session.courseId !== courseId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ alerts: await memberAlerts(courseId, session.email) });
}

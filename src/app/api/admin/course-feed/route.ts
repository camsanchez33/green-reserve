import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { buildCourseFeed, FEED_GROUPS, type FeedGroup } from '@/lib/course-timeline';

// BRAIN-1b: a course's whole story, newest first, a page at a time.
// GET ?courseId=&before=<cursor from the last page>&groups=bookings,messages — support+, like the
// course page it sits on (it names golfers and money).
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'courses');
  if (noArea) return noArea;
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'The course timeline is for support and above.' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const courseId = sp.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Which course?' }, { status: 400 });
  const groups = (sp.get('groups') ?? '').split(',').filter((g): g is FeedGroup => FEED_GROUPS.some(x => x.key === g));
  const feed = await buildCourseFeed(courseId, { cursor: sp.get('before'), groups });
  if (!feed) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  return NextResponse.json(feed);
}

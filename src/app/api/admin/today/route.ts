import { NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-session';
import { buildActionQueue } from '@/lib/admin-action-queue';
import { todayHealth, todayCourses } from '@/lib/admin-today';

// AW-4b (Cam 2026-10-21, second pass): the admin Today page.
//   health   one line on the page — red/green for the things that break
//            silently (manager+, the System page's gate: it reads the cron log)
//   needs    what a person has to do that is NOT about one course — the
//            inquiry rows (support+, as the old Overview queue was)
//   courses  every live or draft course with its own to-dos, "Staff seen" and
//            its fees this month (support+: it names golfers and money)
// A section a role can't see comes back null and the page leaves it out.
// Money and Onboarding cards are gone from Today: Revenue and Inquiries hold them.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const now = new Date();
  const support = requireRole(session, SUPPORT_PLUS);
  const [queue, healthOut] = await Promise.all([
    support ? buildActionQueue(now) : null,
    requireRole(session, MANAGER_PLUS) ? todayHealth(now) : null,
  ]);
  const courses = queue ? await todayCourses(now, queue.rows) : null;
  const needs = queue ? queue.rows.filter(r => !r.courseId) : null;
  return NextResponse.json({ needs, health: healthOut, courses, at: now.toISOString() });
}

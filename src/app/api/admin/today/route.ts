import { NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-session';
import { buildActionQueue } from '@/lib/admin-action-queue';
import { todayHealth, todayCourses } from '@/lib/admin-today';
import { homeToday, homeOverview, homeCourseStats } from '@/lib/admin-home';
import { listProblems } from '@/lib/problems';
import { listGoals } from '@/lib/admin-goals';

// ADMIN-C (Cam 2026-10-22, mockup C): the admin Home.
//   health    one line in the top bar's words (manager+, the System page's
//             gate: it reads the cron log)
//   today     online bookings by hour vs the same weekday last week, fees today
//   overview  the last 7 days vs the 7 before
//   courses   every live or draft course: its week, "Staff seen", its to-dos
//   problems  open problems (the Problems page's queue)
//   needs     pipeline to-dos that aren't about one course (the inquiry rows)
//   goals     every goal and where it stands
// Everything but health is support+: it names golfers, courses and money. A
// section a role can't see comes back null and the page leaves it out.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const now = new Date();
  const support = requireRole(session, SUPPORT_PLUS);
  const [queue, healthOut, today, overview, problems, goals] = await Promise.all([
    support ? buildActionQueue(now) : null,
    requireRole(session, MANAGER_PLUS) ? todayHealth(now) : null,
    support ? homeToday(now) : null,
    support ? homeOverview(now) : null,
    support ? listProblems(now) : null,
    support ? listGoals(now) : null,
  ]);
  let courses = null;
  if (queue) {
    const list = await todayCourses(now, queue.rows);
    const stats = await homeCourseStats(now, list.map(c => c.id));
    courses = list.map(c => ({ ...c, ...stats.get(c.id)! }));
  }
  const needs = queue ? queue.rows.filter(r => !r.courseId) : null;
  return NextResponse.json({
    needs, health: healthOut, courses, today, overview, goals,
    problems: problems ? problems.open : null,
    at: now.toISOString(),
  });
}

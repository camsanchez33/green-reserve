// Cam 2026-10-05: "only show announcements to live courses" and "announcements
// should stay gone after seen by the course when they press the x".
//
// ONE rule for who sees what, used by the banner, the Messages list and the
// dismiss route:
//   - the operator's active course must be live (active, liveStatus 'live',
//     not archived) — a course still onboarding sees none;
//   - only announcements sent after that course went live (firstWentLiveAt,
//     else createdAt) — a new course doesn't inherit months of old ones.
import { prisma } from './prisma';

/** The earliest createdAt an announcement may have to reach this course, or null when the course sees none. */
export async function announcementsSince(courseId: string): Promise<Date | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { active: true, liveStatus: true, archivedAt: true, firstWentLiveAt: true, createdAt: true } });
  if (!c || !c.active || c.liveStatus !== 'live' || c.archivedAt) return null;
  return c.firstWentLiveAt ?? c.createdAt;
}

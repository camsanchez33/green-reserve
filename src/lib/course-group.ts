// GRP-1 (Cam 2026-10-19, after golfbergencounty.com): courses run together.
// A course in a group shares one resident list with every course in it; a
// course on its own is a group of one. Groups are made in Admin only.
import { prisma } from './prisma';

/** This course and every other course in its group (just itself when it has none). */
export async function groupCourseIds(courseId: string): Promise<string[]> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { groupId: true } });
  if (!c?.groupId) return [courseId];
  const all = await prisma.course.findMany({ where: { groupId: c.groupId }, select: { id: true } });
  return all.length ? all.map(x => x.id) : [courseId];
}

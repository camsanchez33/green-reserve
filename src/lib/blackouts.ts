// Closing a day on the schedule (Blackout) and reopening it. Revamp 3 fix 11
// (Cam 2026-10-29): closing says who is booked (they stay booked — Weather on the
// tee sheet cancels and tells them), and reopening puts back on sale only the
// times the closure itself blocked, never a time staff or an event had blocked.
import { prisma } from './prisma';
import { generateTeeTimes } from './tee-sheet-engine';
import { todayIn } from './course-time';

/** Who is booked on a day, so closing it says so first. */
export async function bookedOn(courseId: string, date: string) {
  const b = await prisma.booking.findMany({ where: { courseId, status: 'confirmed', teeTime: { date } }, select: { players: true } });
  return { groups: b.length, players: b.reduce((n, x) => n + x.players, 0) };
}

/**
 * Close a day. Open times go (a time with any booking row must stay — Booking.teeTime
 * is required — so it is blocked in place, bookings kept). The times blocked here are
 * recorded on the Blackout for reopening.
 */
export async function closeDay(courseId: string, date: string, reason: string) {
  const blackout = await prisma.$transaction(async tx => {
    // A time staff blocked by hand stays as it is (blocked, not recorded), so reopening leaves it blocked.
    await tx.teeTime.deleteMany({ where: { courseId, date, status: { not: 'blocked' }, bookings: { none: {} } } });
    const toBlock = await tx.teeTime.findMany({ where: { courseId, date, status: { not: 'blocked' } }, select: { id: true } });
    await tx.teeTime.updateMany({ where: { id: { in: toBlock.map(t => t.id) } }, data: { status: 'blocked' } });
    return tx.blackout.create({ data: { courseId, date, reason: reason.slice(0, 200), blockedTeeTimeIds: toBlock.map(t => t.id) } });
  });
  return { id: blackout.id, date: blackout.date, reason: blackout.reason, booked: await bookedOn(courseId, date) };
}

/** Reopen a closed day: null when it isn't this course's. A past day only loses its record. */
export async function reopenDay(courseId: string, id: string) {
  const blackout = await prisma.blackout.findUnique({ where: { id } });
  if (!blackout || blackout.courseId !== courseId) return null;
  await prisma.blackout.delete({ where: { id } });
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (blackout.date < todayIn(course?.timezone)) return { reopened: 0, created: 0 };
  // An event's held times stay held (W2-9).
  const held = await prisma.teeTime.updateMany({ where: { courseId, id: { in: blackout.blockedTeeTimeIds }, status: 'blocked', eventId: null }, data: { status: 'available' } });
  const created = await generateTeeTimes(courseId, blackout.date);
  return { reopened: held.count, created };
}

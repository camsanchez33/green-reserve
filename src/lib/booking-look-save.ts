// Booking page look: the save, with its settings audit row (server only). The rules are lib/booking-look.
import { prisma } from './prisma';
import type { BookingLook, BookingAccent } from './booking-look';

export type SettingActor = { type: 'operator' | 'staff'; id: string; name: string };

/**
 * Save the look and write one CourseSettingChange per field that changed, in one
 * transaction. Nothing changed = nothing written.
 */
export async function saveBookingLook(courseId: string, input: { look: BookingLook; accent: BookingAccent }, actor: SettingActor) {
  return prisma.$transaction(async tx => {
    const before = await tx.course.findUnique({ where: { id: courseId }, select: { bookingLook: true, bookingAccent: true } });
    if (!before) return null;
    const changes = [
      { field: 'bookingLook', before: before.bookingLook, after: input.look },
      { field: 'bookingAccent', before: before.bookingAccent ?? '', after: input.accent },
    ].filter(c => c.before !== c.after);
    if (changes.length) {
      await tx.course.update({ where: { id: courseId }, data: { bookingLook: input.look, bookingAccent: input.accent } });
      await tx.courseSettingChange.createMany({
        data: changes.map(c => ({ courseId, actorType: actor.type, actorId: actor.id, actorName: actor.name.slice(0, 120), ...c })),
      });
    }
    return { look: input.look, accent: input.accent, changed: changes.length };
  });
}

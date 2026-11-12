// BOOKING-REF (Cam 2026-11-12): courses are numbered GR1, GR2, … (Course.number, the
// highest so far + 1, set by an insert trigger) and bookings within their course, GR1-1, GR1-2, … (Booking.ref, set
// by the "Booking_ref_assign" insert trigger from the course's own sequence "bookref_<id>"). A booking or
// course from before the columns (either number null) keeps the old 8-character id, so
// every label still names exactly one booking. The ONE place the format lives.
import { prisma } from './prisma';

/** "GR4", or null for a course from before numbers. */
export function courseRefLabel(c: { number?: number | null }): string | null {
  return c.number != null ? `GR${c.number}` : null;
}

/** "GR4-17", or the old "3F9A1C2B" when the course or the booking has no number. */
export function bookingRefLabel(b: { id: string; ref?: number | null; course?: { number?: number | null } | null }, courseNumber?: number | null): string {
  const n = courseNumber ?? b.course?.number ?? null;
  return n != null && b.ref != null ? `GR${n}-${b.ref}` : String(b.id ?? '').slice(0, 8).toUpperCase();
}

const MAX_INT = 2_147_483_647;
const num = (s: string) => { const n = Number(s); return Number.isSafeInteger(n) && n > 0 && n <= MAX_INT ? n : null; };

/**
 * What a search box means by a reference: "GR4-17", "gr4-17", "4-17" (a booking) or
 * "GR4" (a course). Anything else is null.
 */
export function parseRef(q: string): { course: number; ref: number | null } | null {
  const t = q.trim().replace(/^#\s*/, '');
  const b = /^(?:gr\s*)?(\d{1,9})\s*-\s*(\d{1,9})$/i.exec(t);
  if (b) { const c = num(b[1]), r = num(b[2]); return c && r ? { course: c, ref: r } : null; }
  const c = /^gr\s*(\d{1,9})$/i.exec(t);
  if (c) { const n = num(c[1]); return n ? { course: n, ref: null } : null; }
  return null;
}

/** The label for a booking by id (for emails, which are handed only the id). Never throws. */
export async function bookingRefFor(bookingId: string | null | undefined): Promise<string> {
  if (!bookingId) return '';
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, ref: true, course: { select: { number: true } } } });
    return bookingRefLabel(b ?? { id: bookingId });
  } catch {
    return bookingRefLabel({ id: bookingId });
  }
}

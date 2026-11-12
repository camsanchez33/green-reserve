// BOOKING-REF (Cam 2026-11-12): the short number a golfer reads in an email or on the
// Manage page and says to the pro shop — GR-<ref>, from the Booking.ref Postgres
// sequence. A booking from before the column (ref null) keeps the old 8-character id,
// so every label still names exactly one booking. The ONE place the format lives.
import { prisma } from './prisma';

const PREFIX = 'GR-';

/** "GR-1042", or the old "3F9A1C2B" for a booking from before refs. */
export function bookingRefLabel(b: { id: string; ref?: number | null }): string {
  return b.ref != null ? `${PREFIX}${b.ref}` : String(b.id ?? '').slice(0, 8).toUpperCase();
}

/** The number in a search for a booking reference ("GR-1042", "gr1042", "#GR 1042"), else null. */
export function parseBookingRef(q: string): number | null {
  const m = /^\s*#?\s*gr[\s-]?(\d{1,9})\s*$/i.exec(q);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

/** The label for a booking by id (for emails, which are handed only the id). Never throws. */
export async function bookingRefFor(bookingId: string | null | undefined): Promise<string> {
  if (!bookingId) return '';
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, ref: true } });
    return bookingRefLabel(b ?? { id: bookingId });
  } catch {
    return bookingRefLabel({ id: bookingId });
  }
}

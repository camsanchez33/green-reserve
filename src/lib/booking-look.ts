// Booking page look (Cam 2026-11-18, lanes/build.md "Booking page look"): a course picks
// Light or Dark for its golfer booking pages, plus one accent from four presets. No red:
// red means a problem. The accent is stored by NAME because each preset has its own light
// and dark values on the golfer pages (lanes/golfer/booking-page-mockup.html). brandColor
// stays the course's hex for receipts, emails and the dashboard.
//
// Also here: the pure parts of the booking page's extra payload fields (has_live_promo,
// closed_dates), so normalizeDbCourse stays a plain mapping and the rules are testable.
// Pure and client-safe (the Settings popup imports it); the save is lib/booking-look-save.

export const BOOKING_LOOKS = ['light', 'dark'] as const;
export const BOOKING_ACCENTS = ['black', 'green', 'blue', 'yellow'] as const;
export type BookingLook = (typeof BOOKING_LOOKS)[number];
export type BookingAccent = (typeof BOOKING_ACCENTS)[number];
export const DEFAULT_BOOKING_LOOK: BookingLook = 'light';

/** Display names, in the order Settings shows them. */
export const BOOKING_ACCENT_LABELS: Record<BookingAccent, string> = { black: 'Black', green: 'Green', blue: 'Blue', yellow: 'Yellow' };

/**
 * Each preset's colours per look, from the approved mockup (lanes/golfer/booking-page-mockup.html):
 * accent, hover, soft background, and the text that sits on the accent. Yellow is a deep gold
 * on Light so white text on it passes AA.
 */
export const BOOKING_ACCENT_COLOURS: Record<BookingAccent, Record<BookingLook, { acc: string; hover: string; soft: string; onAcc: string }>> = {
  black: { light: { acc: '#1F2328', hover: '#000000', soft: '#EBECEE', onAcc: '#FFFFFF' }, dark: { acc: '#E6E8EB', hover: '#FFFFFF', soft: '#2C2F33', onAcc: '#141814' } },
  green: { light: { acc: '#1E6B45', hover: '#155234', soft: '#E3F0E8', onAcc: '#FFFFFF' }, dark: { acc: '#7FD1A3', hover: '#A3E0BD', soft: '#1F3329', onAcc: '#0F1A13' } },
  blue: { light: { acc: '#1D4ED8', hover: '#1A3FA8', soft: '#E7EDFC', onAcc: '#FFFFFF' }, dark: { acc: '#A8BFF7', hover: '#C5D4FA', soft: '#222A40', onAcc: '#0E1529' } },
  yellow: { light: { acc: '#8A6200', hover: '#6E4E00', soft: '#F7EDCF', onAcc: '#FFFFFF' }, dark: { acc: '#E8B931', hover: '#F2CF66', soft: '#352C14', onAcc: '#1A1400' } },
};

const isLook = (v: unknown): v is BookingLook => typeof v === 'string' && (BOOKING_LOOKS as readonly string[]).includes(v);
const isAccent = (v: unknown): v is BookingAccent => typeof v === 'string' && (BOOKING_ACCENTS as readonly string[]).includes(v);

/**
 * What the golfer pages get. The accent is null until the course saves one (or when the row
 * holds anything that isn't a preset): the golfer pages then keep using brand_color, so an
 * existing course's colour renders as it is (BOOKING-LOOK-1).
 */
export function bookingLookOf(c: { bookingLook?: unknown; bookingAccent?: unknown }): { look: BookingLook; accent: BookingAccent | null } {
  return {
    look: isLook(c.bookingLook) ? c.bookingLook : DEFAULT_BOOKING_LOOK,
    accent: isAccent(c.bookingAccent) ? c.bookingAccent : null,
  };
}

/**
 * The accent the dashboard's "What golfers see" preview draws. That preview is always a light page
 * with white text on the accent, so it takes the preset's LIGHT value whatever the look (the dark
 * values are pale, for dark text). Null = no look set yet: the booking page still uses brand_color.
 */
export function previewAccentHex(c: { bookingLook?: unknown; bookingAccent?: unknown }): string | null {
  const { accent } = bookingLookOf(c);
  return accent ? BOOKING_ACCENT_COLOURS[accent].light.acc : null;
}

/** The save body: both fields required, each from its allowlist (red and any hex refused). */
export function readBookingLook(body: unknown): { ok: true; data: { look: BookingLook; accent: BookingAccent } } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isLook(b.look)) return { ok: false, error: 'Pick Light or Dark.' };
  if (!isAccent(b.accent)) return { ok: false, error: 'Pick one of the four colours: Black, Green, Blue or Yellow.' };
  return { ok: true, data: { look: b.look, accent: b.accent } };
}

/** A promo code row as far as "is there one to type" goes. Never sent to golfers. */
export type PromoWindowRow = { active: boolean; startsOn: string | null; endsOn: string | null; maxUses: number | null; usesCount: number };

/**
 * True when at least one code could be used on a tee time from `today` to `lastDay`
 * (YYYY-MM-DD, inclusive): active, not used up, and its dates overlap that span.
 * Weekday and time-of-day limits are not checked; this only decides whether the
 * booking page shows a code box.
 */
export function hasLivePromo(codes: PromoWindowRow[], today: string, lastDay: string): boolean {
  return codes.some(c => c.active
    && (c.maxUses == null || c.usesCount < c.maxUses)
    && (!c.startsOn || c.startsOn <= lastDay)
    && (!c.endsOn || c.endsOn >= today));
}

/** The course's closed days from `today` to `lastDay` (inclusive), in date order, one per date. */
export function closedDatesIn(rows: { date: string; reason: string }[], today: string, lastDay: string): { date: string; reason: string }[] {
  const seen = new Set<string>();
  return rows
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= today && r.date <= lastDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(r => (seen.has(r.date) ? false : (seen.add(r.date), true)))
    .map(r => ({ date: r.date, reason: String(r.reason ?? '').trim().slice(0, 200) }));
}

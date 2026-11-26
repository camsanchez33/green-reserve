// Audit 2026-11-24 M11: a login with sheet.checkin could loop "send pay link" or "send receipt" (and a
// receipt goes to any number typed, with consent recorded as verbal), so every call cost Twilio money
// and sender reputation with no limit. Each send is now counted before it goes, three ways, in the
// atomic RateLimit table: per booking, per destination for this course, and per course. Printing
// sends nothing and is never capped.
import { rateLimit } from './rate-limit';

/** Sends of one kind for one booking in an hour (a golfer needs one; a resend or two is normal). */
export const SENDS_PER_BOOKING_HOUR = 5;
/** Sends from one course to one number or address in an hour (a golfer has a few bookings at most). */
export const SENDS_PER_DESTINATION_HOUR = 6;
/** Every pay-link and receipt text or email from one course in an hour. */
export const SENDS_PER_COURSE_HOUR = 150;
export const SEND_CAP_MESSAGE = 'That’s a lot of sends for now. Wait a while, or print the receipt / take payment at the counter.';

export async function golferSendAllowed(a: { courseId: string; bookingId: string; kind: 'pay_link' | 'receipt'; via: 'sms' | 'email'; to: string }): Promise<boolean> {
  const dest = a.to.trim().toLowerCase().slice(0, 200);
  // Checked in this order and all counted, so a refused send still uses up the per-booking try.
  const booking = await rateLimit(`send:${a.kind}:${a.via}:booking:${a.bookingId}`, SENDS_PER_BOOKING_HOUR, 3600);
  const destination = await rateLimit(`send:${a.via}:dest:${a.courseId}:${dest}`, SENDS_PER_DESTINATION_HOUR, 3600);
  const course = await rateLimit(`send:course:${a.courseId}`, SENDS_PER_COURSE_HOUR, 3600);
  return booking && destination && course;
}

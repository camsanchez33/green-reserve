// CAL-1 — Cal.com as the call scheduler, in place of the Google Calendar grid.
//
// Cam's calendar is a personal Outlook.com one, which the Google free/busy
// integration (lib/google-calendar.ts) cannot read. Cal.com reads Outlook,
// owns availability, reminders and its own emails; GreenReserve embeds the
// booker on /call/[token] and learns about bookings from a signed webhook, so
// the inquiry's Call row — and everything in /admin that reads it — still
// exists.
//
// Contract, read from Cal.com's source (calcom/cal.com, main, 2026-09-29):
//   - signature: X-Cal-Signature-256 = hex HMAC-SHA256(secret, raw body)
//     (packages/features/webhooks/lib/sendPayload.ts createWebhookSignature)
//   - body: { triggerEvent, createdAt, payload: { uid, startTime, endTime,
//     attendees[], responses, metadata, rescheduleUid, ... } }
//   - `metadata[key]=value` on the booking URL arrives as payload.metadata.key
//     (apps/web/modules/bookings/components/BookerWebWrapper.tsx), and a
//     reschedule carries the original booking's metadata forward
//     (handleNewBooking/createBooking.ts). A CANCEL payload has NO metadata —
//     only uid — which is why the uid is stored on the Call.
//   - manage links: {origin}/reschedule/{uid}, {origin}/booking/{uid}?cancel=true
//     (packages/lib/LinkBuilder.ts)
import { createHmac, timingSafeEqual } from 'node:crypto';

/** The public booking page, e.g. https://cal.com/cam/greenreserve-call. */
export function calcomBookingUrl(): string | null {
  const raw = process.env.CALCOM_BOOKING_URL?.trim();
  if (!raw) return null;
  try { return new URL(raw).toString().replace(/\/$/, ''); } catch { return null; }
}

/** The booker, prefilled, carrying the invite token home through the webhook. */
export function calcomEmbedUrl(base: string, p: { token: string; name: string; email: string; phone: string }): string {
  const u = new URL(base);
  u.searchParams.set('name', p.name);
  u.searchParams.set('email', p.email);
  // Cal.com validates the phone field as E.164 and skips a prefill that fails,
  // so a bare US number would silently not appear. Anything else is left out.
  const digits = p.phone.replace(/\D/g, '');
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : '';
  if (e164) u.searchParams.set('attendeePhoneNumber', e164);
  u.searchParams.set('metadata[invite]', p.token);
  u.searchParams.set('theme', 'light');
  return u.toString();
}

// No schema change for this: the Cal.com booking uid rides in Call.createdBy,
// which nothing displays. A proper column is a follow-up once previews build
// again (schema changes are verified on a preview).
const PREFIX = 'calcom:';
export const calcomCreatedBy = (uid: string) => PREFIX + uid;
export const calcomUidOf = (createdBy: string | null | undefined) =>
  createdBy && createdBy.startsWith(PREFIX) ? createdBy.slice(PREFIX.length) : null;

export function calcomManageLinks(uid: string): { reschedule: string; cancel: string } | null {
  const base = calcomBookingUrl();
  if (!base) return null;
  const origin = new URL(base).origin;
  const id = encodeURIComponent(uid);
  return { reschedule: `${origin}/reschedule/${id}`, cancel: `${origin}/booking/${id}?cancel=true` };
}

/** Constant-time check of X-Cal-Signature-256 against the raw request body. */
export function verifyCalcomSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(header.trim().toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

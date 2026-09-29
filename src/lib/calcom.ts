// CAL-1 — Cal.com as the call scheduler, in place of the Google Calendar grid.
//
// Cam's calendar is a personal Outlook.com one, which the Google free/busy
// integration (deleted in CAL-2) could not read. Cal.com reads Outlook,
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

type CalcomStatus =
  | { state: 'off' }
  | { state: 'invalid'; raw: string; reason: string }
  | { state: 'on'; url: string; webhookSecretSet: boolean };

// CAL-2: the first live setup set both env vars and the page still showed the
// old fallback — and nothing anywhere said why. A value pasted without
// https://, wrapped in quotes, or with a trailing newline used to fail
// new URL() silently and read as "not set". Now normalised, and when it
// genuinely cannot be used, /admin/system says exactly what the site saw.
function parseBookingUrl(input: string): { url: string } | { reason: string } {
  let v = input.trim().replace(/^['"`]+|['"`]+$/g, '').trim();
  if (!v) return { reason: 'the value is empty' };
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let u: URL;
  try { u = new URL(v); } catch { return { reason: 'it is not a web address' }; }
  if (!u.hostname.includes('.')) return { reason: `"${u.hostname}" is not a full domain` };
  if (u.pathname === '/' || u.pathname === '') return { reason: 'it is the Cal.com home page, not your event link (it should end in /yourname/your-event)' };
  // Seen live 2026-09-29: the WEBHOOK address was pasted here, so every course
  // was sent to our own /api/calcom/webhook (HTTP 405). This must point at
  // Cal.com, never back at this site.
  if (/(^|\.)greenreserve\.app$/i.test(u.hostname) || u.pathname.startsWith('/api/')) {
    return { reason: 'that is the webhook address (it belongs in Cal.com → Settings → Developer → Webhooks). This variable needs your Cal.com event link, e.g. https://cal.com/yourname/greenreserve-call' };
  }
  u.protocol = 'https:';
  return { url: u.toString().replace(/\/$/, '') };
}

export function calcomStatus(): CalcomStatus {
  const raw = process.env.CALCOM_BOOKING_URL;
  if (!raw || !raw.trim()) return { state: 'off' };
  const r = parseBookingUrl(raw);
  if ('reason' in r) return { state: 'invalid', raw: raw.slice(0, 200), reason: r.reason };
  return { state: 'on', url: r.url, webhookSecretSet: !!process.env.CALCOM_WEBHOOK_SECRET?.trim() };
}

/** The public booking page, e.g. https://cal.com/cam/greenreserve-call — null when off or unusable. */
export function calcomBookingUrl(): string | null {
  const s = calcomStatus();
  if (s.state === 'invalid') console.warn(`[calcom] CALCOM_BOOKING_URL is set but unusable (${s.reason}) — the call page will ask courses to reply with times`);
  return s.state === 'on' ? s.url : null;
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

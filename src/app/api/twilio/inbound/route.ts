// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC) — replies to GreenReserve's texting number.
// Register in Twilio → the number (or its Messaging Service) → "A message comes in":
// this URL, HTTP POST. Twilio signs every request with the account's auth token
// (X-Twilio-Signature over this exact URL + the form fields); anything unsigned or
// mis-signed gets 403 and changes nothing.
//
//   STOP family  → the number's consent becomes opt_out (Twilio itself also blocks
//                  further sends and sends the carrier's confirmation).
//   START family → opt_in again (method sms_reply) + the enrollment confirmation.
//   HELP / INFO  → the HELP text (lib/sms-consent-copy).
// Anything else is ignored — this number isn't a support inbox.
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { recordSmsConsent, optInByReply, lastConsentCourse } from '@/lib/sms-consent';
import { smsKeyword } from '@/lib/sms-consent-copy';
import { optInText, alertOptInText, helpText } from '@/lib/sms-copy';

const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const START = new Set(['START', 'UNSTOP', 'YES']);
const HELP = new Set(['HELP', 'INFO']);

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const twiml = (message?: string) => new NextResponse(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${xml(message)}</Message>` : ''}</Response>`,
  { status: 200, headers: { 'Content-Type': 'text/xml' } },
);

export async function POST(req: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const site = process.env.NEXT_PUBLIC_URL;
  if (!token || !site) return NextResponse.json({ error: 'Text messages are not set up' }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') params[k] = v;

  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = `${site.replace(/\/$/, '')}/api/twilio/inbound`;
  if (!signature || !twilio.validateRequest(token, signature, url, params)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const from = params.From ?? '';
  const word = smsKeyword(params.Body ?? '');
  if (STOP.has(word)) {
    await recordSmsConsent(from, 'opt_out', { method: 'sms_reply' });
    return twiml(); // Twilio's own opt-out handling sends the confirmation.
  }
  if (START.has(word)) {
    // ALERTS-2: back into only the kinds of text this number had agreed to (lib/sms-consent).
    const changed = await optInByReply(from);
    // Emails and texts redo: the replies name the course this number last agreed for (GreenReserve if none).
    const course = changed.length ? await lastConsentCourse(from) : null;
    return twiml(changed.includes('bookings') ? optInText(course?.name) : changed.includes('alerts') ? alertOptInText(course?.name) : undefined);
  }
  if (HELP.has(word)) {
    const course = await lastConsentCourse(from);
    return twiml(helpText(course?.name, course?.phone));
  }
  return twiml();
}

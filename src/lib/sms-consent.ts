// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md): the consent record.
// Every opt-in and opt-out is one SmsConsent row; the latest row for a phone decides.
// sendSms() (lib/twilio.ts) refuses a number whose latest row isn't opt_in, so a text
// can only reach someone who said yes — on a web form with an unticked box, or out
// loud to staff who then ticked "They said yes". STOP (Twilio's webhook, or Twilio
// refusing a send with 21610) records an opt-out. Server-only.
import { prisma } from './prisma';
import { normalizePhone } from './golfer-otp';
import { SMS_CONSENT_VERSION } from './sms-consent-copy';

export type ConsentMethod = 'web_booking' | 'web_event' | 'verbal' | 'sms_reply' | 'carrier';

/** A number worth recording: 10+ digits. Returns E.164, or null. */
export function consentPhone(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (s.replace(/\D/g, '').length < 10) return null;
  return normalizePhone(s);
}

/** Whether this phone's latest consent row is an opt-in. */
export async function hasSmsConsent(phone: string): Promise<boolean> {
  const p = consentPhone(phone);
  if (!p) return false;
  const last = await prisma.smsConsent.findFirst({ where: { phone: p }, orderBy: { createdAt: 'desc' }, select: { action: true } });
  return last?.action === 'opt_in';
}

/** Of these phones, the ones that have agreed (E.164). One query. */
export async function consentedPhones(phones: string[]): Promise<Set<string>> {
  const list = [...new Set(phones.map(consentPhone).filter((p): p is string => !!p))];
  if (!list.length) return new Set();
  const rows = await prisma.smsConsent.findMany({ where: { phone: { in: list } }, orderBy: { createdAt: 'asc' }, select: { phone: true, action: true } });
  const latest = new Map<string, string>();
  for (const r of rows) latest.set(r.phone, r.action);
  return new Set([...latest].filter(([, a]) => a === 'opt_in').map(([p]) => p));
}

/**
 * Record an opt-in or opt-out. Returns whether the state CHANGED (an opt-in for a number
 * already opted in records nothing and returns false), so the caller sends the enrollment
 * confirmation only on a real change. Never throws (consent is logged; the booking or
 * sale it rides on must not fail because of it) — returns false on error.
 */
export async function recordSmsConsent(raw: string, action: 'opt_in' | 'opt_out', ctx: { method: ConsentMethod; courseId?: string | null; bookingId?: string | null; recordedBy?: string }): Promise<boolean> {
  const phone = consentPhone(raw);
  if (!phone) return false;
  try {
    const last = await prisma.smsConsent.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' }, select: { action: true } });
    if (last?.action === action) return false;
    // An opt-out with nothing before it is still recorded: a STOP is a STOP.
    await prisma.smsConsent.create({ data: { phone, action, method: ctx.method, wording: SMS_CONSENT_VERSION, courseId: ctx.courseId ?? null, bookingId: ctx.bookingId ?? null, recordedBy: ctx.recordedBy ?? '' } });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sms_consent.record.fail', action, method: ctx.method, error: err instanceof Error ? err.message : String(err) }));
    return false;
  }
}

/**
 * Opt a number in and, when that's new, send the one-time enrollment confirmation
 * (Twilio requires it). Never throws: a failed confirmation is logged, the consent stands.
 */
export async function optInAndConfirm(raw: string, ctx: { method: ConsentMethod; courseId?: string | null; bookingId?: string | null; recordedBy?: string }): Promise<void> {
  const changed = await recordSmsConsent(raw, 'opt_in', ctx);
  if (!changed) return;
  const { sendSms, smsConfigured } = await import('./twilio');
  if (!smsConfigured()) return;
  const { SMS_CONFIRMATION } = await import('./sms-consent-copy');
  try { await sendSms(consentPhone(raw)!, SMS_CONFIRMATION, { kind: 'sms_consent_confirmation', courseId: ctx.courseId ?? undefined, bookingId: ctx.bookingId ?? undefined }); }
  catch (err) { console.error(JSON.stringify({ ev: 'sms_consent.confirm.fail', error: err instanceof Error ? err.message : String(err) })); }
}

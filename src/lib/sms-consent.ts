// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md): the consent record.
// Every opt-in and opt-out is one SmsConsent row; the latest row for a phone decides.
// sendSms() (lib/twilio.ts) refuses a number whose latest row isn't opt_in, so a text
// can only reach someone who said yes — on a web form with an unticked box, or out
// loud to staff who then ticked "They said yes". STOP (Twilio's webhook, or Twilio
// refusing a send with 21610) records an opt-out. Server-only.
import { prisma } from './prisma';
import { normalizePhone } from './golfer-otp';
import { SMS_CONSENT_VERSION, ALERT_SMS_CONSENT_VERSION } from './sms-consent-copy';

export type ConsentMethod = 'web_booking' | 'web_event' | 'web_alert' | 'verbal' | 'sms_reply' | 'carrier';

/**
 * ALERTS-2 (Cam 2026-11-18): what a yes covers. Booking texts and tee time alert texts are
 * agreed to separately, so a yes to one never lets the other through. Every row written
 * before this is 'bookings'. A STOP (an sms_reply or carrier opt-out, whatever its scope
 * column says) ends every scope, so it is always counted.
 */
export type SmsScope = 'bookings' | 'alerts';

/** The rows that decide a phone's consent for `scope`: its own, plus every STOP. */
function scopeWhere(scope: SmsScope) {
  return { OR: [{ scope: { in: [scope, 'all'] } }, { action: 'opt_out', method: { in: ['sms_reply', 'carrier'] } }] };
}

/** A number worth recording: 10+ digits. Returns E.164, or null. */
export function consentPhone(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (s.replace(/\D/g, '').length < 10) return null;
  return normalizePhone(s);
}

/** Whether this phone's latest consent row for `scope` is an opt-in. */
export async function hasSmsConsent(phone: string, scope: SmsScope = 'bookings'): Promise<boolean> {
  const p = consentPhone(phone);
  if (!p) return false;
  const last = await prisma.smsConsent.findFirst({ where: { phone: p, ...scopeWhere(scope) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { action: true } });
  return last?.action === 'opt_in';
}

/** Of these phones, the ones that have agreed (E.164). One query. */
export async function consentedPhones(phones: string[], scope: SmsScope = 'bookings'): Promise<Set<string>> {
  const list = [...new Set(phones.map(consentPhone).filter((p): p is string => !!p))];
  if (!list.length) return new Set();
  const rows = await prisma.smsConsent.findMany({ where: { phone: { in: list }, ...scopeWhere(scope) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { phone: true, action: true } });
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
export async function recordSmsConsent(raw: string, action: 'opt_in' | 'opt_out', ctx: { method: ConsentMethod; courseId?: string | null; bookingId?: string | null; recordedBy?: string; scope?: SmsScope; wording?: string }): Promise<boolean> {
  const phone = consentPhone(raw);
  if (!phone) return false;
  // ALERTS-2: a STOP from the phone (a reply, or the carrier) covers every scope.
  const isStop = action === 'opt_out' && (ctx.method === 'sms_reply' || ctx.method === 'carrier');
  const scope: SmsScope = ctx.scope ?? 'bookings';
  try {
    if (!isStop) {
      const last = await prisma.smsConsent.findFirst({ where: { phone, ...scopeWhere(scope) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { action: true } });
      if (last?.action === action) return false;
    } else {
      const last = await prisma.smsConsent.findFirst({ where: { phone }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { action: true, method: true } });
      if (last?.action === 'opt_out' && (last.method === 'sms_reply' || last.method === 'carrier')) return false;
    }
    // An opt-out with nothing before it is still recorded: a STOP is a STOP.
    await prisma.smsConsent.create({ data: { phone, action, method: ctx.method, wording: ctx.wording ?? SMS_CONSENT_VERSION, courseId: ctx.courseId ?? null, bookingId: ctx.bookingId ?? null, recordedBy: ctx.recordedBy ?? '', scope: isStop ? 'all' : scope } });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sms_consent.record.fail', action, method: ctx.method, error: err instanceof Error ? err.message : String(err) }));
    return false;
  }
}

/**
 * ALERTS-2: a START / UNSTOP / YES reply. It opts the number back into the kinds of text it had
 * agreed to before, and never into one it didn't. A number that only agreed to alert texts
 * replying YES must not start getting booking texts. A number with no record at all gets
 * booking texts, as before ALERTS-2. Returns the scopes that changed.
 */
export async function optInByReply(raw: string): Promise<SmsScope[]> {
  const phone = consentPhone(raw);
  if (!phone) return [];
  let scopes: SmsScope[];
  try {
    const prior = await prisma.smsConsent.findMany({ where: { phone, action: 'opt_in', scope: { in: ['bookings', 'alerts'] } }, select: { scope: true }, distinct: ['scope'] });
    scopes = prior.length ? prior.map(r => r.scope as SmsScope) : ['bookings'];
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sms_consent.reply_optin.fail', error: err instanceof Error ? err.message : String(err) }));
    return [];
  }
  const changed: SmsScope[] = [];
  for (const scope of scopes) {
    if (await recordSmsConsent(phone, 'opt_in', { method: 'sms_reply', scope, ...(scope === 'alerts' ? { wording: ALERT_SMS_CONSENT_VERSION } : {}) })) changed.push(scope);
  }
  return changed;
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
  const { optInText } = await import('./sms-copy');
  const course = await textCourse(ctx.courseId);
  try { await sendSms(consentPhone(raw)!, optInText(course?.name), { kind: 'sms_consent_confirmation', courseId: ctx.courseId ?? undefined, bookingId: ctx.bookingId ?? undefined }); }
  catch (err) { console.error(JSON.stringify({ ev: 'sms_consent.confirm.fail', error: err instanceof Error ? err.message : String(err) })); }
}

/** Emails and texts redo (Cam 2026-11-19): the course a text names — its full name and pro shop phone. Never throws. */
export async function textCourse(courseId: string | null | undefined): Promise<{ name: string; phone: string } | null> {
  if (!courseId) return null;
  try {
    const c = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, phone: true, proShopPhone: true } });
    return c ? { name: c.name, phone: (c.proShopPhone || c.phone || '').trim() } : null;
  } catch { return null; }
}

/** The course this number most recently agreed to texts for (the HELP and START replies name it). Never throws. */
export async function lastConsentCourse(raw: string): Promise<{ name: string; phone: string } | null> {
  const phone = consentPhone(raw);
  if (!phone) return null;
  try {
    const row = await prisma.smsConsent.findFirst({ where: { phone, action: 'opt_in', courseId: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { courseId: true } });
    return textCourse(row?.courseId);
  } catch { return null; }
}

// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md): the ONE wording for
// text-message consent. Client-safe (no prisma): the booking form, the event sign-up,
// the staff verbal script, the confirmation text and the HELP reply all read from here,
// and every consent row stores SMS_CONSENT_VERSION so we can show what a person agreed
// to. Change any sentence → bump the version.
import { optInText, alertOptInText, helpText } from './sms-copy';

// 2026-11-05 (Twilio campaign review): consent names GreenReserve, the registered brand, as the sender,
// says "text messages (SMS)", and uses the carriers' own disclosure phrases.
// 2026-11-24 (Cam, A2P brand): texts open with the course name since #525, so consent says texts come
// "from <Course> via GreenReserve". Agreements under 2026-11-05 stay valid (GreenReserve still sends them).
export const SMS_CONSENT_VERSION = '2026-11-24';

/** Twilio asks for a figure (Cam 2026-11-02: "up to 4 messages per booking"). */
export const SMS_FREQUENCY = 'up to 4 messages per booking';

const SITE = 'greenreserve.app';

/** The web opt-in box (booking form, event sign-up). Never pre-ticked. */
export function smsWebConsentText(courseName: string): string {
  return `I agree to receive text messages (SMS) from ${courseName || 'the course'} via GreenReserve about my booking: a pay link, a day-of notice and a receipt. ` +
    `${cap(SMS_FREQUENCY)}. Msg & data rates may apply. Reply STOP to cancel, HELP for help.`;
}

/** What staff read to a golfer before ticking "They said yes" (verbal opt-in). */
export function smsVerbalScript(courseName: string): string {
  return `“Can we send you text messages (SMS) from ${courseName || 'our course'} via GreenReserve about this booking? It’s ${SMS_FREQUENCY} — a pay link, a day-of notice and a receipt. ` +
    `Msg & data rates may apply. Reply STOP to cancel, HELP for help. The terms and privacy policy are at ${SITE}/terms and ${SITE}/privacy. Is that a yes?”`;
}

/** The enrollment confirmation with no course to name (emails and texts redo: the course's own is optInText(name)). */
export const SMS_CONFIRMATION = optInText(null);

/** The reply to HELP with no course to name (the course's own is helpText(name, phone)). */
export const SMS_HELP = helpText(null, null);

/** Shown where a text can't go because the number never agreed. */
export const SMS_NO_CONSENT = 'This number hasn’t agreed to texts yet.';

/** What staff see when a text is refused for consent: the fix, in one line. */
export const SMS_NO_CONSENT_STAFF = 'This number hasn’t agreed to texts yet — read them the text script, tick “They said yes”, and send again. Or email it.';

/** The first word of a reply, upper-cased — how carriers and Twilio read keywords (STOP, HELP…). */
export function smsKeyword(body: string): string {
  return body.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? '';
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ALERTS-2 (Cam 2026-11-18, lanes/golfer.md item 7): tee time alert texts are agreed to on
// their own, separately from booking texts. The alert sheet's "Also text me" box shows
// alertSmsConsentText() and nothing else; the alert row keeps that exact text and the time,
// and the SmsConsent row (scope 'alerts') keeps ALERT_SMS_CONSENT_VERSION. Change a word →
// bump the version.
// 2026-11-24 (Cam, A2P brand): "from <Course> via GreenReserve", as the booking box.
export const ALERT_SMS_CONSENT_VERSION = 'alerts-2026-11-24';

/** The alert sheet's text opt-in box. Never pre-ticked. */
export function alertSmsConsentText(courseName: string): string {
  return `Text me when it opens. I agree to receive text messages (SMS) from ${courseName || 'the course'} via GreenReserve about this tee time alert, ` +
    `up to 1 message per date I picked, only for this alert and separate from booking texts. Msg & data rates may apply. Reply STOP to cancel, HELP for help.`;
}

/** The alert enrollment confirmation with no course to name (the course's own is alertOptInText(name)). */
export const ALERT_SMS_CONFIRMATION = alertOptInText(null);

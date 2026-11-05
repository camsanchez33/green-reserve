// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md): the ONE wording for
// text-message consent. Client-safe (no prisma): the booking form, the event sign-up,
// the staff verbal script, the confirmation text and the HELP reply all read from here,
// and every consent row stores SMS_CONSENT_VERSION so we can show what a person agreed
// to. Change any sentence → bump the version.
import { SUPPORT_EMAIL } from './contact';

// 2026-11-05 (Twilio campaign review): consent names GreenReserve, the registered brand, as the sender,
// says "text messages (SMS)", and uses the carriers' own disclosure phrases.
export const SMS_CONSENT_VERSION = '2026-11-05';

/** Twilio asks for a figure (Cam 2026-11-02: "up to 4 messages per booking"). */
export const SMS_FREQUENCY = 'up to 4 messages per booking';

const SITE = 'greenreserve.app';

/** The web opt-in box (booking form, event sign-up). Never pre-ticked. */
export function smsWebConsentText(courseName: string): string {
  return `I agree to receive text messages (SMS) from GreenReserve about my booking at ${courseName || 'the course'}: a pay link, a day-of notice and a receipt. ` +
    `${cap(SMS_FREQUENCY)}. Msg & data rates may apply. Reply STOP to cancel, HELP for help.`;
}

/** What staff read to a golfer before ticking "They said yes" (verbal opt-in). */
export function smsVerbalScript(courseName: string): string {
  return `“Can GreenReserve send you text messages (SMS) about this booking at ${courseName || 'our course'}? It’s ${SMS_FREQUENCY} — a pay link, a day-of notice and a receipt. ` +
    `Msg & data rates may apply. Reply STOP to cancel, HELP for help. The terms and privacy policy are at ${SITE}/terms and ${SITE}/privacy. Is that a yes?”`;
}

/** The enrollment confirmation, sent once when a number opts in. */
export const SMS_CONFIRMATION =
  `GreenReserve: you're signed up for text messages about your tee time bookings, ${SMS_FREQUENCY}. Msg & data rates may apply. Reply STOP to cancel, HELP for help.`;

/** The reply to HELP. */
export const SMS_HELP =
  `GreenReserve: text messages about your tee time bookings, ${SMS_FREQUENCY}. Help: ${SUPPORT_EMAIL} or ${SITE}. Msg & data rates may apply. Reply STOP to cancel.`;

/** Shown where a text can't go because the number never agreed. */
export const SMS_NO_CONSENT = 'This number hasn’t agreed to texts yet.';

/** What staff see when a text is refused for consent: the fix, in one line. */
export const SMS_NO_CONSENT_STAFF = 'This number hasn’t agreed to texts yet — read them the text script, tick “They said yes”, and send again. Or email it.';

/** The first word of a reply, upper-cased — how carriers and Twilio read keywords (STOP, HELP…). */
export function smsKeyword(body: string): string {
  return body.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? '';
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

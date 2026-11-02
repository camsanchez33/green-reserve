// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md): the ONE wording for
// text-message consent. Client-safe (no prisma): the booking form, the event sign-up,
// the staff verbal script, the confirmation text and the HELP reply all read from here,
// and every consent row stores SMS_CONSENT_VERSION so we can show what a person agreed
// to. Change any sentence → bump the version.
import { SUPPORT_EMAIL } from './contact';

export const SMS_CONSENT_VERSION = '2026-11-02b';

/** Twilio asks for a figure (Cam 2026-11-02: "up to 4 messages per booking"). */
export const SMS_FREQUENCY = 'up to 4 messages per booking';

const SITE = 'greenreserve.app';

/** The web opt-in box (booking form, event sign-up). Never pre-ticked. */
export function smsWebConsentText(courseName: string): string {
  return `Text me about this booking at ${courseName || 'the course'}: a pay link, a day-of notice from the course and a receipt. ` +
    `${cap(SMS_FREQUENCY)}. Message and data rates may apply. Reply HELP for help, STOP to opt out.`;
}

/** What staff read to a golfer before ticking "They said yes" (verbal opt-in). */
export function smsVerbalScript(courseName: string): string {
  return `“Can we text you about this booking? It’s ${SMS_FREQUENCY} — a pay link, a day-of notice from ${courseName || 'us'} and a receipt. ` +
    `Message and data rates may apply. Reply HELP for help or STOP to stop at any time. Our terms and privacy policy are at ${SITE}/terms and ${SITE}/privacy. Is that a yes?”`;
}

/** The enrollment confirmation, sent once when a number opts in. */
export const SMS_CONFIRMATION =
  `GreenReserve: you're signed up for texts about your tee time bookings, ${SMS_FREQUENCY}. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;

/** The reply to HELP. */
export const SMS_HELP =
  `GreenReserve: texts about your tee time bookings, ${SMS_FREQUENCY}. Help: ${SUPPORT_EMAIL} or ${SITE}. Msg & data rates may apply. Reply STOP to opt out.`;

/** Shown where a text can't go because the number never agreed. */
export const SMS_NO_CONSENT = 'This number hasn’t agreed to texts yet.';

/** What staff see when a text is refused for consent: the fix, in one line. */
export const SMS_NO_CONSENT_STAFF = 'This number hasn’t agreed to texts yet — read them the text script, tick “They said yes”, and send again. Or email it.';

/** The first word of a reply, upper-cased — how carriers and Twilio read keywords (STOP, HELP…). */
export function smsKeyword(body: string): string {
  return body.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? '';
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

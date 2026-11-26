// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED", mockup
// lanes/build/emails-texts-mockup.html v17 "Texts"): the words of every text we send, in one place.
//   Every course text starts with the course's full name and ends "Reply STOP to opt out."
//   One segment each: at most 160 GSM-7 characters. A course name that would push a text past that is
//   shortened by whole words only, never mid-word (Cam 2026-11-26), and never the link or the STOP line; anything outside GSM-7 (curly quotes, dashes) is
//   replaced, because one such character makes the whole text UCS-2 and cuts it to 70 per segment.
//   Links are short links on our own domain (lib/short-links), passed in already made.
// Codes (the staff sign-in code) and the opt-in / HELP replies carry their own STOP wording.
// A2P brand (Cam 2026-11-24): the Twilio brand is GreenReserve, so the two opt-in confirmations and the
// HELP reply open "<Course> via GreenReserve: …". Only the course name is ever shortened, never the brand.
// Pure and client-safe. scripts/sms-copy-test.ts checks every text's length and segments.
import { SUPPORT_EMAIL } from './contact';

export const STOP_LINE = 'Reply STOP to opt out.';

// ---------- GSM-7 ----------

/** The GSM 03.38 basic set plus the extension table (which costs two characters each). */
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';
const isGsm = (ch: string) => GSM_BASIC.includes(ch) || GSM_EXT.includes(ch);

/** Replace what isn't GSM-7 with its plain look-alike, and drop what has none. */
export function toGsm(s: string): string {
  const swapped = String(s ?? '')
    .replace(/[‘’‚′`´]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   \t]/g, ' ')
    .replace(/[·•]/g, '-')
    .normalize('NFC');
  let out = '';
  for (const ch of swapped) {
    if (isGsm(ch)) { out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); // á → a
    if (base.length === 1 && isGsm(base)) out += base;
  }
  return out.replace(/ {2,}/g, ' ');
}

/** How a text is billed: GSM-7 160 / 153 per part, else UCS-2 70 / 67. Extension characters count twice. */
export function smsSegments(text: string): { chars: number; gsm: boolean; segments: number } {
  const gsm = [...text].every(isGsm);
  const chars = gsm ? [...text].reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0) : text.length;
  const one = gsm ? 160 : 70, part = gsm ? 153 : 67;
  return { chars, gsm, segments: chars <= one ? 1 : Math.ceil(chars / part) };
}

/**
 * Words a shortened course name never ends on ("The Old Course at" reads as a mistake): connectors and
 * stray punctuation are dropped along with the word after them.
 */
const DANGLING = new Set(['at', 'of', 'the', 'and', 'on', 'in', 'by', 'for', 'a', 'de', 'du', 'la', 'le', 'les', 'des', 'del', 'el', 'los', 'las']);
const stripEnd = (w: string) => w.replace(/[,;:&/+-]+$/, '');

/**
 * A course name shortened to whole words only (Cam 2026-11-26, SMS-WORDS): drop words from the end,
 * never cut one in half, never end on a connector or punctuation. The first word always stays, so a
 * name is never emptied; a first word too long to fit on its own (38+ characters in the opt-in) is kept
 * whole and the text is allowed past one segment (Build ruling: no real course name comes near).
 */
export function wordsThatFit(name: string, fits: (n: string) => boolean): string {
  let words = name.split(' ').filter(Boolean);
  if (fits(words.join(' '))) return words.join(' ');
  const dangles = (w: string) => { const s = stripEnd(w); return !s || DANGLING.has(s.toLowerCase()); };
  while (words.length > 1) {
    words = words.slice(0, -1);
    while (words.length > 1 && dangles(words[words.length - 1])) words = words.slice(0, -1);
    words[words.length - 1] = stripEnd(words[words.length - 1]) || words[words.length - 1];
    if (fits(words.join(' '))) break;
  }
  return words.join(' ');
}

/**
 * Build a course text that fits one segment: `make(name)` is tried with the full course name, then with
 * whole words dropped from its end (wordsThatFit). The link, the STOP line and "via GreenReserve" are
 * never cut, only the course name.
 */
function fit(courseName: string, make: (name: string) => string): string {
  const full = toGsm(courseName).trim() || 'Your course';
  const name = wordsThatFit(full, n => smsSegments(toGsm(make(n))).chars <= 160);
  return toGsm(make(name));
}

const money = (cents: number) => `$${(Math.round(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- Course texts (mockup "Texts") ----------

/** Staff texts a round's pay link. "Maple Run Golf Course pay link: $270.00 for your 11:40 AM tee time. Pay: … Reply STOP to opt out." */
export function payLinkText(courseName: string, timeLabel: string, link: string, amountCents?: number | null): string {
  return fit(courseName, n => `${n} pay link: ${amountCents != null ? `${money(amountCents)} for your ${timeLabel} tee time` : `your ${timeLabel} tee time`}. Pay: ${link} ${STOP_LINE}`);
}

/** A round's receipt. */
export function roundReceiptText(courseName: string, link: string, amountCents?: number | null): string {
  return fit(courseName, n => `${n} receipt: ${amountCents != null ? `${money(amountCents)} paid` : 'your round'}. View: ${link} ${STOP_LINE}`);
}

/**
 * The payment's label as the text reads it. The built-in labels name the player ("John Smith — entry",
 * "… — entry for 4"): the name is dropped, since the text goes to that player. A label staff typed is
 * kept as typed (never lower-cased).
 */
export function eventPayLabel(label: string): string {
  const l = toGsm(label).trim();
  const builtIn = /^.+? - (entry(?: for \d+)?)$/.exec(l);
  return builtIn ? builtIn[1] : l;
}

/** An event payment link. "Maple Run Golf Course event: Turkey Shoot Scramble entry, $45.00. Pay: …" */
export function eventPayText(courseName: string, eventName: string, label: string, totalCents: number, link: string): string {
  const make = (n: string, ev: string, lb: string) => `${n} event: ${ev}${lb ? ` ${lb}` : ''}, ${money(totalCents)}. Pay: ${link} ${STOP_LINE}`;
  const over = (n: string, ev: string, lb: string) => smsSegments(toGsm(make(n, ev, lb))).chars > 160;
  // What gives way first: a long label, then the event name, then the course name. Never the amount or the link.
  let lb = eventPayLabel(label);
  let ev = toGsm(eventName).trim();
  while (over(courseName, ev, lb) && lb.length > 12) lb = lb.slice(0, -1).trimEnd();
  while (over(courseName, ev, lb) && ev.length > 16) ev = ev.slice(0, -1).trimEnd();
  return fit(courseName, n => make(n, ev, lb));
}

/** A pro shop pay link. */
export function shopPayText(courseName: string, totalCents: number, link: string): string {
  return fit(courseName, n => `${n} pro shop: ${money(totalCents)} for your items. Pay: ${link} ${STOP_LINE}`);
}

/** A pro shop receipt. */
export function shopReceiptText(courseName: string, totalCents: number, link: string): string {
  return fit(courseName, n => `${n} pro shop receipt: ${money(totalCents)} paid. View: ${link} ${STOP_LINE}`);
}

/**
 * A note from the course to the day's golfers. The body is the course's own words, so it can be longer
 * than one text; staff see the count as they type.
 */
export function courseNoticeText(courseName: string, body: string): string {
  return toGsm(`${toGsm(courseName).trim()} update: ${String(body ?? '').trim()} ${STOP_LINE}`);
}

/** A watched tee time opened (alert-text consent only). */
export function alertText(courseName: string, dayLabel: string, timeLabel: string, players: number, link: string): string {
  return fit(courseName, n => `${n} alert: a tee time opened ${dayLabel} at ${timeLabel}, room for ${players}. Book: ${link} ${STOP_LINE}`);
}

// ---------- Opt-in, HELP and codes ----------

/**
 * Who a reply is from: "<Course> via GreenReserve", or GreenReserve alone with no course to name. The
 * course name (only) gives way to keep one segment; the brand never does.
 */
function viaBrand(courseName: string | null | undefined, rest: string): string {
  const course = toGsm(courseName ?? '').trim();
  if (!course) return toGsm(`GreenReserve${rest}`);
  return fit(course, n => `${n} via GreenReserve${rest}`);
}

// The two confirmations use Cam's shorter fixed wording (2026-11-26) so a course name keeps up to ~37
// characters whole (it was 25 with "You're set for …").

/** The one-time confirmation when a number agrees to booking texts (Twilio requires it). 144 characters with a 21-character name. */
export function optInText(courseName: string | null | undefined): string {
  return viaBrand(courseName, `: Booking texts on, up to 4 per booking. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`);
}

/** The confirmation when a number agrees to tee time alert texts. */
export function alertOptInText(courseName: string | null | undefined): string {
  return viaBrand(courseName, `: Alert texts on, 1 per date you picked. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`);
}

/** The reply to HELP. With the course the number last agreed for: its phone. 137 characters with a 21-character name. */
export function helpText(courseName: string | null | undefined, coursePhone: string | null | undefined): string {
  if (courseName && coursePhone?.trim()) return viaBrand(courseName, `: Booking texts. Questions? Call ${coursePhone.trim()}. Msg & data rates may apply. ${STOP_LINE}`);
  if (courseName?.trim()) return viaBrand(courseName, `: Booking texts. Questions? ${SUPPORT_EMAIL}. Msg & data rates may apply. ${STOP_LINE}`);
  return toGsm(`GreenReserve booking texts. Questions? ${SUPPORT_EMAIL}. Msg & data rates may apply. ${STOP_LINE}`);
}

/** The staff sign-in code (lib/twilio sendSmsOtp). */
export function staffCodeText(code: string): string {
  return `GreenReserve code: ${code}. It expires in 10 minutes. Don't share it.`;
}

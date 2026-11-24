// Emails and texts redo (Cam 2026-11-19, mockup lanes/build/emails-texts-mockup.html v17 "Texts"): every
// text we send, rendered with realistic values, must start with the course name, end with the STOP line
// (codes and replies carry their own), stay GSM-7 and fit ONE segment (160). Pure.
//   npx tsx scripts/sms-copy-test.ts
import { readFileSync } from 'fs';
import * as T from '../src/lib/sms-copy';

let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (extra !== undefined) console.log('   ', extra); } };

const C = 'Maple Run Golf Course';
const LONG = 'The Old Course at Whispering Pines Country Club'; // 47 characters
const link = (k: string) => `greenreserve.app/${k}/K7Q2XM4T8Z`;

type Sample = { name: string; text: string; course?: string; stop?: boolean };
const samples = (course: string): Sample[] => [
  { name: 'pay link (round)', text: T.payLinkText(course, '11:40 AM', link('p'), 27000), course },
  { name: 'receipt (round)', text: T.roundReceiptText(course, link('r'), 27000), course },
  { name: 'receipt (round, no amount)', text: T.roundReceiptText(course, link('r')), course },
  { name: 'event pay link', text: T.eventPayText(course, 'Turkey Shoot Scramble', 'Entry fee', 4500, link('p')), course },
  { name: 'event pay link (built-in "<player> — entry")', text: T.eventPayText(course, 'Turkey Shoot Scramble', 'John Smith — entry', 4500, link('p')), course },
  { name: 'event pay link (built-in "— entry for 4")', text: T.eventPayText(course, 'Turkey Shoot Scramble', 'John Smith — entry for 4', 18000, link('p')), course },
  { name: 'event pay link (balance)', text: T.eventPayText(course, 'Member-Guest Invitational', 'Balance for 144 players', 648000, link('p')), course },
  { name: 'event pay link (80-character typed label)', text: T.eventPayText(course, 'Member-Guest Invitational', 'Deposit to hold the shotgun start for your outing, payable before the end of May', 50000, link('p')), course },
  { name: 'pro shop pay link', text: T.shopPayText(course, 3850, link('p')), course },
  { name: 'pro shop receipt', text: T.shopReceiptText(course, 3850, link('r')), course },
  { name: 'note from the course', text: T.courseNoticeText(course, 'Frost delay. First tee times move back 30 min.'), course },
  { name: 'tee time alert', text: T.alertText(course, 'Sat Nov 21', '2:40 PM', 4, link('a')), course },
  { name: 'texts confirmed (bookings)', text: T.optInText(course), course, stop: false },
  { name: 'texts confirmed (alerts)', text: T.alertOptInText(course), course, stop: false },
  { name: 'HELP reply', text: T.helpText(course, '(555) 010-2000'), course },
];

for (const [label, course] of [['usual name', C], ['47-character name', LONG]] as const) {
  for (const s of samples(course)) {
    const k = T.smsSegments(s.text);
    const problems: string[] = [];
    if (!k.gsm) problems.push('not GSM-7');
    if (k.segments !== 1) problems.push(`${k.chars} chars = ${k.segments} segments`);
    if (!s.text.startsWith(course.slice(0, 12))) problems.push('does not start with the course name');
    if (s.stop !== false && !s.text.endsWith(T.STOP_LINE)) problems.push('no STOP line at the end');
    if (s.stop === false && !/Reply HELP for help, STOP to opt out\.$/.test(s.text)) problems.push('opt-in wording');
    if (/greenreserve\.app\/[bpra]\//.test(s.text) === false && /link|Pay:|View:|Book:/.test(s.text)) problems.push('no short link');
    check(`${label}: ${s.name} (${k.chars} chars)`, problems.length === 0, `${problems.join('; ')} — ${s.text}`);
  }
}

// The exact samples Cam approved (mockup), character for character.
// A2P brand (Cam 2026-11-24): the two confirmations and HELP say "<Course> via GreenReserve: …".
check('opt-in wording, course via GreenReserve (156 characters)', T.optInText(C) === "Maple Run Golf Course via GreenReserve: You're set for booking texts, up to 4 per booking. Msg & data rates may apply. Reply HELP for help, STOP to opt out." && T.optInText(C).length === 156, T.optInText(C).length);
check('alert opt-in wording, course via GreenReserve (156 characters)', T.alertOptInText(C) === "Maple Run Golf Course via GreenReserve: You're set for alert texts, 1 per date you picked. Msg & data rates may apply. Reply HELP for help, STOP to opt out." && T.alertOptInText(C).length === 156, T.alertOptInText(C).length);
check('HELP wording, course via GreenReserve (137 characters)', T.helpText(C, '(555) 010-2000') === 'Maple Run Golf Course via GreenReserve: Booking texts. Questions? Call (555) 010-2000. Msg & data rates may apply. Reply STOP to opt out.' && T.helpText(C, '(555) 010-2000').length === 137, T.helpText(C, '(555) 010-2000').length);
for (const [nm, t] of [['opt-in', T.optInText(LONG)], ['alert opt-in', T.alertOptInText(LONG)], ['HELP', T.helpText(LONG, '(555) 010-2000')]] as const)
  check(`47-character name: ${nm} keeps "via GreenReserve:" whole and only the course name gives way (${t.length} chars)`, t.length <= 160 && t.includes(' via GreenReserve: ') && LONG.startsWith(t.slice(0, t.indexOf(' via GreenReserve: '))), t);
check('everyday texts are unchanged: no "via GreenReserve"', samples(C).filter(s => s.stop !== false && s.name !== 'HELP reply').every(s => !s.text.includes('via GreenReserve')));
check('pay link as the mockup', T.payLinkText(C, '11:40 AM', link('p'), 27000) === `Maple Run Golf Course pay link: $270.00 for your 11:40 AM tee time. Pay: ${link('p')} Reply STOP to opt out.`);
check('alert as the mockup', T.alertText(C, 'Sat Nov 21', '2:40 PM', 4, link('a')) === `Maple Run Golf Course alert: a tee time opened Sat Nov 21 at 2:40 PM, room for 4. Book: ${link('a')} Reply STOP to opt out.`);
check('event: the built-in label drops the player name and keeps case (mockup "Turkey Shoot Scramble entry, $45.00")', T.eventPayText(C, 'Turkey Shoot Scramble', 'John Smith — entry', 4500, link('p')) === `Maple Run Golf Course event: Turkey Shoot Scramble entry, $45.00. Pay: ${link('p')} Reply STOP to opt out.`);
check('event: a label staff typed keeps its case', T.eventPayText(C, 'Turkey Shoot', 'Balance for 144 players', 648000, link('p')).includes('Turkey Shoot Balance for 144 players, $6,480.00.'));
check('event: a long label gives way before the course name', T.eventPayText(C, 'Member-Guest Invitational', 'x'.repeat(80), 50000, link('p')).startsWith(`${C} event: Member-Guest Invitational`));
check('opt-ins keep a 25-character course name whole', T.alertOptInText('Whispering Pines Golf Clb').startsWith('Whispering Pines Golf Clb via GreenReserve: ') && T.optInText('Whispering Pines Golf Clb').startsWith('Whispering Pines Golf Clb via GreenReserve: '));
check('staff code as the mockup', T.staffCodeText('482915') === "GreenReserve code: 482915. It expires in 10 minutes. Don't share it." && T.smsSegments(T.staffCodeText('482915')).segments === 1);
check('no course to name: GreenReserve and the support address', T.helpText(null, null).startsWith('GreenReserve booking texts. Questions? support@greenreserve.app.') && T.optInText(null).startsWith("GreenReserve: You're set") && !T.optInText(null).includes('via') && !T.helpText(null, null).includes('via'));

// GSM-7: one curly quote would make the whole text UCS-2 (70 a segment).
const curly = T.payLinkText('O’Brien’s Links – North', '9:00 AM', link('p'), 5000);
check('curly quotes and dashes become plain, so the text stays GSM-7', T.smsSegments(curly).gsm && curly.startsWith("O'Brien's Links - North pay link"), curly);
check('accents in GSM-7 stay (é), others fold (ā → a)', T.toGsm('Café Pāua') === 'Café Paua');
check('segments: 160 is one, 161 is two (153 each), UCS-2 is 70', T.smsSegments('a'.repeat(160)).segments === 1 && T.smsSegments('a'.repeat(161)).segments === 2 && T.smsSegments('€'.repeat(80)).chars === 160 && T.smsSegments('✓'.repeat(71)).segments === 2);
check('a long course name gives way; the link and STOP line never do', (() => { const t = T.payLinkText('X'.repeat(120), '11:40 AM', link('p'), 27000); return t.length <= 160 && t.includes(link('p')) && t.endsWith(T.STOP_LINE); })());

// Every text is built here, and every course text goes out through sendSms (lib/twilio, consent-checked).
const read = (f: string) => readFileSync(f, 'utf8');
const senders = ['src/app/api/operator/bookings/route.ts', 'src/app/api/operator/shop-sales/route.ts', 'src/app/api/operator/events/[id]/payments/route.ts', 'src/lib/tee-time-alerts.ts', 'src/lib/golfer-messages.ts', 'src/lib/sms-consent.ts'];
check('no text is written inline any more ("GreenReserve: …" bodies are gone)', senders.every(f => !/sendSms\([^,]+,\s*`GreenReserve/.test(read(f))));
check('texts with a link use a short link on our domain', ['src/app/api/operator/bookings/route.ts', 'src/app/api/operator/shop-sales/route.ts', 'src/app/api/operator/events/[id]/payments/route.ts', 'src/lib/tee-time-alerts.ts'].every(f => read(f).includes('await shortLink(')));
check('the staff code text comes from sms-copy', read('src/lib/twilio.ts').includes('body: staffCodeText(code),'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed) process.exit(1);

// MSG-2 (Cam 2026-11-06, Message golfers: "do they want to send emails or text messages or how … should we
// have a little ai thing there to help them craft something"): Email · Text · Both, ready-made messages,
// "Help me write it", the exact email and text the golfer gets, and who it won't reach (to call).
// Pins the reach maths per channel, that a phone number only reaches logins with sheet.golfer_contact,
// that the preview sends nothing, that the assistant can't add a number, and that its route is gated.
// Run: npx tsx scripts/message-golfers-test.ts
import { readFileSync } from 'fs';
import { reach, toCall, noticeText, isVia, type Recipient } from '../src/lib/golfer-messages';
import { addedNumbers } from '../src/lib/notice-draft';
import { READY, BLANK } from '../src/lib/notice-templates';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const r = (name: string, email: string | null, phone: string | null): Recipient => ({ name, email, phone, teeTime: '08:00' });
const list = [r('A', 'a@x.com', '5185550001'), r('B', 'b@x.com', null), r('C', null, '5185550003'), r('D', null, null)];
const e = reach(list, true, 'email'), t = reach(list, true, 'text'), b = reach(list, true, 'both');
ok('email: 2 by email, 0 by text, 2 to call', e.email === 2 && e.sms === 0 && e.unreachable === 2);
ok('text: 0 by email, 2 by text (agreed numbers only), 2 to call', t.email === 0 && t.sms === 2 && t.unreachable === 2);
ok('both: 2 + 2, only the golfer with neither to call', b.email === 2 && b.sms === 2 && b.unreachable === 1);
ok('texting off: text reaches nobody', reach(list, false, 'text').sms === 0 && reach(list, false, 'text').unreachable === 4);
ok('who to call is exactly who it misses', toCall(list, true, 'email').map(x => x.name).join() === 'C,D' && toCall(list, true, 'both').map(x => x.name).join() === 'D');
ok('the text always carries the STOP line', noticeText('Pines', 'Hi').endsWith('Reply STOP to opt out.') && noticeText('Pines', 'Hi').startsWith('GreenReserve (Pines): '));
ok('via is only email, text or both', isVia('email') && isVia('both') && !isVia('sms') && !isVia(undefined));

ok('the assistant may not add a number', addedNumbers('First tee is now 9:30.', 'first tee now 9:00').length > 0 && addedNumbers('The first tee is now 9:00.', 'frost, first tee 9:00').length === 0);
ok('every ready-made blank blocks Send until filled', READY.some(m => BLANK.test(m.body)) && !BLANK.test('First tee is now 9:00.'));
ok('no ready-made message promises what only an action does', READY.every(m => !/no fee|refund|cancelled with/i.test(m.body)));

const route = read('src/app/api/operator/golfer-messages/route.ts');
const draft = read('src/app/api/operator/golfer-messages/draft/route.ts');
const modal = read('src/components/dashboard/GolferMessageModal.tsx');
ok('a phone number to call only with sheet.golfer_contact', route.includes("const contact = can(session, 'sheet.golfer_contact');") && route.includes('...(contact && r.rawPhone ? { phone: r.rawPhone } : {})'));
ok('the preview returns the real email and text and sends nothing', (() => { const p = route.slice(route.indexOf('if (b.preview === true)'), route.indexOf("if (body.length < 3)")); return p.includes('courseNoticeEmail(') && p.includes('noticeText(') && !p.includes('sendCourseMessage') && !p.includes('rateLimit'); })());
ok('the old sms flag still means email + text (course alert)', route.includes("o.sms === true ? 'both' : 'email'"));
ok('text-only is refused while texting is off', route.includes("if (via === 'text' && !texting)"));
ok('text only sends no email', route.includes("email: via !== 'text'") && read('src/lib/golfer-messages.ts').includes('if (doEmail && r.email)'));
ok('the email the golfer gets is one function, used to send and to preview', read('src/lib/email.ts').includes('export function courseNoticeEmail(') && read('src/lib/email.ts').includes('const { subject, html } = courseNoticeEmail(data);'));
ok('the draft route: same permission, kill switch, 20 an hour, refuses an added number', draft.includes("requirePermission(session, 'sheet.message_golfers')") && draft.includes('if (!birdieEnabled())') && draft.includes('`birdie:msg-draft:${session.courseId}`, 20, 3600') && read('src/lib/notice-draft.ts').includes('if (addedNumbers(text, typed).length) return { ok: false'));
ok('the window: who, how, start from, help, what they get, to call', modal.includes("aria-label=\"How\"") && modal.includes('READY.map') && modal.includes('Help me write it') && modal.includes('What they get') && modal.includes('sandbox=""') && modal.includes('to call</p>'));
ok('Send says exactly who and how', modal.includes('`Send to ${reachable} golfer${reachable === 1 ? \'\' : \'s\'} ${channelWord}`'));

ok('review: the draft is refused when too long, never cut (a cut can make a new time)', read('src/lib/notice-draft.ts').includes('if (text.length > opts.maxChars) return { ok: false') && !read('src/lib/notice-draft.ts').includes('text.slice(0, opts.maxChars)'));
ok('review: a failed preview says so', modal.includes("setPreviewErr(r.error || 'Couldn’t show what they get.')"));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

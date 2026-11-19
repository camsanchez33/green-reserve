// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED"; mockup
// lanes/build/emails-texts-mockup.html v17): renders every golfer email through the one Letter layout
// and checks what the approved mockup says each one must (and must not) say. Pure: no database, no send.
//   npx tsx scripts/emails-golfer-test.ts
import { readFileSync } from 'fs';
import { letterEmail, courseFrom, esc, textOn, emailDate, emailTime, safeUrl } from '../src/lib/email-layout';
import * as G from '../src/lib/email-golfer';

process.env.NEXT_PUBLIC_URL = 'https://greenreserve.app';
let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (extra !== undefined) console.log('   ', typeof extra === 'string' ? extra.slice(0, 600) : extra); } };

const course = { name: 'Maple Run Golf Course', address: '412 Orchard Lane, Millbrook, NY 12545', phone: '(555) 010-2000', accent: '#1E6B45', onAccent: '#FFFFFF' };
const sat = '2026-11-21';

// ---------- The layout ----------
{
  const e = letterEmail({ from: 'course', course, line: 'You’re booked at Maple Run Golf Course.', rows: [{ label: 'Date', value: 'Sat, Nov 21' }, { label: 'Price', value: '$270.00' }], button: { label: 'See booking details', url: 'https://greenreserve.app/receipt/b1?token=t' }, small: { label: 'Change or cancel booking', url: 'https://greenreserve.app/manage/b1?token=t' } });
  check('course email: the course name at the top, under the thin bar in the course colour', e.html.includes('>Maple Run Golf Course</div>') && e.html.includes('width:36px;height:3px;background:#1E6B45'));
  check('course email: the button carries a text arrow and the course colour', e.html.includes('See booking details&nbsp;&rarr;') && e.html.includes('background:#1E6B45;border-radius:7px'));
  check('course email: footer is name, address, phone, then Powered by + the logo with alt text', /Maple Run Golf Course<\/span><br>412 Orchard Lane, Millbrook, NY 12545<br>\(555\) 010-2000<br>Powered by&nbsp;<img src="https:\/\/greenreserve\.app\/brand\/email-logo-3x\.png" alt="GreenReserve" width="86" height="16"/.test(e.html), e.html.slice(-900));
  check('course email: no "Questions?" line, no Privacy/Terms', !/Questions\?|Privacy|Terms/.test(e.html + e.text));
  check('plain text has the line, the rows, both links and the footer', e.text.startsWith('You’re booked at Maple Run Golf Course.\n') && e.text.includes('Price: $270.00') && e.text.includes('See booking details: https://greenreserve.app/receipt/b1?token=t') && e.text.includes('Change or cancel booking: https://greenreserve.app/manage/b1?token=t') && e.text.includes('\n--\nMaple Run Golf Course\n412 Orchard Lane, Millbrook, NY 12545\n(555) 010-2000\nPowered by GreenReserve'), e.text);
  const gr = letterEmail({ from: 'greenreserve', line: 'Your October review from GreenReserve is ready.', button: { label: 'Open your review', url: 'https://greenreserve.app/dashboard' }, topBar: false });
  check('GreenReserve email: logo at the top (~26px), footer just greenreserve.app', gr.html.includes('alt="GreenReserve" width="139" height="26"') && gr.html.includes('>greenreserve.app</p>') && !gr.html.includes('Powered by'));
  check('…and the monthly review has no thin bar', !gr.html.includes('width:36px;height:3px'));
  const x = letterEmail({ from: 'course', course: { name: '<script>alert(1)</script> GC' }, line: 'A "quoted" <b>line</b>', paragraphs: ['Line one\nline two'], button: { label: 'Go', url: 'javascript:alert(1)' } });
  check('every string is escaped (course name, line)', !x.html.includes('<script>') && x.html.includes('&lt;script&gt;') && x.html.includes('A &quot;quoted&quot; &lt;b&gt;line&lt;/b&gt;'));
  check('line breaks in paragraphs are kept', x.html.includes('Line one<br>line two'));
  check('a link that is not http(s) or mailto becomes #', x.html.includes('href="#"') && safeUrl('JaVaScRiPt:x') === '#' && safeUrl('mailto:a@b.c') === 'mailto:a@b.c');
  check('From: the course\'s full name at noreply@, header-safe', courseFrom('Maple Run Golf Course', 'noreply@greenreserve.app') === '"Maple Run Golf Course" <noreply@greenreserve.app>' && courseFrom('Bad "Name" <x@y>\r\nBcc: z', 'noreply@greenreserve.app') === '"Bad Name x@y Bcc: z" <noreply@greenreserve.app>', courseFrom('Bad "Name" <x@y>\r\nBcc: z', 'noreply@greenreserve.app'));
  check('button text reads on the accent (white on dark, ink on yellow)', textOn('#1E6B45') === '#FFFFFF' && textOn('#E3B640') !== '#FFFFFF');
  check('tee dates and times are written for people', emailDate(sat) === 'Sat, Nov 21' && emailTime('14:05') === '2:05 PM' && emailTime('09:00') === '9:00 AM' && emailDate('Today') === 'Today');
  check('esc covers & < > " \'', esc(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;');
  check('From name: every control character is taken out', courseFrom('A\u0000B\u001bC\u007f', 'n@x') === '"A B C" <n@x>', courseFrom('A\u0000B\u001bC\u007f', 'n@x'));
  const m = letterEmail({ from: 'course', course, line: 'x', rows: [{ label: 'Paid', value: '$1.00' }, { label: 'Paid with', value: 'Visa' }, { label: 'Due by', value: 'May 1' }, { label: 'Charged to your card', value: 'May 2' }] });
  check('money rows are larger; "Paid with", "Due by", "Charged to your card" are not', m.html.includes('font:600 18px/1.4') && (m.html.match(/font:600 18px\/1\.4/g) ?? []).length === 1);
  const noTok = G.cancellationFeeChargedEmail({ courseName: course.name, date: sat, time: '11:40', feeAmount: 2500, bookingId: 'b1' }, course);
  check('the hold email only says "the button below" when there is a button', !noTok.html.includes('button below') && !noTok.html.includes('&rarr;</a>'));
  check('the Message golfers preview passes the course footer, as the send does', readFileSync('src/app/api/operator/golfer-messages/route.ts', 'utf8').includes('courseNoticeEmail({ courseName, dateLabel: formatTeeDay(w.date), teeTime, body: body || \'…\', course: footer })'));
}

// ---------- Every golfer email ----------
type Case = { name: string; e: G.BuiltEmail; line: string; must?: string[]; mustNot?: string[]; button?: string };
const tok = 'tok123';
const cases: Case[] = [
  { name: 'booking confirmation', e: G.bookingConfirmationEmail({ courseName: course.name, courseSlug: 'maple-run', date: sat, time: '11:40', players: 4, holes: 18, totalAmount: 27000, bookingId: 'b1', checkInToken: tok }, course),
    line: 'You’re booked at Maple Run Golf Course.', button: 'See booking details', must: ['Booked: Sat, Nov 21 at 11:40 AM – Maple Run Golf Course', '>Sat, Nov 21<', '>11:40 AM<', '>$270.00<', 'Change or cancel booking', '/receipt/b1?token=tok123', '/manage/b1?token=tok123', 'Arrive 15 minutes early and check in at the pro shop.'], mustNot: ['Cancellation policy', 'cancel at least'] },
  { name: 'booking confirmation keeps the course’s own words', e: G.bookingConfirmationEmail({ courseName: course.name, date: sat, time: '11:40', players: 2, holes: 9, totalAmount: 9000, bookingId: 'b1', checkInToken: tok, parts: { arrival: 'Park by the barn.', dressCode: 'Collared shirts', parking: '', note: '', contact: '' } }, course),
    line: 'You’re booked at Maple Run Golf Course.', must: ['<strong style="color:#151A16">Arrival.</strong> Park by the barn.', 'Dress code.</strong> Collared shirts'], mustNot: ['Arrive 15 minutes early'] },
  { name: 'booking confirmation test send', e: G.bookingConfirmationEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, holes: 18, totalAmount: 27000, bookingId: '', testSend: true }, course),
    line: 'You’re booked at Maple Run Golf Course.', must: ['Test: Booked:', 'Test email: this is what golfers get. Nothing was booked.'], mustNot: ['Change or cancel booking'] },
  { name: 'booking changed', e: G.bookingModifiedEmail({ courseName: course.name, date: sat, time: '12:10', players: 3, holes: 18, totalAmount: 20000, shopTotalCents: 1000, bookingId: 'b1', checkInToken: tok }, course),
    line: 'Your booking at Maple Run Golf Course changed.', button: 'See booking details', must: ['>$210.00<', 'Change or cancel booking', '>12:10 PM<'] },
  { name: 'booking changed after check-in reads as paid', e: G.bookingModifiedEmail({ courseName: course.name, date: sat, time: '12:10', players: 3, holes: 18, totalAmount: 20000, bookingId: 'b1', checkInToken: tok, checkedIn: true }, course),
    line: 'Your booking at Maple Run Golf Course changed.', must: ['>Paid<'], mustNot: ['Change or cancel booking'] },
  { name: 'reminder (day before)', e: G.reminderEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, holes: 18, bookingId: 'b1', checkInToken: tok, totalCents: 27000 }, course),
    line: 'Your tee time is tomorrow at 11:40 AM.', button: 'See booking details', must: ['Tomorrow: 11:40 AM at Maple Run Golf Course', '>$270.00<', 'Change or cancel booking'] },
  { name: 'free cancel window closing', e: G.cancellationWarningEmail({ courseName: course.name, date: sat, time: '11:40', feeAmount: 1000, bookingId: 'b1', cancellationHours: 24, checkInToken: tok, lateFeeTiming: 'late_cancel' }, course),
    line: 'Free cancellation ends within the hour.', button: 'Change or cancel booking', must: ['Cancel once the window closes and a $10 late-cancellation fee is charged to your card.'] },
  { name: 'cancelled (free)', e: G.cancellationEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, bookingId: 'b1', feeCharged: false, feeAmount: 0 }, course),
    line: 'Your 11:40 AM tee time is cancelled.', must: ['You weren’t charged anything.', 'Cancelled: Sat, Nov 21 at 11:40 AM'] },
  { name: 'cancelled (refunded)', e: G.cancellationEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, bookingId: 'b1', feeCharged: false, feeAmount: 0, refunded: true, reason: 'The course is closed for frost.' }, course),
    line: 'Your 11:40 AM tee time is cancelled.', must: ['What you paid has been refunded to your card.', 'The course is closed for frost.'] },
  { name: 'cancelled (fee kept)', e: G.cancellationEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, bookingId: 'b1', feeCharged: true, feeAmount: 2500 }, course),
    line: 'Your 11:40 AM tee time is cancelled.', must: ['The $25.00 cancellation fee you were charged is non-refundable'] },
  { name: 'late-cancel hold charged', e: G.cancellationFeeChargedEmail({ courseName: course.name, date: sat, time: '11:40', feeAmount: 2500, bookingId: 'b1', checkInToken: tok }, course),
    line: 'Your card was charged $25.00 to hold your tee time.', button: 'Pay', must: ['use the button below on the day of your round', '/checkin/b1?token=tok123'] },
  { name: 'pay link (check-in is open)', e: G.payLinkEmail({ courseName: course.name, date: sat, time: '11:40', bookingId: 'b1', checkInToken: tok, players: 4, totalCents: 27000 }, course),
    line: 'Time to check in for your round at Maple Run Golf Course.', button: 'Pay', must: ['Pay for your 11:40 AM tee time – Maple Run Golf Course', '>$270.00<', 'Change or cancel booking', '/checkin/b1?token=tok123'] },
  { name: 'frost delay', e: G.frostDelayEmail({ courseName: course.name, date: sat, oldTime: '08:00', newTime: '08:30', players: 2, bookingId: 'b1', checkInToken: tok }, course),
    line: 'Frost delay: your tee time moved to 8:30 AM.', button: 'See booking details', must: ['>8:00 AM<', 'Your price hasn’t changed.'] },
  { name: 'note from the course', e: G.courseNoticeEmail({ courseName: course.name, dateLabel: 'Sat, Nov 21', teeTime: '11:40 AM', body: 'Carts are path only today.\nThanks!', course }),
    line: 'A note about your 11:40 AM tee time.', must: ['Carts are path only today.<br>Thanks!', 'Maple Run Golf Course: about your 11:40 AM tee time'] },
  { name: 'receipt link', e: G.roundReceiptLinkEmail({ courseName: course.name, date: sat, time: '11:40', bookingId: 'b1', checkInToken: tok }, course),
    line: 'Thanks for playing Maple Run Golf Course.', button: 'View receipt', must: ['/receipt/b1?token=tok123'] },
  { name: 'receipt (paid at check-in)', e: G.checkInReceiptEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, greenFeeTotal: 20800, cartFeeTotal: 4400, rangeBallsTotal: 1200, accessFeeTotal: 600, totalAmount: 27000, feeRefunded: true, feeRefundAmount: 1000, bookingId: 'b1', checkInToken: tok }, course),
    line: 'You paid $270.00 at Maple Run Golf Course.', button: 'View receipt', must: ['Receipt: $270.00 – Maple Run Golf Course', '>Paid<', 'The $10.00 late-cancellation fee charged earlier has been refunded.'], mustNot: ['Green fee'] },
  { name: 'receipt with no receipt page itemises (fee wording from booking-fees)', e: G.checkInReceiptEmail({ courseName: course.name, date: sat, time: '11:40', players: 4, greenFeeTotal: 20800, cartFeeTotal: 4400, rangeBallsTotal: 0, accessFeeTotal: 600, totalAmount: 25800, feeRefunded: false, feeRefundAmount: 0, bookingId: 'b1' }, course),
    line: 'You paid $258.00 at Maple Run Golf Course.', must: ['Green fee', 'GreenReserve service fee ($1.50 × 4)'] },
  { name: 'refund', e: G.refundEmail({ courseName: course.name, date: sat, time: '11:40', amountCents: 5200, full: false, reason: 'One player left early.', bookingId: 'b1' }, course),
    line: '$52.00 is on its way back to your card.', must: ['One player left early.', 'Refund (partial)', 'Refund: $52.00 – Maple Run Golf Course'] },
  { name: 'tee time alert', e: G.teeTimeAlertEmail({ courseName: course.name, courseSlug: 'maple-run', date: sat, time: '14:40', players: 4 }, course, 'https://greenreserve.app/api/alerts/stop/s1'),
    line: 'A tee time just opened at Maple Run Golf Course.', button: 'Book this time', must: ['A tee time opened: Sat, Nov 21 at 2:40 PM', 'It isn’t held for you. First come, first served.', 'Stop this alert', '/api/alerts/stop/s1', '/courses/maple-run?date=2026-11-21&amp;players=4'] },
  { name: 'alert confirm', e: G.alertConfirmEmail({ courseName: course.name, dates: [sat], players: 2, phone: '+15550102000' }, course, 'https://greenreserve.app/api/alerts/confirm/c1', 'https://greenreserve.app/api/alerts/stop/c1'),
    line: 'Turn on your tee time alert.', button: 'Turn on alert', must: ['number ending 2000', 'Stop this alert'] },
  { name: 'member invite (Members pricing on)', e: G.memberInviteEmail({ name: 'Sam', courseName: course.name, groupName: 'Full Member', coursePageUrl: 'https://greenreserve.app/courses/maple-run', benefits: '$6 off every round', memberPricing: true }, course),
    line: 'Maple Run Golf Course set you up as a Full Member.', button: 'Log in to Maple Run Golf Course', must: ['to get your rates: $6 off every round.'] },
  { name: 'member invite (Members pricing off promises no rate)', e: G.memberInviteEmail({ name: 'Sam', courseName: course.name, groupName: 'Resident', coursePageUrl: 'https://greenreserve.app/courses/maple-run', benefits: 'book 9 days out', memberPricing: false }, course),
    line: 'Maple Run Golf Course set you up as a Resident.', must: ['to book. You can book 9 days out.'], mustNot: ['rates'] },
  { name: 'member log-in link', e: G.memberMagicLinkEmail({ courseName: course.name, magicLink: 'https://greenreserve.app/api/member/maple-run/verify?token=x' }, course),
    line: 'Log in to Maple Run Golf Course.', button: 'Log in', must: ['This link works for 15 minutes.'] },
  { name: 'member log-in code', e: G.memberLoginCodeEmail({ courseName: course.name, code: '482915' }, course),
    line: 'Your log-in code', must: ['Your Maple Run Golf Course log-in code: 482 915', '>482 915<', 'It works for 10 minutes.'] },
  { name: 'dues pay link (fee from LQ-2: 1% of dues)', e: G.duesPayLinkEmail({ courseName: course.name, tierName: 'Full', annualFee: 1200, initiationFee: 0, payLink: 'https://greenreserve.app/membership/m1?token=t' }, course),
    line: 'Maple Run Golf Course set you up as a Full member.', button: 'Pay $1,212.00', must: ['GreenReserve service fee (1% of dues)', '>$12.00<'] },
  { name: 'dues renewal', e: G.duesPayLinkEmail({ courseName: course.name, tierName: 'Full', annualFee: 1200, initiationFee: 100, payLink: 'https://greenreserve.app/m', isRenewal: true }, course),
    line: 'Time to renew your Full membership.', must: ['One-time initiation fee', 'Renew your membership – Maple Run Golf Course'] },
  { name: 'dues receipt', e: G.duesReceiptEmail({ courseName: course.name, tierName: 'Full', amountPaid: 1212, serviceFee: 12, expiresAt: new Date('2027-03-31T12:00:00Z') }, course),
    line: 'You paid $1,212.00 to Maple Run Golf Course.', must: ['Active through', 'March 31, 2027', 'GreenReserve service fee (1% of dues)'] },
  { name: 'auto-renew on', e: G.autoRenewOnEmail({ courseName: course.name, tierName: 'Full', terms: 'Renews each year at $1,212.00 until you turn it off.', renewsOn: new Date('2027-03-31T12:00:00Z'), totalCents: 121200, manageLink: 'https://greenreserve.app/m' }, course),
    line: 'Your membership will renew automatically.', button: 'Manage automatic renewal', must: ['The terms you agreed to.</strong> Renews each year'] },
  { name: 'renews soon', e: G.autoRenewReminderEmail({ courseName: course.name, tierName: 'Full', renewsOn: new Date('2027-03-31T12:00:00Z'), totalCents: 121200, manageLink: 'https://greenreserve.app/m' }, course),
    line: 'Your membership renews on March 31, 2027.', button: 'Turn off automatic renewal' },
  { name: 'renewal declined', e: G.autoRenewDeclinedEmail({ courseName: course.name, tierName: 'Full', totalCents: 121200, payLink: 'https://greenreserve.app/m', retryOn: null }, course),
    line: 'Your membership renewal didn’t go through.', button: 'Pay $1,212.00' },
  { name: 'auto-renew off', e: G.autoRenewOffEmail({ courseName: course.name, tierName: 'Full', endsOn: new Date('2027-03-31T12:00:00Z') }, course),
    line: 'Automatic renewal is off.', must: ['runs through March 31, 2027'] },
  { name: 'monthly statement', e: G.statementEmail({ courseName: course.name, period: '2026-10', totalCents: 8400, lineCount: 3, dueAt: new Date('2026-11-30T12:00:00Z'), chargeOn: null, payLink: 'https://greenreserve.app/statement/s1' }, course),
    line: 'Your October 2026 statement is ready.', button: 'Pay $84.00', must: ['Due by'] },
  { name: 'statement declined', e: G.statementDeclinedEmail({ courseName: course.name, period: '2026-10', totalCents: 8400, dueAt: new Date('2026-11-30T12:00:00Z'), retryOn: null, payLink: 'https://greenreserve.app/statement/s1' }, course),
    line: 'Your statement payment didn’t go through.', button: 'Pay $84.00' },
  { name: 'statement paid', e: G.statementPaidEmail({ courseName: course.name, period: '2026-10', amountCents: 8400, cardSaved: true, link: 'https://greenreserve.app/statement/s1' }, course),
    line: 'You paid $84.00 for your October 2026 statement.', button: 'See the statement' },
  { name: 'event sign-up (waitlist)', e: G.eventSignupEmail({ variant: 'waitlist', name: 'Sam', players: ['Sam', 'Lee'], courseName: course.name, eventName: 'Turkey Shoot', dateLabel: 'Sat, Nov 28', startLabel: '9:00 AM shotgun', paidCents: 0, terms: 'No refunds.' }, course),
    line: 'You’re on the waiting list.', must: ['Nothing has been charged.', 'Sam<br>Lee'], mustNot: ['No refunds.'] },
  { name: 'event sign-up (paid)', e: G.eventSignupEmail({ variant: 'paid', name: 'Sam', players: ['Sam'], courseName: course.name, eventName: 'Turkey Shoot', dateLabel: 'Sat, Nov 28', startLabel: '9:00 AM', paidCents: 4500, terms: 'No refunds.' }, course),
    line: 'You’re signed up.', must: ['>$45.00<', 'Maple Run Golf Course’s terms.</strong> No refunds.'] },
  { name: 'event pay link', e: G.eventPayLinkEmail({ courseName: course.name, eventName: 'Turkey Shoot', dateLabel: 'Sat, Nov 28', label: 'Entry fee', amountCents: 4500, feeCents: 0, payUrl: 'https://greenreserve.app/pay/e1', terms: '' }, course),
    line: 'Entry fee for Turkey Shoot.', button: 'Pay $45.00' },
  { name: 'event pairings', e: G.eventPairingsEmail({ courseName: course.name, eventName: 'Turkey Shoot', dateLabel: 'Sat, Nov 28', startLabel: '9:00 AM', groupNo: 3, startHole: '7A', groupmates: ['Lee', 'Pat'] }, course),
    line: 'Your group for Turkey Shoot.', must: ['Shotgun', 'Starting hole', 'Lee<br>Pat'] },
  { name: 'pro shop pay link (fee wording SHOP_FEE_LABEL)', e: G.shopPayLinkEmail({ courseName: course.name, totalCents: 3889, taxCents: 0, lines: [{ name: 'Sleeve of balls', unitPriceCents: 1925, quantity: 2 }], payUrl: 'https://greenreserve.app/pay/s1', serviceFeeCents: 39 }, course),
    line: 'Your pro shop total is $38.89.', button: 'Pay $38.89', must: ['Sleeve of balls × 2', 'GreenReserve service fee (1% of shop items)'] },
  { name: 'pro shop receipt', e: G.shopReceiptEmail({ courseName: course.name, saleId: 'sale_abcdefgh12345678', saleNumber: 18, lines: [{ name: 'Glove', unitPriceCents: 2000, quantity: 1 }], discountCents: 0, discountNote: '', taxCents: 160, totalCents: 2160, paidWith: 'Cash', paidAt: 'Nov 21, 11:22 AM', cashTenderedCents: 3000, refundedCents: 0 }, course),
    line: 'You paid $21.60 at Maple Run Golf Course.', must: ['>#18<', 'Cash given · change', '$30.00 · $8.40'] },
];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{26F3}]/u;
for (const c of cases) {
  const { subject, html, text } = c.e;
  const all = html + '\n' + text + '\n' + subject;
  const problems: string[] = [];
  if (!html.includes(`>${esc(c.line)}</h1>`)) problems.push('headline');
  if (!text.startsWith(c.line)) problems.push('text starts with the line');
  if (c.button && !html.includes(`>${esc(c.button)}&nbsp;&rarr;</a>`)) problems.push('button');
  if (c.button && !text.includes(`${c.button}: `)) problems.push('text button link');
  for (const m of c.must ?? []) if (!all.includes(m)) problems.push(`missing: ${m}`);
  for (const m of c.mustNot ?? []) if (all.includes(m)) problems.push(`should not say: ${m}`);
  if (/undefined|NaN|\[object/.test(all)) problems.push('undefined/NaN in output');
  if (EMOJI.test(all)) problems.push('emoji');
  if (/Questions\?|Reply to this email|Privacy|Terms of/.test(all)) problems.push('Questions/reply/privacy line');
  if (!html.includes('Powered by&nbsp;<img') || !text.includes('Powered by GreenReserve')) problems.push('footer');
  if (!html.includes('(555) 010-2000') || !text.includes('(555) 010-2000')) problems.push('course phone in footer');
  if (/[\r\n]/.test(subject) || subject.length > 140) problems.push('subject');
  check(`${c.name}: ${c.line}`, problems.length === 0, problems.join('; '));
}

// ---------- The senders ----------
const src = readFileSync('src/lib/email.ts', 'utf8');
const fn = (n: string) => { const i = src.indexOf(`export async function ${n}(`); const j = src.indexOf('\nexport ', i + 1); return src.slice(i, j < 0 ? undefined : j); };
const GOLFER = ['sendBookingConfirmation', 'sendBookingModifiedEmail', 'sendReminderEmail', 'sendCancellationWarningEmail', 'sendCancellationEmail', 'sendCancellationFeeChargedEmail',
  'sendCheckInAvailableEmail', 'sendFrostDelayEmail', 'sendCourseNoticeEmail', 'sendRoundReceiptLinkEmail', 'sendCheckInReceiptEmail', 'sendRefundEmail', 'sendTeeTimeAlertEmail',
  'sendAlertConfirmEmail', 'sendMemberInviteEmail', 'sendMemberMagicLink', 'sendMemberLoginCode', 'sendMembershipPaymentLinkEmail', 'sendMembershipReceiptEmail', 'sendAutoRenewOnEmail',
  'sendAutoRenewReminderEmail', 'sendAutoRenewDeclinedEmail', 'sendAutoRenewOffEmail', 'sendStatementEmail', 'sendStatementDeclinedEmail', 'sendStatementPaidEmail',
  'sendEventSignupEmail', 'sendEventPayLinkEmail', 'sendEventPairingsEmail', 'sendShopSalePayLinkEmail', 'sendShopReceiptEmail'];
for (const n of GOLFER) {
  const f = fn(n);
  check(`${n} is sent as the course from noreply@, with a plain-text version, through getResend`, f.length > 0 && f.includes('from: courseFrom(ctx.course.name, NOREPLY_EMAIL)') && (f.includes('...mail(') || f.includes('subject, html, text')) && f.includes('getResend().emails.send({ meta: { kind:'));
}
check('both alert emails keep the one-click stop header', (src.match(/headers: stop\.headers/g) ?? []).length === 2);
check('the course is looked up from the booking or the course, never trusted from a name', src.includes('export async function emailCourse(') && /prisma\.booking\.findUnique\(\{ where: \{ id: ref\.bookingId \}/.test(src));
check('…and the lookup never throws (the email still goes with the name only)', /catch \(err\) \{\s*console\.error\('\[email\] course lookup failed/.test(src));
check('golfer emails no longer use the old layout', !GOLFER.some(n => fn(n).includes('baseTemplate(')));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed) process.exit(1);

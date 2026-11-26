// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED"; mockup
// lanes/build/emails-texts-mockup.html v17): renders every email GreenReserve sends in its own name —
// course staff, onboarding, Cam's admin mail, owner security, Cam's plain replies and outreach — and
// checks the key strings. Pure: no database, no send.   npx tsx scripts/emails-staff-test.ts
import { readFileSync } from 'fs';
import { esc } from '../src/lib/email-layout';
import * as S from '../src/lib/email-staff';
import { welcomeParts } from '../src/lib/team-welcome';
import { OUTREACH_POSTAL_ADDRESS } from '../src/lib/contact';

process.env.NEXT_PUBLIC_URL = 'https://greenreserve.app';
let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (extra !== undefined) console.log('   ', typeof extra === 'string' ? extra.slice(0, 600) : extra); } };

type Case = { name: string; e: S.BuiltEmail; line?: string; must?: string[]; mustNot?: string[]; button?: string; plain?: boolean; /** sent from noreply@: must never ask for a reply */ noreply?: boolean };
const when = new Date('2026-11-24T19:00:00Z');
const cases: Case[] = [
  { name: 'new online booking (staff)', e: S.operatorBookingEmail({ golferName: 'Sam <Lee>', golferEmail: 'sam@example.test', courseName: 'Maple Run', date: '2026-11-21', time: '11:40', players: 4, holes: 18, greenFeeTotal: 20800, cartFeeTotal: 4400 }),
    line: 'New online booking at Maple Run.', button: 'Open the tee sheet', must: ['New booking at Maple Run: 4 players – Sat, Nov 21 at 11:40 AM', '>Sat, Nov 21<', 'Sam &lt;Lee&gt;', '>$252.00<', 'Golfers pay $1.50 per player on each online booking, added to your price.', S.STAFF_QUESTIONS, 'See it in Payments'] },
  { name: 'course stopped taking bookings', e: S.courseClosedEmail({ courseName: 'Maple Run', action: 'offline', cancelledCount: 2 }),
    line: 'Maple Run has been taken offline.', must: ['2 upcoming bookings were cancelled', 'reply to this email'] },
  { name: 'staff invite (mockup: added to the team)', e: S.staffWelcomeEmail({ personName: 'Jo Park', ownerName: 'Dana Ortiz', courseName: 'Maple Run Golf Course', roleName: 'Pro shop staff', roleCan: 'see the tee sheet' }, 'https://greenreserve.app/dashboard/setup?t=x'),
    line: 'You’ve been added to the team.', button: 'Set your password', must: ['Dana Ortiz added you to Maple Run Golf Course as Pro shop staff. Set your password to sign in to the dashboard.', '>Added by<', '>48 hours<', 'Dana added you to Maple Run Golf Course on GreenReserve'] },
  { name: 'staff set-new-password', e: S.staffResetLinkEmail({ to: 'jo@example.test', personName: 'Jo', ownerName: 'Dana Ortiz', courseName: 'Maple Run', resetLink: 'https://greenreserve.app/r?t=x' }),
    line: 'Set a new password.', button: 'Set a new password', must: ['works once, for 1 hour', 'Didn’t expect this?'], noreply: true },
  { name: 'password reset', e: S.operatorPasswordResetEmail({ operatorEmail: 'o@example.test', resetLink: 'https://greenreserve.app/reset?t=x' }), line: 'Reset your password.', button: 'Set a new password', must: ['expires in 1 hour', 'If this wasn’t you', 'Questions? Email admin@greenreserve.app.'], noreply: true },
  { name: 'confirm your email', e: S.operatorVerifyEmail({ operatorEmail: 'o@example.test', verifyLink: 'https://greenreserve.app/verify?t=x' }), line: 'Confirm your email.', button: 'Confirm my email', must: ['Didn’t ask for this?', 'Questions? Email admin@greenreserve.app.'], noreply: true },
  { name: 'sign-in code', e: S.twoFactorCodeEmail({ code: '482915' }), line: 'Your sign-in code', must: ['>482915<', 'Your GreenReserve verification code: 482915', '10 minutes', 'Didn’t try to sign in? Email admin@greenreserve.app.'], noreply: true },
  { name: 'password changed', e: S.passwordChangedEmail({ email: 'o@example.test' }), line: 'Your password was changed.', must: ['GreenReserve dashboard (o@example.test)', 'Wasn’t you? Email admin@greenreserve.app right away.'], noreply: true },
  { name: 'admin password changed', e: S.passwordChangedEmail({ email: 'a@example.test', admin: true }), line: 'Your password was changed.', must: ['admin account', 'Your GreenReserve admin password was changed', 'Wasn’t you?'], noreply: true },
  { name: 'new support message', e: S.messageNotificationEmail({ senderName: 'Cam', courseName: 'Maple Run', messageBody: 'Your page is live.\nNice work.', replyUrl: 'https://greenreserve.app/dashboard/support' }),
    line: 'Cam sent a message about Maple Run.', button: 'View and reply', must: ['Your page is live.<br>Nice work.'] },
  { name: 'announcement (escaped, not HTML)', e: S.announcementEmail({ title: 'New: pro shop register', body: 'It is live.\n\n<b>Try it</b> today.' }),
    line: 'New: pro shop register', must: ['&lt;b&gt;Try it&lt;/b&gt; today.', '[GreenReserve] New: pro shop register'], mustNot: ['<b>Try it</b> today.</p>'] },
  { name: 'monthly review (no metrics)', e: S.monthlyReviewEmail({ courseName: 'Maple Run', monthLabel: 'October 2026' }),
    line: 'Your October review from GreenReserve is ready.', button: 'Open your review', must: ['Maple Run: your October 2026 review', '/dashboard/analytics#reviews'], mustNot: ['width:36px;height:3px', 'Rounds', 'No-shows', 'Collected', 'went well'] },
  { name: 'low stock', e: S.lowStockEmail({ courseName: 'Maple Run', items: [{ name: 'Glove', stockCount: 2, reorderAt: 3 }] }),
    line: 'An item is running low.', button: 'Open the pro shop', must: ['2 left (reminder at 3)', 'Low stock: Glove'] },
  { name: 'signed agreements', e: S.signedAgreementsEmail({ courseName: 'Maple Run', legalName: 'Maple Run LLC', signerName: 'Dana', signerEmail: 'd@example.test', acceptedAt: when, documents: [{ title: 'Operator Agreement', version: '2026-11' }], pending: [], attached: true }),
    line: 'Your signed GreenReserve agreements.', must: ['Dana signed these for Maple Run LLC', 'The signed copies are attached.', '>v2026-11<'] },
  { name: 'agreement changed', e: S.agreementBumpEmail({ courseName: 'Maple Run', title: 'Operator Agreement', version: '2026-12', effectiveAt: when, reacceptBy: when, changeSummary: 'Adds the 1% <shop> fee.' }),
    line: 'The Operator Agreement has changed.', button: 'Review and sign', must: ['Adds the 1% &lt;shop&gt; fee.', '/dashboard/sign'] },
  { name: 'we got your question', e: S.inquiryConfirmationEmail({ firstName: 'Sam', courseName: 'Maple Run', callUrl: null }), line: 'Got it, Sam.', button: 'Book a demo', must: [S.INQUIRY_CALL_FALLBACK_URL] },
  { name: 'page already exists', e: S.inquiryAlreadyBuiltEmail({ firstName: 'Sam', courseName: 'Maple Run' }), line: 'You’re already set up, Sam.', button: 'Sign in to your dashboard' },
  { name: 'inquiry code (not a way in)', e: S.inquirySigninCodeEmail({ courseName: 'Maple Run', code: '123456' }), line: 'Your code', must: ['>123456<', 'doesn’t sign you in on its own', 'expires in 10 minutes', 'Questions? Email admin@greenreserve.app.'], noreply: true },
  { name: 'setup sheet received', e: S.detailsSheetConfirmationEmail({ firstName: 'Sam', contactName: 'Sam Lee', courseName: 'Maple Run', details: {} }), line: 'Your setup sheet is in, Sam.', must: ['What happens next'] },
  { name: 'setup sheet request', e: S.detailsRequestEmail({ courseName: 'Maple Run', detailsLink: 'https://greenreserve.app/details/x' }), line: 'One short form to get Maple Run live.', button: 'Open the setup sheet' },
  { name: 'call tomorrow', e: S.callReminderEmail({ courseName: 'Maple Run', scheduledAt: when, direction: 'we_call', phone: '(555) 010-2000', manageUrl: 'https://cal.com/x' }), line: 'Talking tomorrow at 2:00 PM.', must: ['We call you at (555) 010-2000', 'Reschedule or cancel'] },
  { name: 'call booked (agenda escaped)', e: S.callScheduledEmail({ courseName: 'Maple Run', scheduledAt: when, durationMin: 30, direction: 'they_call', phone: '', agendaLabels: ['Your <prices>'] }), line: 'Your call with GreenReserve.', must: ['Your &lt;prices&gt;', 'What we’ll go over'] },
  { name: 'still waiting to go live', e: S.onboardingChaseEmail({ courseName: 'Maple Run', remainingSteps: ['Connect payments with Stripe'] }), line: 'Finish setting up Maple Run.', button: 'Finish setup', must: ['Connect payments with Stripe'] },
  { name: 'new inquiry (to Cam)', e: S.inquiryNotificationEmail({ inquiryId: 'i1', contactName: 'Sam', contactTitle: 'GM', email: 's@example.test', phone: '', courseName: 'Maple <Run>', city: 'Millbrook', state: 'NY', additionalNotes: 'How much?' }),
    line: 'Maple <Run>', button: 'Reply', must: ['/admin/inquiries/i1?reply=1', 'Open inquiry', 'How much?'] },
  { name: 'locked out (to Cam)', e: S.lockedOutAlertEmail({ courseName: 'Maple Run', inquiryId: 'i1', operatorEmail: 'o@example.test', reason: 'unverified' }), line: 'An operator proved their email and still can’t get in.', button: 'Open the inquiry' },
  { name: 'setup sheet ready (to Cam, no emoji)', e: S.detailsSubmittedEmail({ courseName: 'Maple Run', contactName: 'Sam' }), line: 'Maple Run sent their setup sheet.', button: 'Review in Admin' },
  { name: 'course approved (to Cam)', e: S.courseApprovedEmail({ courseName: 'Maple Run', contactName: 'Sam' }), line: 'Maple Run approved their page.', button: 'Review in Admin' },
  { name: 'agreement notice summary (to Cam)', e: S.agreementBumpSummaryEmail({ title: 'Operator Agreement', version: '2026-12', reacceptBy: when, notified: 3, failures: ['x@example.test'] }), line: 'Operator Agreement v2026-12: the day-0 notice went out.', must: ['3 operators', 'Failed to send to: x@example.test'] },
  { name: 'urgent (to Cam, each finding links)', e: S.adminUrgentEmail({ findings: [{ title: 'Webhook failing', detail: 'Stripe 500s', href: '/admin/system' }] }), line: 'Something needs you.', button: 'Open Today', must: ['href="https://greenreserve.app/admin/system"', '[GreenReserve] Webhook failing'] },
  { name: 'morning digest (to Cam)', e: S.adminDigestEmail({ summary: 'Quiet night.', facts: { date: 'Nov 20', urgentOpen: [], needsYou: { total: 0, money: 0, stalled: 0 }, money: { daysIn: 20, volume: 1000, volumeLastMonth: 900, fees: 30, feesLastMonth: 20, net: null, netLastMonth: null }, onboarding: [{ stage: 'Building', count: 2, stuck: 1 }] } }),
    line: 'Good morning.', must: ['Nothing urgent.', 'Stripe didn’t answer', '2 (1 stuck)'] },
  { name: 'admin code', e: S.adminTwoFactorEmail({ code: '555111' }), line: 'Your admin code', must: ['>555111<', '10 minutes', 'Not you? Email admin@greenreserve.app'], noreply: true },
  { name: 'admin password reset', e: S.adminPasswordResetEmail({ adminEmail: 'a@example.test', resetLink: 'https://greenreserve.app/admin/reset?t=x' }), line: 'Reset your admin password.', button: 'Set a new password', must: ['24 hours', 'If this wasn’t you'], noreply: true },
  { name: 'approve a new device', e: S.ownerDeviceApprovalEmail({ approvalUrl: 'https://greenreserve.app/cam/approve?t=x', device: 'Chrome on Mac', place: '', when: 'Nov 20, 7:00 AM' }), line: 'Approve a new device.', button: 'Review this device', must: ['>Unknown<', '15 minutes', 'don’t approve it', 'change your password now'], noreply: true },
  { name: 'owner sign-in', e: S.ownerSignInEmail({ device: 'Safari', place: 'Albany, NY', when: 'now', method: 'passkey' }), line: 'You signed in.', must: ['with a passkey', 'Not you?', 'Sign out everywhere'], noreply: true },
  { name: 'owner password changed', e: S.ownerPasswordChangedEmail({ how: 'reset link', device: 'Safari', place: 'Albany, NY', when: 'now' }), line: 'Your password was changed.', must: ['Not you?', 'Forgot password'], noreply: true },
  { name: 'staff login link', e: S.staffLoginLinkEmail({ personName: 'Jo Smith', courseName: 'Maple Run', to: 'jo@example.test' }), line: 'Your staff login.', must: ['Maple Run', 'jo@example.test', 'Sign in'] },
  { name: 'authenticator set up', e: S.ownerTwoFactorChangedEmail({ change: 'set_up', device: 'Safari', when: 'now' }), line: 'An authenticator app was set up.', must: ['instead of an emailed code'], noreply: true },
  { name: 'authenticator replaced', e: S.ownerTwoFactorChangedEmail({ change: 'replaced', device: 'Safari', when: 'now' }), line: 'The authenticator app was moved to a new phone.', must: ['Not you?', 'Sign out everywhere'], noreply: true },
  { name: 'recovery codes replaced', e: S.ownerTwoFactorChangedEmail({ change: 'recovery_codes', device: 'Safari', when: 'now' }), line: 'New recovery codes were made.', must: ['old codes no longer work'], noreply: true },
  { name: 'passkey added', e: S.ownerPasskeyChangedEmail({ change: 'added', passkey: 'iPhone', device: 'Safari', when: 'now' }), line: 'A passkey was added.', must: ['>iPhone<', 'Not you?', 'remove the passkey'], noreply: true },
  { name: 'Cam’s reply (plain)', plain: true, e: S.inquiryReplyEmail({ contactName: 'Sam Lee', courseName: 'Maple Run', body: 'Yes, it is free.\n\nTalk soon.', question: 'Is it free?', adminName: 'Cam Sanchez' }),
    must: ['Hi Sam,', 'Yes, it is free.', 'You asked: Is it free?', 'Re: your question about Maple Run'] },
  { name: 'not a fit (plain)', plain: true, e: S.inquiryDeclinedEmail({ contactName: 'Sam Lee', courseName: 'Maple Run' }), must: ['not able to take it on right now'] },
  { name: 'pick a call time (plain, link works)', plain: true, e: S.callInviteEmail({ firstName: 'Sam', courseName: 'Maple Run', url: 'https://cal.com/greenreserve/30?x=1&y=2', agendaLines: ['Your tee sheet'] }),
    must: ['href="https://cal.com/greenreserve/30?x=1&amp;y=2"', '- Your tee sheet'] },
  { name: 'a link ending a sentence keeps its full stop outside the link', plain: true, e: S.inquiryReplyEmail({ contactName: 'Sam', courseName: 'Maple Run', body: 'See https://greenreserve.app/demo. Or (https://cal.com/x), "https://a.com/q" and <https://b.com/r>!', adminName: 'Cam' }),
    must: ['href="https://greenreserve.app/demo" style="color:#1F4D34">https://greenreserve.app/demo</a>.', 'href="https://cal.com/x" style="color:#1F4D34">https://cal.com/x</a>),', 'href="https://a.com/q" style="color:#1F4D34">https://a.com/q</a>&quot;', 'href="https://b.com/r" style="color:#1F4D34">https://b.com/r</a>&gt;!'], mustNot: ['demo."', 'x)"', 'q&quot;"', 'r&gt;"'] },
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2705}]/u;
for (const c of cases) {
  const { subject, html, text } = c.e;
  const all = html + '\n' + text + '\n' + subject;
  const problems: string[] = [];
  if (c.line && !html.includes(`>${esc(c.line)}</h1>`)) problems.push('headline');
  if (c.line && !text.startsWith(c.line)) problems.push('text starts with the line');
  if (c.button && !html.includes(`>${esc(c.button)}&nbsp;&rarr;</a>`)) problems.push('button');
  for (const m of c.must ?? []) if (!all.includes(m)) problems.push(`missing: ${m}`);
  for (const m of c.mustNot ?? []) if (all.includes(m)) problems.push(`should not say: ${m}`);
  if (/undefined|NaN|\[object/.test(all)) problems.push('undefined/NaN');
  if (EMOJI.test(all)) problems.push('emoji');
  if (!c.plain && (!html.includes('alt="GreenReserve" width="139" height="26"') || !html.includes('>greenreserve.app'))) problems.push('GreenReserve header logo / footer');
  if (!c.plain && /Powered by/.test(html)) problems.push('Powered by is for course emails only');
  if (c.plain && /<h1|alt="GreenReserve"/.test(html)) problems.push('plain email has no layout');
  if (/[\r\n]/.test(subject)) problems.push('subject');
  if (c.noreply && /reply to this email|reply here/i.test(all)) problems.push('a noreply@ email asks for a reply');
  check(`${c.name}`, problems.length === 0, problems.join('; '));
}

// ---------- Outreach: refuses while the postal address is empty ----------
check('the postal address is still owed (empty), so outreach is off', OUTREACH_POSTAL_ADDRESS === '');
let threw = '';
try { S.outreachEmail({ subject: 'A free tee sheet for Maple Run', paragraphs: ['Hi Sam,'] }, ''); } catch (e) { threw = String((e as Error).message); }
check('an outreach email with no postal address is refused before it is built', /postal address/.test(threw), threw);
const o = S.outreachEmail({ subject: 'A free tee sheet for Maple Run', paragraphs: ['Hi Sam,', 'I’m Cam, the founder of GreenReserve.', 'Golfers pay $1.50 per player on each online booking, added to your price.'] }, '1 Main St, Albany, NY 12207');
check('outreach: plain, signed by Cam, then the logo and "<address> · Reply “no thanks” to stop."', o.html.includes('Cam Sanchez<br>GreenReserve · admin@greenreserve.app') && o.html.includes('alt="GreenReserve" width="107" height="20"') && o.html.includes('1 Main St, Albany, NY 12207 · Reply “no thanks” to stop.') && o.text.endsWith('--\n1 Main St, Albany, NY 12207 · Reply “no thanks” to stop.\n'), o.text);
const src = readFileSync('src/lib/email.ts', 'utf8');
const fn = (n: string) => { const i = src.indexOf(`export async function ${n}(`); const j = src.indexOf('\nexport ', i + 1); return src.slice(i, j < 0 ? undefined : j); };
check('sendOutreachEmail builds with the configured address (so it throws while empty) and sends through getResend from admin@', fn('sendOutreachEmail').includes('outreachEmail(data, OUTREACH_POSTAL_ADDRESS)') && fn('sendOutreachEmail').includes('getResend().emails.send({ meta: { kind: \'outreach_email\'') && fn('sendOutreachEmail').includes("from: courseFrom(data.senderName || 'Cam Sanchez', ADMIN_EMAIL)"));

// ---------- Senders: where replies go ----------
for (const n of ['sendTwoFactorCodeEmail', 'sendAdminTwoFactorCode', 'sendOperatorPasswordResetEmail', 'sendOperatorVerifyEmail', 'sendStaffResetLinkEmail', 'sendPasswordChangedNotification',
  'sendAdminPasswordResetEmail', 'sendAdminPasswordChangedNotification', 'sendInquirySigninCode', 'sendOwnerDeviceApproval', 'sendOwnerSignInAlert', 'sendOwnerPasswordChanged', 'sendOwnerPasskeyChanged', 'sendOwnerTwoFactorChanged'])
  check(`${n}: from noreply@ (its rendered email never asks for a reply: see above)`, fn(n).includes('from: FROM_NOREPLY') && fn(n).includes('...mail('));
for (const n of ['sendOperatorBookingNotification', 'sendStaffLoginLinkEmail', 'sendLowStockEmail', 'sendMessageNotificationEmail', 'sendAnnouncementEmail', 'sendMonthlyReviewEmail', 'sendCourseClosedNotice', 'sendStaffWelcomeEmail', 'sendInquiryConfirmation', 'sendInquiryAlreadyBuilt', 'sendDetailsSheetConfirmationEmail', 'sendDetailsRequestEmail',
  'sendCallInviteEmail', 'sendCallReminderEmail', 'sendCallScheduledEmail', 'sendInquiryDeclinedEmail', 'sendInquiryReply', 'sendOnboardingChaseEmail', 'sendSignedAgreementsEmail', 'sendAgreementBumpNoticeEmail'])
  check(`${n}: from admin@, so a reply reaches Cam`, fn(n).includes('from: FROM_ADMIN') && fn(n).includes('...mail('));
for (const n of ['sendInquiryNotification', 'sendLockedOutOperatorAlert', 'sendDetailsSubmittedNotification', 'sendCourseApprovedNotification', 'sendAgreementBumpAdminSummaryEmail', 'sendAdminUrgentAlert', 'sendAdminDigest'])
  check(`${n}: to Cam at admin@`, fn(n).includes('to: ADMIN_EMAIL') && fn(n).includes('...mail('));
check('the Invite popup previews the exact invite email', src.includes('return staffWelcomeEmail(data, setupLink).html;'));
check('team-welcome keeps one source for the invite words', welcomeParts({ personName: 'Jo', ownerName: '', courseName: 'C', roleName: 'R', roleCan: '' }).subject === 'The course owner added you to C on GreenReserve');

(async () => {
  process.env.RESEND_API_KEY = 're_test_not_real';
  let requests = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { requests++; return new Response('{}', { status: 200 }); }) as typeof fetch;
  let err = '';
  try { const { sendOutreachEmail } = await import('../src/lib/email'); await sendOutreachEmail({ to: 'gm@example.test', subject: 'A free tee sheet', paragraphs: ['Hi Sam,'] }); } catch (e) { err = String((e as Error).message); }
  globalThis.fetch = realFetch;
  check('sendOutreachEmail with the address empty throws and makes no request at all', /postal address/.test(err) && requests === 0, { err, requests });
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  if (failed) process.exit(1);
})();

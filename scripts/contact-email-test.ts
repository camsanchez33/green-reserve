// MAIL-1 (Cam 2026-10-22): every address comes from lib/contact.ts; the old
// Outlook inbox and the dead hello@ sender are gone; codes come from noreply@.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const files = walk('src');
const stray = files.filter(f => !f.endsWith('lib/contact.ts') && /thegreenreserve@outlook\.com|hello@greenreserve\.app|(support|admin|billing|noreply)@greenreserve\.app/.test(readFileSync(f, 'utf8')));
check('no address is typed outside lib/contact.ts', stray.length === 0);
if (stray.length) console.log('  ' + stray.join('\n  '));
// 2026-10-24 (Cam): the agreements name admin@ too — no signed copy predates launch.
const agreements = readdirSync('legal/documents').flatMap(d => readdirSync(join('legal/documents', d)).map(f => join('legal/documents', d, f)));
check('no agreement names the old Outlook inbox or hello@', agreements.every(f => !/thegreenreserve@outlook\.com|hello@greenreserve\.app/.test(readFileSync(f, 'utf8'))));
const e = readFileSync('src/lib/email.ts', 'utf8');
const fn = (n: string) => { const i = e.indexOf(`export async function ${n}(`); const j = e.indexOf('\nexport ', i + 1); return e.slice(i, j < 0 ? undefined : j); };
for (const n of ['sendTwoFactorCodeEmail', 'sendAdminTwoFactorCode', 'sendOperatorPasswordResetEmail', 'sendGolferPasswordResetEmail', 'sendOperatorVerifyEmail', 'sendInquirySigninCode', 'sendOwnerDeviceApproval', 'sendOwnerSignInAlert', 'sendOwnerPasswordChanged'])
  check(`${n} is sent from noreply@ and never asks for a reply`, fn(n).includes('from: FROM_NOREPLY') && !/[Rr]eply (to this email|here)/.test(fn(n)));
// Emails redo (Cam 2026-11-19): every golfer email comes from the course — its full name at noreply@, no replies
// (scripts/emails-golfer-test.ts checks all of them).
for (const n of ['sendMemberMagicLink', 'sendCheckInReceiptEmail', 'sendRefundEmail', 'sendCancellationFeeChargedEmail', 'sendMembershipReceiptEmail', 'sendEventPayLinkEmail', 'sendCancellationEmail', 'sendBookingConfirmation', 'sendReminderEmail', 'sendCheckInAvailableEmail'])
  check(`${n} is sent as the course from noreply@`, fn(n).includes('from: courseFrom(ctx.course.name, NOREPLY_EMAIL)') && !/[Rr]eply (to this email|here)/.test(fn(n)));
check('…and the cancel path tells it when a refund went through', readFileSync('src/lib/cancel-booking.ts', 'utf8').includes('refunded: roundRefunded || feeWaivedRefunded'));
for (const n of ['sendInquiryConfirmation', 'sendSignedAgreementsEmail', 'sendCourseLiveOrientationEmail'])
  check(`${n} is sent from admin@`, fn(n).includes('from: FROM_ADMIN'));
// The build ignores type errors, so an email still on the old FROM would ship and throw when sent.
check('every email names one of the four senders', !/from: FROM\b(?!_)/.test(e));
check('an event sign-up comes from the course at noreply@, replies to the staff who set it up', fn('sendEventSignupEmail').includes('from: courseFrom(ctx.course.name, NOREPLY_EMAIL)') && fn('sendEventSignupEmail').includes('...(data.replyTo ? { replyTo: data.replyTo } : {})'));
check('no replyTo override sends replies to a dead inbox', !e.includes('REPLY_TO'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed) process.exit(1);

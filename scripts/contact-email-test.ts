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
const e = readFileSync('src/lib/email.ts', 'utf8');
const fn = (n: string) => { const i = e.indexOf(`export async function ${n}(`); const j = e.indexOf('\nexport ', i + 1); return e.slice(i, j < 0 ? undefined : j); };
for (const n of ['sendTwoFactorCodeEmail', 'sendGolferOtpEmail', 'sendAdminTwoFactorCode', 'sendOperatorPasswordResetEmail', 'sendGolferPasswordResetEmail', 'sendOperatorVerifyEmail', 'sendInquirySigninCode', 'sendMemberMagicLink', 'sendOwnerDeviceApproval', 'sendOwnerSignInAlert'])
  check(`${n} is sent from noreply@ and never asks for a reply`, fn(n).includes('from: FROM_NOREPLY') && !/[Rr]eply (to this email|here)/.test(fn(n)));
for (const n of ['sendCheckInReceiptEmail', 'sendRefundEmail', 'sendCancellationFeeChargedEmail', 'sendMembershipReceiptEmail', 'sendEventPayLinkEmail'])
  check(`${n} is sent from billing@`, fn(n).includes('from: FROM_BILLING') && fn(n).includes(', BILLING_EMAIL);'));
check('a cancellation that kept a fee or refunded money comes from billing@, a free one from support@', fn('sendCancellationEmail').includes('from: data.feeCharged || data.refunded ? FROM_BILLING : FROM_SUPPORT') && fn('sendCancellationEmail').includes(', data.feeCharged || data.refunded ? BILLING_EMAIL : SUPPORT_EMAIL);'));
check('…and the cancel path tells it when a refund went through', readFileSync('src/lib/cancel-booking.ts', 'utf8').includes('refunded: roundRefunded || feeWaivedRefunded'));
for (const n of ['sendBookingConfirmation', 'sendReminderEmail', 'sendCheckInAvailableEmail'])
  check(`${n} is sent from support@`, fn(n).includes('from: FROM_SUPPORT'));
for (const n of ['sendInquiryConfirmation', 'sendSignedAgreementsEmail', 'sendCourseLiveOrientationEmail'])
  check(`${n} is sent from admin@`, fn(n).includes('from: FROM_ADMIN') && fn(n).includes(', ADMIN_EMAIL);'));
// The build ignores type errors, so an email still on the old FROM would ship and throw when sent.
check('every email names one of the four senders', !/from: FROM\b(?!_)/.test(e));
check('no replyTo override sends replies to a dead inbox', !e.includes('REPLY_TO'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed) process.exit(1);

// R-GOLF-011 — the golfer's self check-in page speaks to the golfer: no
// "the operator needs to finish Stripe onboarding", no "Collect payment in
// person"; a cancelled booking gets no pay form; a cash round is never
// "charged to your card". Pure. Run: npx tsx scripts/checkin-wording-test.ts
import { readFileSync } from 'fs';
import { golferCheckInError } from '../src/lib/checkin-errors';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

const stripe = golferCheckInError('Stripe setup incomplete — the operator needs to finish Stripe onboarding in dashboard Settings before card payments can be accepted.');
check('Stripe-setup error is golfer-voiced', !/operator|dashboard/i.test(stripe) && /pro shop/.test(stripe), stripe);
const decl = golferCheckInError('Payment failed: Your card was declined. Collect payment in person and contact support.');
check('a decline keeps the reason and offers a way forward', /Your card was declined/.test(decl) && /Try another card/.test(decl) && !/Collect payment in person/.test(decl), decl);
const setup = golferCheckInError('Card setup failed: Your card number is incorrect.');
check('a card-setup failure is golfer-voiced', /That card couldn’t be used \(Your card number is incorrect\.\)/.test(setup), setup);
check('no-card prompt is plain', golferCheckInError('No card on file -- enter card details to complete check-in.') === 'Enter your card details to check in.');
check('other messages pass through', golferCheckInError('This booking was cancelled') === 'This booking was cancelled');

const route = readFileSync('src/app/api/checkin/[bookingId]/route.ts', 'utf8');
check('the golfer check-in route maps errors', /golferCheckInError\(result\.error/.test(route));
check('the route returns paidOffline', /paidOffline: booking\.paidOffline/.test(route));
const page = readFileSync('src/app/checkin/[bookingId]/page.tsx', 'utf8');
check('the page has a cancelled state', /info\.status === 'cancelled'/.test(page));
check('a cash round is not "charged to your card"', /paidAtCounter/.test(page));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

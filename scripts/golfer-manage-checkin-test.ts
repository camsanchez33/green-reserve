// Golfer lane, flow 2 (LAUNCH_PLAN_SPEC §4): manage, check-in and receipt. No database needed.
// Run: npx tsx scripts/golfer-manage-checkin-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const checkin = read('src/app/checkin/[bookingId]/page.tsx');
const manage = read('src/app/manage/[bookingId]/page.tsx');
const receipt = read('src/app/receipt/[bookingId]/page.tsx');

// Perf budget: Stripe.js only when the card form is on screen.
check('check-in imports Stripe from the /pure entry', checkin.includes("import { loadStripe } from '@stripe/stripe-js/pure';"));
check('…and asks for it only where the card form renders', !/const stripePromise = loadStripe\(/.test(checkin) && (checkin.match(/getStripePromise\(\)/g) ?? []).length === 2 && checkin.includes('<Elements stripe={getStripePromise()}>'));

// No dead ends: every page offers the way back and the way to change the booking.
check('check-in links to change or cancel the booking with the same token', (checkin.match(/href=\{`\/manage\/\$\{bookingId\}\?token=\$\{encodeURIComponent\(token\)\}`\}/g) ?? []).length === 2);
check('"See you …" links back to the course page', checkin.includes('href={`/courses/${info.courseSlug}`}'));
check('manage links back to the course page', manage.includes('href={`/courses/${info.courseSlug}`}'));

// TYPE-3: no decorative icons on the manage actions; icon-only buttons are labelled.
check('manage action cards carry no icons', !/icon=\{</.test(manage) && !manage.includes('XCircle') && !manage.includes('Clock size'));
check('manage icon-only back buttons have an aria-label', (manage.match(/aria-label="Back"/g) ?? []).length === 2);

// Colour follows meaning: no fee to cancel is good news, not a warning.
check('manage policy notice is green when cancelling costs nothing', manage.includes("!info.teedOff && (info.windowOpen || info.cancellationFeeTotal <= 0) ? 'bg-ok/5"));

// Receipt: a no-card booking is not told about "your card".
check('receipt does not mention a card when nothing was charged', receipt.includes("'Nothing has been charged yet. The round is paid when you check in.'"));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall passed');

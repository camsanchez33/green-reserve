// Golfer-facing money wording (R-CRON-004, R-GOLF-009). The "your cancellation
// window closes soon" email used to promise every golfer "a fee will be charged
// to your card automatically" — true only for a hold. Now it shares
// afterCutoffLine() with describePolicy(), so the email and the terms the golfer
// booked under say the same thing for each timing.
// Pure. Run: npx tsx scripts/policy-wording-test.ts
import { readFileSync } from 'fs';
import { describePolicy, policyFrom, afterCutoffLine, policyMoney, insideWindowLine, afterCutoffShort, cancelNowWords } from '../src/lib/cancel-policy';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

// 1. describePolicy wording is unchanged by the refactor (word for word).
const expected: Record<string, string> = {
  hold_at_cutoff: 'After that, a $20 hold is charged to your card. It’s refunded when you check in, and kept if you cancel late or don’t show.',
  late_cancel: 'Cancel after that and a $20 late-cancellation fee is charged to your card.',
  late_cancel_or_no_show: 'Cancel after that, or don’t show, and a $20 fee is charged to your card.',
};
for (const [timing, line] of Object.entries(expected)) {
  const { lines } = describePolicy(policyFrom({ lateCancellationFeeCents: 2000, lateFeeTiming: timing }));
  check(`describePolicy (${timing}) keeps its wording`, lines[1] === line, lines[1]);
}

// 2. The email's line: no "automatically charged" promise for late-cancel timings.
const email = (t: string | null) => afterCutoffLine(t, policyMoney(2500), 'once the window closes');
check('hold email says the hold is charged and refunded', /hold is charged/.test(email('hold_at_cutoff')) && /refunded when you check in/.test(email('hold_at_cutoff')));
check('late-cancel email only charges if they cancel', email('late_cancel') === 'Cancel once the window closes and a $25 late-cancellation fee is charged to your card.', email('late_cancel'));
check('late-cancel-or-no-show email names both', /or don’t show/.test(email('late_cancel_or_no_show')));
check('a booking made before SP-B (no timing) reads as a hold', email(null) === email('hold_at_cutoff'));
check('cents are shown as the golfer reads them', policyMoney(750) === '$7.50' && policyMoney(2000) === '$20');

// 3. The fixed "charged automatically" sentence is gone, and every sender passes the timing.
const emailSrc = readFileSync('src/lib/email.ts', 'utf8');
check('email.ts no longer hard-codes "charged to your card automatically"', !/charged to your card automatically/.test(emailSrc));
check('hourly cron passes the booking timing to the warning', /lateFeeTiming: booking\.lateFeeTimingAtBooking/.test(readFileSync('src/app/api/cron/hourly/route.ts', 'utf8')));
const bookSrc = readFileSync('src/app/api/bookings/route.ts', 'utf8');
check('booking route passes the timing to the warning', /lateFeeTiming: policy\.lateFeeTiming/.test(bookSrc));
check('booking route skips the warning once the cutoff has passed (R-GOLF-009)', /minsUntilCutoff > 0 && minsUntilCutoff < 75/.test(bookSrc));

// 4. Booked or browsing past the cutoff (R-GOLF-009): never "free to cancel until" a past time.
check('inside the window, a hold says it is charged within the hour', /hold is charged to your card within the hour/.test(insideWindowLine('hold_at_cutoff', '$20')));
check('inside the window, late-cancel says cancelling now charges', /Cancelling now charges the \$20 late-cancellation fee/.test(insideWindowLine('late_cancel', '$20')));
check('the short trust-line form names the hold', afterCutoffShort('hold_at_cutoff', '$20') === 'then a $20 hold, refunded at check-in');
check('the short form for late-cancel is conditional', afterCutoffShort('late_cancel', '$20') === 'then a $20 fee if you cancel');
const bookClient = readFileSync('src/app/book/BookClient.tsx', 'utf8');
check('confirmation no longer hard-codes the late-fee sentence', !/late-cancellation fee is charged to your card on file/.test(bookClient));
check('card form no longer says "you pay at the course" on every course', !/you pay at the course when you check in/.test(bookClient));
check('booked past the cutoff on a hold course, Today no longer says $0.00', /holdTodayLine\(/.test(bookClient));
check('confirmation branches on cutoffPassed', /confirmedData\.cutoffPassed/.test(bookClient));
const coursePage = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('course trust line checks the slot against the cutoff', /slotPastCutoff/.test(coursePage) && /insideWindowLine\(/.test(coursePage));
check('booking API returns cutoffPassed and the timing', /cutoffPassed,/.test(bookSrc) && /lateFeeTiming: +policy\.lateFeeTiming,/.test(bookSrc));

// 5. Manage page (R-GOLF-008): the cancel sentences match what performCancellation charges.
{
  const base = { cancellationHours: 24, feeCents: 2000, bookingFeeCents: 600 };
  const open = cancelNowWords({ ...base, windowOpen: true, timing: 'hold_at_cutoff', feeAlreadyCharged: false });
  check('manage: before the cutoff it is free', /no charge/.test(open.confirm) && /Free cancellation until 24 hours/.test(open.banner));
  const taken = cancelNowWords({ ...base, windowOpen: false, timing: 'hold_at_cutoff', feeAlreadyCharged: true });
  check('manage: a taken hold is kept AND the booking fee is charged (no "won’t add another charge")', /kept, and the \$6 booking fee is charged/.test(taken.confirm), taken.confirm);
  const untaken = cancelNowWords({ ...base, windowOpen: false, timing: 'hold_at_cutoff', feeAlreadyCharged: false });
  check('manage: an untaken hold is charged on cancel, with the booking fee', untaken.confirm === 'Cancelling now charges the $20 hold plus the $6 booking fee to your card. None of it is refundable.', untaken.confirm);
  const late = cancelNowWords({ ...base, windowOpen: false, timing: 'late_cancel', feeAlreadyCharged: false });
  check('manage: late-cancel charges the fee now', /charges the \$20 fee plus the \$6 booking fee/.test(late.confirm));
  const noCard = cancelNowWords({ ...base, bookingFeeCents: 0, windowOpen: false, timing: 'late_cancel', feeAlreadyCharged: false });
  check('manage: no booking fee mentioned when none would be charged', !/booking fee/.test(noCard.confirm));
  const free = cancelNowWords({ ...base, feeCents: 0, windowOpen: false, timing: null, feeAlreadyCharged: false });
  check('manage: a no-fee course is free any time', /no late-cancellation fee/.test(free.banner));
  const manageSrc = readFileSync('src/app/manage/[bookingId]/page.tsx', 'utf8');
  check('manage page no longer says cancelling "won’t add another charge"', !/won't add another charge|won’t add another charge/.test(manageSrc));
  check('manage page reads cancelNowWords', /cancelNowWords\(/.test(manageSrc));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

// Audit re-check 2026-11-01, batch A part 2 ("what the app says wrong"):
//  1. check-in on a round paid ahead says nothing is charged (and asks no headcount);
//  2. the cancel confirm says exactly what a cancel now does with the late fee (and when there's no card);
//  3. a no-show marked on a past day says the charge is taken within the hour, not "at midnight";
//  4. a walk-in's confirmation email names the rate staff picked;
//  5. "Not linked" members get member rates once they sign in with the listed email — the words say so;
//  6. the golfer page's Twilight filter starts at the course's own twilight period;
//  7. the golfer page's cart button says when a cart is added;
//  8. the Members / Residents toggles say off means the public price (true since lib/pricing-switch).
// Pure. Run: npx tsx scripts/audit-wording-test.ts
import { readFileSync } from 'fs';
import { cancelConfirmText } from '../src/lib/cancel-confirm';
import { normalizeDbCourse } from '../src/lib/normalize-course';
import { noShowScanFrom, noShowMarkOutcome, NO_SHOW_SCAN_DAYS } from '../src/lib/no-show-fee';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// 1
const sheet = read('src/app/dashboard/page.tsx');
ok('1. a prepaid round is checked before the card form', sheet.indexOf("const prepaid = b.paymentStatus === 'paid';") < sheet.indexOf("if (!prepaid && (b.hasCard === false"));
ok('1. a prepaid round skips the headcount and says nothing is charged',
  sheet.includes("const showed = prepaid ? b.players : askHeadcount(b);") && sheet.includes('Their round is already paid — nothing is charged.'));

// 2
const base = { golferName: 'Pat', paymentStatus: 'card_on_file', cancellationFeeTotal: 1500 };
const late = cancelConfirmText({ ...base, lateFeeOnCancel: true, hasCard: true }, false, true);
ok('2. window closed + card: the fee is charged now (no "if")', late.includes('has closed, so the $15.00 late fee is charged to their card now') && !late.includes('If their'), late);
const noCard = cancelConfirmText({ ...base, lateFeeOnCancel: true, hasCard: false }, false, true);
ok('2. window closed, no card: says the fee can\'t be charged', noCard.includes("no card on file, so the $15.00 late fee can't be charged") && !noCard.includes('charged to their card now'), noCard);
const inside = cancelConfirmText({ ...base, lateFeeOnCancel: false, hasCard: true }, false, true);
ok('2. inside the window: nothing is charged', inside.includes('inside the free-cancellation window — nothing is charged'), inside);
ok('2. unknown (no server answer): the old careful wording', cancelConfirmText(base, false, true).includes('If their free-cancellation window has already closed'));
const tt = read('src/app/api/operator/tee-times/route.ts');
ok('2. the sheet\'s server sends when the fee starts (window, timing, fee not yet charged)',
  tt.includes('lateFeeFrom: lateFeeFrom(') && tt.includes("b.paymentStatus !== 'cancellation_fee_charged'") && tt.includes('bookingWindowHours(b, courseRow) * 3600_000).toISOString()') && tt.includes('(chargesOnLateCancel(b) || holdsAtCutoff(b))'));
ok('2. the sheet decides at the tap, not at load (a sheet open across the cutoff stays right)', sheet.includes('b.lateFeeFrom !== null && Date.now() >= Date.parse(b.lateFeeFrom)') && !tt.includes('<= Date.now()'));
ok('1. the check-in result says already paid, not "charged $X"', sheet.includes("data.alreadyPaid ? 'Checked in — already paid, nothing charged'"));

// 3
const route = read('src/app/api/operator/bookings/route.ts');
const ny = 'America/New_York';
ok('3. today\'s tee time: at midnight', noShowMarkOutcome('2026-11-04', ny, new Date('2026-11-04T22:30:00Z')) === 'midnight');
ok('3. a past day the next run scans: within the hour', noShowMarkOutcome('2026-11-01', ny, new Date('2026-11-04T22:30:00Z')) === 'next_hour');
ok('3. the same day an hour later: the next run (00:00Z) no longer scans it — never', noShowMarkOutcome('2026-11-01', ny, new Date('2026-11-04T23:30:00Z')) === 'never');
ok('3. far back: never', noShowMarkOutcome('2026-10-20', ny, new Date('2026-11-04T12:00:00Z')) === 'never');
ok('3. the route words each outcome', route.includes('noShowMarkOutcome(booking.teeTime.date, booking.course.timezone, new Date())') && route.includes('The hourly charge no longer reaches that day') && route.includes('Any no-show charge is taken within the hour'));
ok('3. the scan window is the one the cron uses', NO_SHOW_SCAN_DAYS === 3 && noShowScanFrom(new Date('2026-11-05T12:00:00Z')) === '2026-11-02' && read('src/lib/no-show-fee.ts').includes('const scanFrom = noShowScanFrom(now);'));

// 4
ok('4. the walk-in email uses the rate the booking was made at', route.includes('appliedRate: made.appliedRate') && !route.includes("appliedRate: 'standard'"));
ok('4. createCounterBooking returns it', read('src/lib/counter-pay.ts').includes('checkInToken: claimed.checkInToken, appliedRate, greenFeeTotal'));

// 5
const members = read('src/app/dashboard/members/page.tsx');
const terms = read('src/lib/analytics-terms.ts');
ok('5. no more "online bookings get public rates"', !members.includes('online bookings get public rates') && !terms.includes('get public rates until'));
ok('5. the words name signing in with the email', members.includes('member rates online once they sign in with this email') && terms.includes('Signing in with the email on their membership gives them member rates online'));

// 6
const tw = normalizeDbCourse({ id: 'c', slug: 's', name: 'n', schedules: [{ tierName: 'Morning', startTime: '06:00' }, { tierName: 'Twilight', startTime: '15:00' }, { tierName: 'twilight 9', startTime: '17:00' }] });
ok('6. twilight starts at the earliest "Twilight" period', tw.twilight_start === '15:00', tw.twilight_start);
ok('6. no twilight period: none (the page falls back to 4 PM)', normalizeDbCourse({ id: 'c', slug: 's', name: 'n', schedules: [{ tierName: 'standard', startTime: '06:00' }] }).twilight_start === null);
ok('6. a twilight period at noon exactly is ignored (no empty afternoon)', normalizeDbCourse({ id: 'c', slug: 's', name: 'n', schedules: [{ tierName: 'Twilight', startTime: '12:00' }] }).twilight_start === null);
ok('6. a morning period named twilight is ignored', normalizeDbCourse({ id: 'c', slug: 's', name: 'n', schedules: [{ tierName: 'Twilight', startTime: '07:00' }] }).twilight_start === null);
const golfer = read('src/app/courses/[slug]/CourseBookingClient.tsx');
ok('6. the page buckets and alert windows use it', golfer.includes("if (hm < tw) return 'afternoon';") && golfer.includes("windowStart: course?.twilight_start ?? '16:00'") && !golfer.includes('if (h < 16)'));
ok('6. both course loaders select the period name and start', read('src/lib/public-course.ts').includes('tierName: true, startTime: true') && read('src/app/api/preview/[courseId]/route.ts').includes('tierName: true, startTime: true'));

// 7
ok('7. the cart button says when it is on', golfer.includes("{withCart ? 'Cart added · tap to remove' : 'Add cart'}") && golfer.includes('aria-pressed={withCart}'));

// 8
const settings = read('src/app/dashboard/settings/page.tsx');
ok('8. the toggles say off means the public price (lib/pricing-switch makes it so)', settings.includes('Off: members pay the public price, online and at the counter.') && settings.includes('Off: residents pay the public price, online and at the counter.'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);

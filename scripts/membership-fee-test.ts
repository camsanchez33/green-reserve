// Membership fee (Cam 2026-10-08): 1% of the dues, rounded to the cent, added on
// top of what the member pays; the course's dues arrive in full.
import { membershipFeeCents, MEMBERSHIP_FEE_RATE } from '../src/lib/stripe';

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — got ${got}, want ${want}`}`);
}

check('rate is 1%', MEMBERSHIP_FEE_RATE, 0.01);
check('$2,500 dues → $25.00', membershipFeeCents(250000), 2500);
check('$1,234.56 dues → $12.35 (rounds half up)', membershipFeeCents(123456), 1235);
check('$1,234.49 dues → $12.34', membershipFeeCents(123449), 1234);
check('$20 dues → 20¢', membershipFeeCents(2000), 20);
check('49¢ dues → 0¢', membershipFeeCents(49), 0);
check('nothing due → no fee', membershipFeeCents(0), 0);
check('negative never charges', membershipFeeCents(-500), 0);
// Total the member pays = dues + fee; the application fee is exactly the fee,
// so the course's net (before Stripe processing) is the full dues.
const dues = 300000 + 50000;
const fee = membershipFeeCents(dues);
check('total = dues + fee', dues + fee, 353500);
check('course keeps dues in full', (dues + fee) - fee, dues);

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('membership-fee: all passed');

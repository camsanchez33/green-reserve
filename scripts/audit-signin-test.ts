// AUDIT-1 (Cam 2026-11-05, "run your own audit … security"): the sign-in fixes.
//  1. Texts go only to US and Canadian numbers (Twilio toll fraud).
//  2-4 covered the golfer sign-in code (request, email, phone linking) and the golfer memberships list. Cam
//  2026-11-18 retired golfer sign-in, so those routes are gone; this checks they stay gone.
// Run: npx tsx scripts/audit-signin-test.ts
import { existsSync, readFileSync } from 'fs';
import { isNorthAmericanNumber } from '../src/lib/twilio';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };

ok('a bare 10-digit number is North American', isNorthAmericanNumber('(201) 555-1234'));
ok('1 + 10 digits and +1 are North American', isNorthAmericanNumber('1-201-555-1234') && isNorthAmericanNumber('+12015551234'));
ok('a UK number is not — even though it ends in 10 US-looking digits', !isNorthAmericanNumber('+44 20 1234 5678'));
ok('a premium-rate international number is not', !isNorthAmericanNumber('+881 6 1234 5678') && !isNorthAmericanNumber('+2348012345678'));
ok('too short or too long is not', !isNorthAmericanNumber('555-1234') && !isNorthAmericanNumber('+1201555123456'));

const tw = readFileSync('src/lib/twilio.ts', 'utf8');
ok('both the code text and every other text refuse a non-North-American number', (tw.match(/!isNorthAmericanNumber\(to\)/g) ?? []).length === 2);
for (const gone of ['src/app/api/golfer/auth/otp/request/route.ts', 'src/app/api/golfer/auth/otp/verify/route.ts', 'src/app/api/golfer/memberships/route.ts', 'src/app/api/golfer/profile/route.ts', 'src/app/api/golfer/auth/accept-invite/route.ts']) {
  ok(`${gone} is retired`, !existsSync(gone));
}
ok('no golfer sign-in code email is left', !readFileSync('src/lib/email.ts', 'utf8').includes('sendGolferOtpEmail'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);

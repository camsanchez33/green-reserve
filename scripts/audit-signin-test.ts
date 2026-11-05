// AUDIT-1 (Cam 2026-11-05, "run your own audit … security"): the sign-in fixes.
//  1. Texts go only to US and Canadian numbers (Twilio toll fraud on the public code request).
//  2. The sign-in code email never carries raw HTML from the request.
//  3. A phone sign-in links only bookings with the SAME North American number.
//  4. A golfer's memberships list carries no staff notes, pay tokens or Stripe ids.
// Run: npx tsx scripts/audit-signin-test.ts
import { readFileSync } from 'fs';
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
const req = readFileSync('src/app/api/golfer/auth/otp/request/route.ts', 'utf8');
ok('the public code request refuses one before sending anything', req.includes("type === 'phone' && !isNorthAmericanNumber(identifier)"));
const em = readFileSync('src/lib/email.ts', 'utf8');
ok('the sign-in email escapes the course name it is given', em.includes('${escHtml(data.courseName.slice(0, 80))} tee times') && !em.includes('your ${data.courseName} tee times'));
const ver = readFileSync('src/app/api/golfer/auth/otp/verify/route.ts', 'utf8');
ok('phone linking compares North American numbers, never the last 10 digits of anything', ver.includes('nanp10(c.golferPhone) === last10') && !ver.includes(".slice(-10)"));
const mem = readFileSync('src/app/api/golfer/memberships/route.ts', 'utf8');
ok('the memberships list picks its fields', mem.includes('select: {') && !/(notes|payToken|savedCustomerId|duesIntentId): true|include:/.test(mem.split('export async function POST')[0]));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);

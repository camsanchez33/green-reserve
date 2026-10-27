// Cam 2026-10-27 (onboarding walk): "drop the gate" — an owner who signs in with
// a code sent to their email has proved that inbox, so they are not sent on to
// "confirm your email". A texted code proves only the phone; that owner still
// confirms by link. Real database.
// Run: npx tsx scripts/signin-code-confirms-email-db-test.ts
import { readFileSync } from 'fs';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { signPendingTwoFactorToken } from '../src/lib/auth';
import { readStoredCode } from '../src/lib/two-factor';
import { POST } from '../src/app/api/auth/2fa/verify/route';

const TAG = 'codeconfirmstest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

// Signs in with the right code, stored as `prefix + hash`.
async function signIn(n: string, prefix: string, extra: Record<string, unknown> = {}) {
  const hash = await bcrypt.hash('246810', 4);
  const op = await prisma.courseOperator.create({ data: {
    name: 'Jordan Tester', email: `${TAG}+${n}@t.local`, password: 'x', emailVerified: false, onboardingStep: 0,
    verificationToken: `${TAG}-${n}`, twoFactorCode: prefix + hash, twoFactorCodeExpiry: new Date(Date.now() + 600_000), ...extra,
  } });
  const pending = await signPendingTwoFactorToken({ operatorId: op.id });
  const res = await POST(new NextRequest('http://localhost/api/auth/2fa/verify', {
    method: 'POST', body: JSON.stringify({ code: '246810' }),
    headers: { 'content-type': 'application/json', cookie: `gr_2fa_pending=${pending}`, 'x-forwarded-for': `10.9.${n.length}.1` },
  }));
  const body = await res.json();
  const row = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  return { res, body, row };
}

(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-code-confirms-0123456789abcdef';
  await cleanup();

  ok('the stored code says which way it went', readStoredCode('email:abc').channel === 'email' && readStoredCode('sms:abc').hash === 'abc' && readStoredCode('$2a$abc').channel === null);

  const email = await signIn('email', 'email:');
  ok('a right emailed code signs in and skips "confirm your email"', email.res.status === 200 && email.body.redirect === '/dashboard/onboarding', email.body);
  ok('…and confirms the email (link spent, onboarding past step 0)', email.row.emailVerified && email.row.verificationToken === null && email.row.onboardingStep === 1 && !!email.row.lastLoginAt);

  const ahead = await signIn('ahead', 'email:', { onboardingStep: 2 });
  ok('…never moves an owner back in onboarding', ahead.row.onboardingStep === 2);

  const sms = await signIn('sms', 'sms:', { twoFactorMethod: 'sms', phone: '+15185550199' });
  ok('a texted code signs in but still asks to confirm the email', sms.res.status === 200 && sms.body.redirect === '/dashboard/verify' && !sms.row.emailVerified && sms.row.verificationToken !== null, sms.body);

  const legacy = await signIn('legacy', '');
  ok('a code stored before this change still works, and changes nothing about the email', legacy.res.status === 200 && legacy.body.redirect === '/dashboard/verify' && !legacy.row.emailVerified, legacy.body);

  const lib = readFileSync('src/lib/two-factor.ts', 'utf8');
  ok('sending a code stores the channel it went on, and an SMS that falls back to email says email', lib.includes('twoFactorCode: `${method}:${hashedCode}`') && lib.includes('twoFactorCode: `email:${hashedCode}`'));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`signin-code-confirms-email: ${failed} failed`); process.exit(1); }
  console.log('signin-code-confirms-email: all passed');
})();

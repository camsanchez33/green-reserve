// Cam 2026-10-27 (onboarding walk): a course owner is never emailed a password.
// The "set your password" link sets it once, confirms the email and — on a
// first setup with email codes — signs them straight in. Real database.
// Run: npx tsx scripts/operator-setup-link-db-test.ts
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { issueSetupLink, hasSetUp } from '../src/lib/operator-setup';
import { POST, GET } from '../src/app/api/auth/reset-password/route';

const TAG = 'setuplinktest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const tokenOf = (url: string) => new URL(url, 'https://x').searchParams.get('token') ?? '';
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const PW = 'Correct-Horse-9-Battery';

async function cleanup() {
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-setup-link-0123456789abcdef';
  await cleanup();
  const mk = (n: string, extra: Record<string, unknown> = {}) => prisma.courseOperator.create({ data: { name: 'Jordan Tester', email: `${TAG}+${n}@t.local`, password: 'x', emailVerified: false, onboardingStep: 0, ...extra } });

  const fresh = await mk('fresh');
  ok('a new owner has not set up', !hasSetUp(fresh));
  const url = await issueSetupLink(fresh.id);
  ok('the link opens the reset page in setup mode', url.includes('/dashboard/reset-password?token=') && url.endsWith('&setup=1'), url);
  const tok = tokenOf(url);
  const row = await prisma.courseOperator.findUniqueOrThrow({ where: { id: fresh.id } });
  const days = (row.resetTokenExpiry!.getTime() - Date.now()) / 86_400_000;
  ok('…lasts 7 days', days > 6.9 && days <= 7.01, days);
  ok('…and the page accepts it', (await GET(new NextRequest(`http://localhost/api/auth/reset-password?token=${tok}`))).status === 200);

  const res = await post({ token: tok, password: PW, setup: true });
  const body = await res.json();
  const after = await prisma.courseOperator.findUniqueOrThrow({ where: { id: fresh.id } });
  ok('setting the password signs a first-time owner straight in', res.status === 200 && body.signedIn === true && body.redirect === '/dashboard/onboarding' && (res.headers.get('set-cookie') ?? '').includes('gr_operator='), body);
  ok('…confirms their email and stamps the sign-in', after.emailVerified && !!after.lastLoginAt && after.onboardingStep === 1 && after.verificationToken === null);
  ok('…and the link is spent', after.resetToken === null && (await post({ token: tok, password: PW, setup: true })).status === 400);

  const sms = await mk('sms', { twoFactorMethod: 'sms', phone: '+15185550142' });
  const smsBody = await (await post({ token: tokenOf(await issueSetupLink(sms.id)), password: PW, setup: true })).json();
  ok('an owner who gets codes by text sets the password but signs in normally (the link never skips their phone)', smsBody.success === true && smsBody.signedIn === false, smsBody);

  const returning = await mk('back', { lastLoginAt: new Date(), emailVerified: true });
  ok('an owner who already signs in has set up', hasSetUp(returning));
  const backBody = await (await post({ token: tokenOf(await issueSetupLink(returning.id)), password: PW, setup: true })).json();
  ok('…and a setup-style link never signs them in by itself', backBody.signedIn === false, backBody);

  // A forgot-password token (1 hour) sent back with setup: true sets the password, never a session.
  const forgot = await mk('forgot');
  await prisma.courseOperator.update({ where: { id: forgot.id }, data: { resetToken: 'f'.repeat(64), resetTokenExpiry: new Date(Date.now() + 3_600_000) } });
  // An ordinary reset queues the password-changed email with after(), which throws
  // outside a request here — after the write, so the row still tells the story.
  await post({ token: 'f'.repeat(64), password: PW, setup: true }).catch(() => null);
  const forgotRow = await prisma.courseOperator.findUniqueOrThrow({ where: { id: forgot.id } });
  ok('a forgot-password link with setup: true is an ordinary reset (password set, no sign-in, no setup)', forgotRow.resetToken === null && forgotRow.password !== 'x' && !forgotRow.lastLoginAt && !forgotRow.emailVerified, forgotRow);

  // No owner password is emailed or returned anywhere.
  const email = readFileSync('src/lib/email.ts', 'utf8');
  ok('no email carries a temporary password', !/Temporary Password|tempPassword/.test(email));
  for (const f of ['src/app/api/preview/send/route.ts', 'src/app/api/admin/create-course/route.ts']) ok(`${f.split('/').slice(-2).join('/')} never mints or returns a password`, !readFileSync(f, 'utf8').includes('tempPassword'));
  const inq = readFileSync('src/app/api/admin/inquiries/route.ts', 'utf8');
  ok('the inquiry route (build, resend, dashboard access) never mints or returns one', !inq.includes('tempPassword'));
  ok('…and resend / dashboard access leave an owner who already signs in alone', inq.includes('if (alreadyIn) await sendPageReadyInDashboardEmail('));
  const preview = readFileSync('src/app/api/preview/send/route.ts', 'utf8');
  ok('sending a preview never touches the password', !/password:\s*hashed/.test(preview) && preview.includes('hasSetUp(op)'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('operator-setup-link: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

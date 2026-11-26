// Audit 2026-11-24 L2, L7, L13, L14 (L8 is scripts/admin-area-gate-use-test.ts).
//  L2: the inquiry sign-in code doors now write securityEvent on their refusals.
//  L7: the admin "resend staff login" email goes through letterEmail() and getResend().
//  L13: four log lines no longer write email addresses.
//  L14: per-IP limits key on the platform's header, not the client-writable left-most X-Forwarded-For.
// Real database. Run: npx tsx scripts/security-lows-db-test.ts
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { clientIp } from '../src/lib/rate-limit';
import { staffLoginLinkEmail } from '../src/lib/email-staff';
import { signChallenge, newChallengeId, macCode, SIGNIN_COOKIE } from '../src/lib/inquiry-signin';
import { POST as signinVerify } from '../src/app/api/inquiries/signin-verify/route';

let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const IP = '198.51.100.231';

(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { contains: IP } } });
  await prisma.securityEvent.deleteMany({ where: { ip: IP } });

  // ── L14 ──
  const h = (headers: Record<string, string>) => new Request('http://localhost/', { headers });
  ok('L14 the platform header wins over a client-sent X-Forwarded-For', clientIp(h({ 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '9.9.9.9' })) === '9.9.9.9');
  ok('L14 …then x-real-ip', clientIp(h({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '8.8.8.8' })) === '8.8.8.8');
  ok('L14 off the platform (local runs), X-Forwarded-For still works', clientIp(h({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })) === '1.2.3.4' && clientIp(h({})) === 'unknown');
  ok('L14 the owner alert context reads the platform header first', read('src/lib/owner-session.ts').includes("h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || h.get('x-forwarded-for')"));

  // ── L7 ──
  const e = staffLoginLinkEmail({ personName: '<script>alert(1)</script> Jo', courseName: 'Maple <b>Run</b>', to: 'jo@example.test' });
  ok('L7 a course-chosen name is escaped in the staff login email', !e.html.includes('<script>') && !e.html.includes('<b>Run</b>') && e.html.includes('&lt;b&gt;'), e.html.slice(0, 200));
  const route = read('src/app/api/admin/resend-staff-setup/route.ts');
  ok('L7 the route sends through lib/email (getResend), not its own Resend client', route.includes('sendStaffLoginLinkEmail(') && !route.includes('new Resend(') && !route.includes('html:'));

  // ── L13 ──
  ok('L13 send-reminders logs the booking id, not the address', !read('src/app/api/cron/send-reminders/route.ts').includes('Reminder failed for ${booking.golferEmail}'));
  ok('L13 the inquiry honeypot log has no address', !/honeypot hit[^\n]*email=/.test(read('src/app/api/inquiries/route.ts')));
  ok('L13 the 2FA send log has no address', !read('src/lib/two-factor.ts').includes("'[2fa] sending via email to:', operator.email"));
  ok('L13 the announcement failure log has no address', !read('src/app/api/admin/broadcasts/route.ts').includes("'Announcement email failed for', operators[i].email"));

  // ── L2 ──
  const cid = newChallengeId();
  const cookie = await signChallenge({ inquiryId: 'no-such-inquiry', cid, codeMac: macCode(cid, '123456') });
  const r = await signinVerify(new NextRequest('http://localhost/api/inquiries/signin-verify', {
    method: 'POST', body: JSON.stringify({ code: '000000' }), headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, cookie: `${SIGNIN_COOKIE}=${cookie}` },
  }));
  const ev = await prisma.securityEvent.count({ where: { ip: IP, kind: 'second_factor_failed', detail: 'inquiry sign-in code, wrong code' } });
  ok('L2 a wrong inquiry sign-in code is a security event', r.status === 400 && ev === 1, { s: r.status, ev });
  const code = read('src/app/api/inquiries/signin-code/route.ts');
  ok('L2 signin-code records a rate limit and an off-file probe (and still answers blind)', code.includes("detail: 'inquiry sign-in code' })") && code.includes("detail: 'inquiry sign-in code asked from an email not on file — nothing sent' });\n    return blind();"));

  await prisma.rateLimit.deleteMany({ where: { key: { contains: IP } } });
  await prisma.securityEvent.deleteMany({ where: { ip: IP } });
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

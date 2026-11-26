// Audit 2026-11-24 M4, M5, L1, L12: sessions that a password change, reset or sign-out really ends,
// and a change-password form that can't be used to guess the current password.
//  M4: operator change-password took a killed cookie (no sessionVersion check) and had no guess limit,
//      so a stolen cookie could guess the password and mint a fresh live one. Admin had no limit either.
//  M5: an admin employee's cookie lived its full 12h through a password change, reset or sign-out.
//  L1: four more operator routes skipped the sessionVersion check.
//  L12: operator sign-out cleared only the browser's cookie.
// Real database. Run: npx tsx scripts/session-revoke-db-test.ts
import { readFileSync } from 'fs';
import bcrypt from 'bcryptjs';
import { decodeJwt } from 'jose';
import { NextRequest } from 'next/server';

// next/headers only works inside a real request: route handlers here read this jar instead.
let jar: Record<string, string> = {};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({
  get: (n: string) => (jar[n] ? { name: n, value: jar[n] } : undefined),
  getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
  has: (n: string) => n in jar,
  set: () => {},
});
// `after()` needs a request scope too: here it just runs the work (the email fails without a key; that's fine).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextServer = require('next/server');
nextServer.after = (task: unknown) => { void Promise.resolve(typeof task === 'function' ? (task as () => unknown)() : task).catch(() => {}); };

import { prisma } from '../src/lib/prisma';
import { signToken, signStaffToken } from '../src/lib/auth';
import { liveOperatorSession } from '../src/lib/session';
import { signAdminToken, resolveAdminSession, endEmployeeSession } from '../src/lib/admin-session';
import { CHANGE_PASSWORD_TRIES } from '../src/lib/password-change-guard';
import { POST as opChangePassword } from '../src/app/api/operator/change-password/route';
import { POST as adminChangePassword } from '../src/app/api/admin/change-password/route';
import { POST as opLogout } from '../src/app/api/auth/logout/route';
import { POST as adminLogout } from '../src/app/api/admin/logout/route';
import { GET as myCourses } from '../src/app/api/operator/my-courses/route';
import { POST as onboardingComplete } from '../src/app/api/operator/onboarding-complete/route';
import { POST as activeCourse } from '../src/app/api/operator/active-course/route';
import { POST as resendVerification } from '../src/app/api/auth/resend-verification/route';

const TAG = 'sessrevoketest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const admins = (await prisma.adminUser.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } })).map(a => a.id);
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { startsWith: 'change-pw:' } }, { key: { contains: '203.0.113.' } }] } });
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.adminAuditLog?.deleteMany?.({ where: { adminId: { in: admins } } }).catch(() => {});
  await prisma.courseStaff.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: TAG } } });
}

let ipN = 0;
const req = (url: string, body: unknown, cookies: Record<string, string>) => {
  const ip = `203.0.113.${(ipN++ % 250) + 1}`;
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) } });
};
const cookieOut = (res: Response, name: string) => {
  const m = (res.headers.get('set-cookie') ?? '').match(new RegExp(`${name}=([^;]*)`));
  return m ? m[1] : null;
};

(async () => {
  await cleanup();
  const hash = await bcrypt.hash('right-password-1', 4);

  // ── L1: the operator routes refuse a killed cookie ──
  const op = await prisma.courseOperator.create({ data: { name: 'Rev Owner', email: `${TAG}+op@t.local`, password: hash, emailVerified: false } });
  const course = await prisma.course.create({ data: { name: 'Rev GC', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const liveTok = await signToken({ operatorId: op.id, email: op.email, sv: 0 });
  jar = { gr_operator: liveTok };
  ok('L1 a live cookie is a live session', !!(await liveOperatorSession()));
  await prisma.courseOperator.update({ where: { id: op.id }, data: { sessionVersion: 1 } });
  ok('L1 the same cookie after a password reset is no session', (await liveOperatorSession()) === null);
  ok('L1 my-courses refuses it', (await myCourses()).status === 401);
  ok('L1 active-course refuses it', (await activeCourse(req('/api/operator/active-course', { courseId: course.id }, jar))).status === 401);
  ok('L1 onboarding-complete refuses it', (await onboardingComplete()).status === 401);
  ok('L1 resend-verification refuses it', (await resendVerification()).status === 401);
  for (const f of ['src/app/api/operator/my-courses/route.ts', 'src/app/api/operator/active-course/route.ts', 'src/app/api/operator/onboarding-complete/route.ts', 'src/app/api/auth/resend-verification/route.ts', 'src/app/api/operator/change-password/route.ts']) {
    ok(`L1 ${f.split('/').slice(-2, -1)[0]} no longer trusts the signature alone`, !read(f).includes('getOperatorSession()'));
  }

  // ── M4: operator change-password ──
  const opBody = (current: string) => ({ currentPassword: current, newPassword: 'A-new-password-42!' });
  ok('M4 a killed cookie can no longer reach change-password', (await opChangePassword(req('/api/operator/change-password', opBody('right-password-1'), jar))).status === 401);
  const tok1 = await signToken({ operatorId: op.id, email: op.email, sv: 1 });
  jar = { gr_operator: tok1 };
  const burst = await Promise.all(Array.from({ length: 10 }, () => opChangePassword(req('/api/operator/change-password', opBody('wrong-guess'), jar)).then(r => r.status)));
  ok(`M4 10 guesses at once: ${CHANGE_PASSWORD_TRIES} are compared, the rest refused`, burst.filter(s => s === 400).length === CHANGE_PASSWORD_TRIES && burst.filter(s => s === 429).length === 10 - CHANGE_PASSWORD_TRIES, burst);
  const rightAfter = await opChangePassword(req('/api/operator/change-password', opBody('right-password-1'), jar));
  ok('M4 past the limit even the right password waits', rightAfter.status === 429);
  const wrongEvents = await prisma.securityEvent.count({ where: { accountId: op.id, kind: 'signin_failed', detail: 'change password, wrong current password' } });
  ok('M4 each wrong current password is a security event', wrongEvents === CHANGE_PASSWORD_TRIES, wrongEvents);
  await prisma.rateLimit.deleteMany({ where: { key: `change-pw:operator:${op.id}` } });
  const changed = await opChangePassword(req('/api/operator/change-password', opBody('right-password-1'), jar));
  const opAfter = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  const newOpTok = cookieOut(changed, 'gr_operator');
  ok('M4 the right password changes it and bumps the version', changed.status === 200 && opAfter.sessionVersion === 2 && await bcrypt.compare('A-new-password-42!', opAfter.password));
  ok('M4 …this device keeps a cookie at the new version', !!newOpTok && (decodeJwt(newOpTok!) as { sv?: number }).sv === 2);
  ok('M4 …and password_changed is a security event', (await prisma.securityEvent.count({ where: { accountId: op.id, kind: 'password_changed' } })) === 1);
  ok('M4 …and the old cookie is dead', (await (async () => { jar = { gr_operator: tok1 }; return liveOperatorSession(); })()) === null);

  // ── L12: operator and staff sign-out end the session on the server ──
  const tok2 = newOpTok!;
  jar = { gr_operator: tok2 };
  await opLogout(req('/api/auth/logout', {}, { gr_operator: tok1 }));
  ok('L12 signing out with a dead cookie signs nobody out', (await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).sessionVersion === 2 && !!(await liveOperatorSession()));
  await opLogout(req('/api/auth/logout', {}, { gr_operator: tok2 }));
  ok('L12 signing out bumps the version, so a copy of the cookie dies too', (await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).sessionVersion === 3 && (await liveOperatorSession()) === null);
  const staff = await prisma.courseStaff.create({ data: { courseId: course.id, name: 'Rev Staff', email: `${TAG}+staff@t.local`, password: hash, active: true } });
  const sTok = await signStaffToken({ staffId: staff.id, courseId: course.id, email: staff.email, sv: 0 });
  jar = { gr_operator: sTok };
  ok('L12 a staff cookie is live before sign-out', !!(await liveOperatorSession()));
  await opLogout(req('/api/auth/logout', {}, { gr_operator: sTok }));
  ok('L12 staff sign-out ends it on the server', (await liveOperatorSession()) === null && (await prisma.courseStaff.findUniqueOrThrow({ where: { id: staff.id } })).sessionVersion === 1);
  const noCookie = await opLogout(req('/api/auth/logout', {}, {}));
  ok('L12 sign-out with no cookie still answers success', noCookie.status === 200);

  // ── M5: admin employee sessions ──
  const emp = await prisma.adminUser.create({ data: { name: 'Rev Emp', email: `${TAG}+emp@t.local`, passwordHash: hash, role: 'manager', active: true } });
  const empTok = await signAdminToken({ adminId: emp.id, email: emp.email, name: emp.name, role: 'manager', sv: 0 });
  jar = { admin_session: empTok };
  ok('M5 a live employee cookie is a session', !!(await resolveAdminSession()));
  const legacy = await signAdminToken({ adminId: emp.id, email: emp.email, name: emp.name, role: 'manager' });
  jar = { admin_session: legacy };
  ok('M5 a token from before this change (no sv) still works while the version is 0', !!(await resolveAdminSession()));

  jar = { admin_session: empTok };
  const adminBody = (current: string) => ({ currentPassword: current, newPassword: 'A-new-password-42!' });
  const aBurst = await Promise.all(Array.from({ length: 8 }, () => adminChangePassword(req('/api/admin/change-password', adminBody('wrong-guess'), jar), undefined).then(r => r.status)));
  ok(`M4 admin: 8 guesses at once, ${CHANGE_PASSWORD_TRIES} compared and the rest refused`, aBurst.filter(s => s === 401).length === CHANGE_PASSWORD_TRIES && aBurst.filter(s => s === 429).length === 8 - CHANGE_PASSWORD_TRIES, aBurst);
  ok('M4 admin: each wrong current password is a security event', (await prisma.securityEvent.count({ where: { accountId: emp.id, kind: 'signin_failed' } })) === CHANGE_PASSWORD_TRIES);
  await prisma.rateLimit.deleteMany({ where: { key: `change-pw:admin:${emp.id}` } });
  const empExp = decodeJwt(empTok).exp;
  const aChanged = await adminChangePassword(req('/api/admin/change-password', adminBody('right-password-1'), jar), undefined);
  const reissued = cookieOut(aChanged, 'admin_session');
  ok('M5 the right password changes it', aChanged.status === 200 && (await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } })).sessionVersion === 1, aChanged.status);
  ok('M5 …every other cookie, including a copy of this one, is dead', (await resolveAdminSession()) === null);
  ok('M5 …this device gets a cookie at the new version that ends when the old one would have (no renewal)', !!reissued && (decodeJwt(reissued!) as { sv?: number }).sv === 1 && decodeJwt(reissued!).exp === empExp);
  jar = { admin_session: reissued! };
  ok('M5 …and that cookie works', !!(await resolveAdminSession()));

  await adminLogout(req('/api/admin/logout', {}, { admin_session: empTok }));
  ok('M5 sign-out with a dead cookie signs nobody out', (await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } })).sessionVersion === 1);
  await adminLogout(req('/api/admin/logout', {}, { admin_session: reissued! }));
  ok('M5 sign-out ends the session on the server', (await resolveAdminSession()) === null && (await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } })).sessionVersion === 2);
  await endEmployeeSession('not-a-token');
  ok('M5 a bad token on sign-out throws nothing', true);

  ok('M5 the owner resetting an employee bumps their version', /reset_password[\s\S]*sessionVersion: \{ increment: 1 \}/.test(read('src/app/api/admin/employees/route.ts')));
  const setPw = read('src/app/api/admin/set-password/route.ts');
  ok('M5 set-password (Forgot password, first password) bumps the version and ends the owner\'s sessions', setPw.includes('sessionVersion: { increment: 1 }') && setPw.includes('revokeAllOwnerSessions(admin.id)'));
  ok('M5 the employee sign-in puts the version in the token', read('src/app/api/admin/login/route.ts').includes('sv: admin.sessionVersion'));

  jar = {};
  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

// Audit 2026-11-24 M3 and M8: sign-in counters that a burst of requests can't race.
//  M3: six wrong passwords sent at once all wrote "read + 1", so a real account never locked, while an
//      unknown email (counted atomically) answered 429 — which told the two apart. Now each try is
//      claimed before the compare: a burst gets exactly 5 compares on a real account, and the answers
//      match an unknown email's answer for answer.
//  M8: the second-factor counter raced the same way, and /cam set it back to 0 on every right password.
//      Now a try is claimed against the exact code, a right code is used once, and new codes are capped.
// Real database. Run: npx tsx scripts/login-race-db-test.ts
import { readFileSync } from 'fs';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { signPendingTwoFactorToken } from '../src/lib/auth';
import { claimSecondFactorAttempt, spendSecondFactorIfOut, useSecondFactorCode, mayIssueSecondFactor, SECOND_FACTOR_ISSUES_PER_HOUR, claimPasswordAttempt } from '../src/lib/login-guard';
import { issueTwoFactorCode, TooManyCodesError } from '../src/lib/two-factor';
import { POST as opLogin } from '../src/app/api/auth/login/route';
import { POST as adminLogin } from '../src/app/api/admin/login/route';
import { POST as opVerify } from '../src/app/api/auth/2fa/verify/route';

const TAG = 'loginracetest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b).join(',');

async function cleanup() {
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: TAG } }, { key: { contains: '198.51.100.' } }, { key: { startsWith: '2fa-issue:' } }] } });
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.courseStaff.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: TAG } } });
}

let ipN = 0;
const post = (handler: (r: NextRequest) => Promise<Response>, url: string, body: unknown, cookie = '') => {
  // Each request from its own address, so the per-IP caps never decide the answer here.
  const ip = `198.51.100.${(ipN++ % 250) + 1}`;
  return handler(new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) } }));
};
const burst = async (n: number, f: () => Promise<Response>) => (await Promise.all(Array.from({ length: n }, f))).map(r => r.status);

(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-login-race-0123456789abcdef';
  await cleanup();
  const hash = await bcrypt.hash('right-password-1', 4);

  // ── M3: a burst of wrong passwords on each kind of real account vs an unknown email ──
  const op = await prisma.courseOperator.create({ data: { name: 'Race Owner', email: `${TAG}+op@t.local`, password: hash, emailVerified: true } });
  const course = await prisma.course.create({ data: { name: 'Race GC', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const staff = await prisma.courseStaff.create({ data: { courseId: course.id, name: 'Race Staff', email: `${TAG}+staff@t.local`, password: hash, active: true } });
  const admin = await prisma.adminUser.create({ data: { name: 'Race Admin', email: `${TAG}+admin@t.local`, passwordHash: hash, role: 'viewer', active: true } });

  const opWrong = await burst(8, () => post(opLogin, '/api/auth/login', { email: op.email, password: 'wrong-guess' }));
  const opRow = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  ok('M3 owner: 8 wrong at once → 4 "invalid", then locked', sorted(opWrong) === '401,401,401,401,429,429,429,429', opWrong);
  ok('M3 owner: exactly 5 tries counted, and the account is locked', opRow.failedLoginAttempts === 5 && !!opRow.lockoutUntil && opRow.lockoutUntil > new Date(), { n: opRow.failedLoginAttempts, l: opRow.lockoutUntil });
  const lockMinutes = opRow.lockoutUntil ? (opRow.lockoutUntil.getTime() - Date.now()) / 60000 : 0;
  ok('M3 owner: the lock is 15 minutes from now (UTC column read back as UTC)', lockMinutes > 14 && lockMinutes <= 15.1, lockMinutes);
  const whileLocked = await post(opLogin, '/api/auth/login', { email: op.email, password: 'right-password-1' });
  ok('M3 owner: even the right password waits out the lock', whileLocked.status === 429);

  const unknownWrong = await burst(8, () => post(opLogin, '/api/auth/login', { email: `${TAG}+nobody@t.local`, password: 'wrong-guess' }));
  ok('M3 an unknown email answers the same burst the same way (no enumeration)', sorted(unknownWrong) === sorted(opWrong), { unknownWrong, opWrong });

  const staffWrong = await burst(8, () => post(opLogin, '/api/auth/login', { email: staff.email, password: 'wrong-guess' }));
  const staffRow = await prisma.courseStaff.findUniqueOrThrow({ where: { id: staff.id } });
  ok('M3 staff: the same burst locks after exactly 5', sorted(staffWrong) === sorted(opWrong) && staffRow.failedLoginAttempts === 5 && !!staffRow.lockoutUntil, { staffWrong, n: staffRow.failedLoginAttempts });

  const adminWrong = await burst(8, () => post(adminLogin, '/api/admin/login', { email: admin.email, password: 'wrong-guess' }));
  const adminUnknown = await burst(8, () => post(adminLogin, '/api/admin/login', { email: `${TAG}+noadmin@t.local`, password: 'wrong-guess' }));
  const adminRow = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
  ok('M3 admin: locks after exactly 5, and an unknown email answers alike', sorted(adminWrong) === '401,401,401,401,429,429,429,429' && sorted(adminUnknown) === sorted(adminWrong) && adminRow.failedLoginAttempts === 5, { adminWrong, adminUnknown, n: adminRow.failedLoginAttempts });

  // The lock runs out: the next wrong one relocks at once; the right one clears everything.
  await prisma.courseOperator.update({ where: { id: op.id }, data: { lockoutUntil: new Date(Date.now() - 1000) } });
  const relock = await burst(3, () => post(opLogin, '/api/auth/login', { email: op.email, password: 'wrong-guess' }));
  ok('M3 after the lock: a burst of 3 wrong gets one compare and three 429s', sorted(relock) === '429,429,429' && (await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).failedLoginAttempts === 6, relock);
  await prisma.courseOperator.update({ where: { id: op.id }, data: { lockoutUntil: new Date(Date.now() - 1000) } });
  const right = await post(opLogin, '/api/auth/login', { email: op.email, password: 'right-password-1' });
  const cleared = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  ok('M3 after the lock: the right password signs in and clears the counter and the lock', right.status === 200 && cleared.failedLoginAttempts === 0 && cleared.lockoutUntil === null, { s: right.status, n: cleared.failedLoginAttempts, l: cleared.lockoutUntil });

  // The 5th try being the right one still signs in (the claim's early lock is lifted).
  await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 4, lockoutUntil: null } });
  const fifthRight = await post(adminLogin, '/api/admin/login', { email: admin.email, password: 'right-password-1' });
  const a2 = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
  ok('M3 the 5th try being right signs in and leaves no lock', fifthRight.status === 200 && a2.failedLoginAttempts === 0 && a2.lockoutUntil === null, { s: fifthRight.status, a2: [a2.failedLoginAttempts, a2.lockoutUntil] });
  const claimGone = await claimPasswordAttempt('staff', 'no-such-id');
  ok('M3 a claim on a row that is gone refuses', claimGone.claimed === false);

  // ── M8: operator sign-in codes ──
  const codeHash = await bcrypt.hash('246810', 4);
  const setCode = () => prisma.courseOperator.update({ where: { id: op.id }, data: { twoFactorCode: `email:${codeHash}`, twoFactorCodeExpiry: new Date(Date.now() + 600_000), twoFactorAttempts: 0 } });
  await setCode();
  const pending = `gr_2fa_pending=${await signPendingTwoFactorToken({ operatorId: op.id })}`;
  const wrongCodes = await burst(8, () => post(opVerify, '/api/auth/2fa/verify', { code: '000000' }, pending));
  const afterWrong = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  ok('M8 8 wrong codes at once: all refused, and the code is thrown away after 5', wrongCodes.every(s => s === 400) && afterWrong.twoFactorCode === null && afterWrong.twoFactorAttempts === 0, { wrongCodes, c: afterWrong.twoFactorCode, n: afterWrong.twoFactorAttempts });
  const evs = await prisma.securityEvent.count({ where: { accountId: op.id, kind: 'second_factor_failed', detail: 'sign-in code' } });
  ok('M8 exactly 5 codes were compared', evs === 5, evs);

  await setCode();
  const twoRight = await burst(2, () => post(opVerify, '/api/auth/2fa/verify', { code: '246810' }, pending));
  ok('M8 one right code sent twice at once signs in once', sorted(twoRight) === '200,400', twoRight);
  const numberCode = await post(opVerify, '/api/auth/2fa/verify', { code: 246810 }, pending);
  ok('M8 a code that is not a string is refused before any lookup', numberCode.status === 400);

  await setCode();
  await prisma.courseOperator.update({ where: { id: op.id }, data: { twoFactorAttempts: 3 } });
  await prisma.courseOperator.update({ where: { id: op.id }, data: { twoFactorCode: `email:${await bcrypt.hash('135790', 4)}` } });
  const afterNewCode = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  ok('M8 a new code does not give the tries back (only a right code or running out does)', afterNewCode.twoFactorAttempts === 3);

  // Codes per account are capped.
  await prisma.rateLimit.deleteMany({ where: { key: `2fa-issue:operator:${op.id}` } });
  const allowed: boolean[] = [];
  for (let i = 0; i < SECOND_FACTOR_ISSUES_PER_HOUR + 1; i++) allowed.push(await mayIssueSecondFactor('operator', op.id));
  ok(`M8 ${SECOND_FACTOR_ISSUES_PER_HOUR} codes an hour per account, then no more`, allowed.filter(Boolean).length === SECOND_FACTOR_ISSUES_PER_HOUR && allowed[allowed.length - 1] === false);
  const before = (await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).twoFactorCode;
  const capErr = await issueTwoFactorCode(await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).then(() => null, e => e);
  ok('M8 past the cap no code is made or sent', capErr instanceof TooManyCodesError && (await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).twoFactorCode === before);
  await prisma.courseOperator.update({ where: { id: op.id }, data: { lockoutUntil: null, failedLoginAttempts: 0 } });
  const capLogin = await post(opLogin, '/api/auth/login', { email: op.email, password: 'right-password-1' });
  ok('M8 the right password past the cap answers 429, not a code page', capLogin.status === 429);

  // ── M8: the owner's (/cam) counter, through the same helpers /cam uses ──
  const owner = await prisma.adminUser.create({ data: { name: 'Race Owner', email: `${TAG}+owner@t.local`, passwordHash: hash, role: 'owner', active: true, twoFactorCode: 'totp-pending', twoFactorCodeExpiry: new Date(Date.now() + 600_000) } });
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimSecondFactorAttempt('admin', owner.id, 'totp-pending')));
  ok('M8 /cam: 8 tries at once, exactly 5 claimed', claims.filter(Boolean).length === 5, claims);
  ok('M8 /cam: out of tries throws the pending step away', await spendSecondFactorIfOut('admin', owner.id) && (await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } })).twoFactorCode === null);
  await prisma.adminUser.update({ where: { id: owner.id }, data: { twoFactorCode: 'totp-pending', twoFactorAttempts: 0 } });
  ok('M8 /cam: a try against a step that was replaced is refused', !(await claimSecondFactorAttempt('admin', owner.id, 'totp-pending:123')));
  const uses = await Promise.all([1, 2].map(() => useSecondFactorCode('admin', owner.id, 'totp-pending', { twoFactorCode: null, twoFactorCodeExpiry: null })));
  ok('M8 /cam: a right code used twice at once is used once', uses.filter(Boolean).length === 1, uses);

  const cam = read('src/app/api/cam/login/route.ts');
  const pendingFn = cam.slice(cam.indexOf('async function setTotpPending'), cam.indexOf('/** Signed in'));
  ok('M8 /cam: a right password no longer sets the try counter back to 0', !/twoFactorAttempts:\s*0/.test(pendingFn) && !/twoFactorCode: hashedCode, twoFactorCodeExpiry: expiry, twoFactorAttempts/.test(cam));
  ok('M8 /cam: every second-factor path claims first and uses the code once', (cam.match(/claimSecondFactorAttempt\(/g) ?? []).length === 2 && (cam.match(/useSecondFactorCode\(/g) ?? []).length === 3 && !/admin\.twoFactorAttempts \+ 1/.test(cam));
  ok('M8 /cam: second-factor steps are capped per account', cam.includes("mayIssueSecondFactor('admin', admin.id)"));
  ok('M3 /cam: the password try is claimed first', cam.includes("claimPasswordAttempt('admin', admin.id)") && !/failedLoginAttempts \+ 1/.test(cam));
  for (const f of ['src/app/api/auth/login/route.ts', 'src/app/api/admin/login/route.ts', 'src/app/api/auth/2fa/verify/route.ts']) {
    ok(`no read-then-write counter left in ${f}`, !/(failedLoginAttempts|twoFactorAttempts) \+ 1/.test(read(f)));
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

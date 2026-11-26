// Security audit 2026-11-24: M2 (a JSON object as a Prisma filter on /api/auth/verify), M14
// (a non-string password told real accounts from unknown ones) and L10 (secrets compared in
// constant time, every JWT verify pinned to HS256).
// Needs a database. Run: npx tsx scripts/input-compares-db-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { verifyToken } from '../src/lib/auth';
import { secretEquals } from '../src/lib/secret-compare';
import { cronAuthFailure } from '../src/lib/cron-auth';
import { POST as verifyPOST } from '../src/app/api/auth/verify/route';
import { POST as loginPOST } from '../src/app/api/auth/login/route';
import { POST as adminLoginPOST } from '../src/app/api/admin/login/route';

const prisma = new PrismaClient();
const TAG = 'inputcmptest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failed++; };

let ipN = 0;
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${(ipN++ % 200) + 1}` },
});

async function cleanup() {
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'verify-email:203.0.113.' } } });
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set (as in CI): the algorithm check signs with it');
  await cleanup();

  // L10: the compare helper.
  check('secretEquals: equal secrets match', secretEquals('Bearer abc', 'Bearer abc'));
  check('secretEquals: a different or longer secret does not', !secretEquals('Bearer abd', 'Bearer abc') && !secretEquals('Bearer abcx', 'Bearer abc'));
  check('secretEquals: an unset expected secret never matches, even an empty header', !secretEquals('', '') && !secretEquals('x', undefined) && !secretEquals(null, 'x'));
  process.env.CRON_SECRET = 'cron-test-secret';
  const cron = (h?: string) => cronAuthFailure(new NextRequest('http://localhost/api/cron/hourly', { headers: h ? { authorization: h } : {} }));
  check('cron: the right bearer passes', cron('Bearer cron-test-secret') === null);
  check('cron: a wrong or missing bearer is 401', cron('Bearer cron-test-secreT')?.status === 401 && cron()?.status === 401);
  delete process.env.CRON_SECRET;
  check('cron: no CRON_SECRET still refuses (503)', cron('Bearer ')?.status === 503);

  const src = (f: string) => readFileSync(f, 'utf8');
  check('cron-auth and bootstrap compare through secretEquals', /secretEquals\(req\.headers\.get\('authorization'\)/.test(src('src/lib/cron-auth.ts')) && /secretEquals\(secret, process\.env\.ADMIN_SECRET\)/.test(src('src/app/api/admin/bootstrap/route.ts')));
  const walk = (d: string, out: string[] = []): string[] => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); } return out; };
  const unpinned = walk('src').flatMap(f => src(f).split('\n').map((l, i) => ({ f, i: i + 1, l })).filter(x => /jwtVerify\(/.test(x.l) && !/import/.test(x.l) && !/algorithms: \['HS256'\]/.test(x.l)).map(x => `${x.f}:${x.i}`));
  check('every jwtVerify pins HS256', unpinned.length === 0, unpinned);
  // Behaviour, not only source: a token signed with the right secret but another algorithm is refused.
  const key = new TextEncoder().encode(process.env.JWT_SECRET!);
  const hs384 = await new SignJWT({ type: 'operator', operatorId: 'x' }).setProtectedHeader({ alg: 'HS384' }).setExpirationTime('1h').sign(key);
  const hs256 = await new SignJWT({ type: 'operator', operatorId: 'x' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key);
  check('a right-secret HS384 token is refused; the same token as HS256 is accepted', (await verifyToken(hs384)) === null && !!(await verifyToken(hs256)));

  // M2: a filter object never reaches the query.
  const token = randomBytes(32).toString('hex');
  const op = await prisma.courseOperator.create({ data: { name: 'Verify Test', email: `${TAG}-a@test.local`, password: 'x', verificationToken: token, emailVerified: false } });
  for (const bad of [{ not: '' }, { contains: '' }, ['x'], 123, 'not-hex', token.toUpperCase()]) {
    const r = await verifyPOST(post('/api/auth/verify', { token: bad }));
    check(`verify: token ${JSON.stringify(bad).slice(0, 20)} is refused with 400`, r.status === 400, r.status);
  }
  check('verify: a body that is not JSON, or is null, is 400, not 500', (await verifyPOST(post('/api/auth/verify', '{nope'))).status === 400 && (await verifyPOST(post('/api/auth/verify', 'null'))).status === 400);
  check('verify: after all that, the operator is still unverified', (await prisma.courseOperator.findUnique({ where: { id: op.id } }))?.emailVerified === false);
  const ok = await verifyPOST(post('/api/auth/verify', { token }));
  const after = await prisma.courseOperator.findUnique({ where: { id: op.id } });
  check('verify: the real token still verifies and is burned', ok.status === 200 && after?.emailVerified === true && after?.verificationToken === null, ok.status);
  const capped = [];
  for (let i = 0; i < 21; i++) {
    capped.push((await verifyPOST(new NextRequest('http://localhost/api/auth/verify', { method: 'POST', body: JSON.stringify({ token: 'x' }), headers: { 'x-forwarded-for': '203.0.113.250' } }))).status);
  }
  check('verify: capped per connection (the 21st try is 429)', capped[19] === 400 && capped[20] === 429, capped.slice(-3));

  // M14: a non-string password answers 400 before any lookup, for a real email and an unknown one alike.
  const real = `${TAG}-b@test.local`;
  await prisma.courseOperator.create({ data: { name: 'Login Test', email: real, password: '$2a$12$abcdefghijklmnopqrstuuJ4H0r8m0v9Wq8q8q8q8q8q8q8q8q8q8' } });
  for (const [label, fn] of [['course', loginPOST], ['admin', adminLoginPOST]] as const) {
    for (const email of [real, `${TAG}-nobody@test.local`]) {
      for (const password of [123, { a: 1 }, ['x'], true]) {
        const r = await fn(post(`/api/${label === 'admin' ? 'admin' : 'auth'}/login`, { email, password }));
        check(`${label} login: password ${JSON.stringify(password)} for ${email === real ? 'a real' : 'an unknown'} email is 400`, r.status === 400, r.status);
      }
    }
    const r = await fn(post('/api/auth/login', { email: { not: '' }, password: 'x' }));
    check(`${label} login: an object email is 400`, r.status === 400, r.status);
    check(`${label} login: a null body is 400`, (await fn(post('/api/auth/login', 'null'))).status === 400);
  }
  const op2 = await prisma.courseOperator.findUnique({ where: { email: real } });
  check('login: none of those counted as a failed try', op2?.failedLoginAttempts === 0, op2?.failedLoginAttempts);

  await cleanup();
  await prisma.rateLimit.deleteMany({ where: { key: { in: [...Array(201).keys()].flatMap(i => [`login:op:203.0.113.${i}`, `login:admin:203.0.113.${i}`]) } } });
}

main()
  .catch(err => { console.error(err); failed++; })
  .finally(async () => {
    await prisma.$disconnect();
    if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
    console.log('\nAll input and compare checks passed');
  });

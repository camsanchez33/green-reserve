// Audit 2026-11-24 M9: reset, setup and set-password links are stored as a SHA-256, never the token,
// so reading the database (a leaked backup, a logged row) no longer hands over an account; and admin
// set-password's write is conditional, so two submits of one link can't both land.
// Real database. Run: npx tsx scripts/hashed-tokens-db-test.ts
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

// after() and next/headers need a request scope: here after() work is queued and run by the test.
const queued: (() => unknown)[] = [];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextServer = require('next/server');
nextServer.after = (task: unknown) => { queued.push(typeof task === 'function' ? (task as () => unknown) : () => task); };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextHeaders = require('next/headers');
nextHeaders.headers = async () => new Headers({ 'user-agent': 'test-browser' });
nextHeaders.cookies = async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {} });
const runAfter = async () => { while (queued.length) await Promise.resolve(queued.shift()!()).catch(() => {}); };

import { prisma } from '../src/lib/prisma';
import { hashToken, tokenMatches } from '../src/lib/token-hash';
import { issueSetupLink } from '../src/lib/operator-setup';
import { signAdminSetPasswordToken } from '../src/lib/admin-session';
import { GET as resetGet, POST as resetPost } from '../src/app/api/auth/reset-password/route';
import { POST as opForgot } from '../src/app/api/auth/forgot-password/route';
import { POST as adminForgot } from '../src/app/api/admin/forgot-password/route';
import { POST as setPassword } from '../src/app/api/admin/set-password/route';

const TAG = 'hashedtokentest';
const PW = 'A-strong-password-42!';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const isSha = (v: string | null) => !!v && /^[a-f0-9]{64}$/.test(v);

async function cleanup() {
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: TAG } }, { key: { contains: '198.18.0.' } }] } });
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: TAG } } });
}
let ipN = 0;
const post = (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) => h(new NextRequest(`http://localhost${url}`, {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.18.0.${(ipN++ % 250) + 1}` },
}));
const get = (token: string) => resetGet(new NextRequest(`http://localhost/api/auth/reset-password?token=${encodeURIComponent(token)}`));

(async () => {
  process.env.RESEND_API_KEY = '';
  await cleanup();
  ok('hashToken is SHA-256 hex', hashToken('abc') === createHash('sha256').update('abc').digest('hex'));
  ok('tokenMatches: right, wrong, missing', tokenMatches('abc', hashToken('abc')) && !tokenMatches('abd', hashToken('abc')) && !tokenMatches('abc', null) && !tokenMatches('abc', 'short'));

  // ── Owner setup link ──
  const op = await prisma.courseOperator.create({ data: { name: 'Hash Owner', email: `${TAG}+op@t.local`, password: 'x' } });
  const link = await issueSetupLink(op.id);
  const token = new URL(link, 'http://x').searchParams.get('token')!;
  const row = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  ok('setup link: the column holds the hash, not the token', row.resetToken === hashToken(token) && row.resetToken !== token);
  ok('setup link: someone who read the column cannot use what they read', (await get(row.resetToken!)).status === 400 && (await post(resetPost, '/api/auth/reset-password', { token: row.resetToken, password: PW, setup: true })).status === 400);
  ok('setup link: the emailed token still opens the page', (await get(token)).status === 200);
  const set = await post(resetPost, '/api/auth/reset-password', { token, password: PW, setup: true });
  ok('setup link: and sets the password once', set.status === 200 && (await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } })).resetToken === null);
  ok('setup link: a second use is refused', (await post(resetPost, '/api/auth/reset-password', { token, password: PW, setup: true })).status === 400);
  ok('reset-password refuses a token that is not a string', (await post(resetPost, '/api/auth/reset-password', { token: { not: '' }, password: PW })).status === 400);

  // ── Owner forgot-password ──
  await post(opForgot, '/api/auth/forgot-password', { email: op.email });
  await runAfter();
  const fRow = await prisma.courseOperator.findUniqueOrThrow({ where: { id: op.id } });
  ok('forgot password: a reset is stored as a hash', isSha(fRow.resetToken) && (await get(fRow.resetToken!)).status === 400);

  // ── Admin set-password links ──
  const emp = await prisma.adminUser.create({ data: { name: 'Hash Emp', email: `${TAG}+emp@t.local`, passwordHash: 'x', role: 'support', active: true } });
  await post(adminForgot, '/api/admin/forgot-password', { email: emp.email });
  await runAfter();
  const aRow = await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } });
  ok('admin forgot password: the link is stored as a hash, not the signed token', isSha(aRow.setPasswordToken) && !aRow.setPasswordToken!.includes('.'), aRow.setPasswordToken?.slice(0, 12));

  const live = await signAdminSetPasswordToken({ adminId: emp.id, email: emp.email });
  await prisma.adminUser.update({ where: { id: emp.id }, data: { setPasswordToken: hashToken(live), setPasswordTokenExpiry: new Date(Date.now() + 3_600_000) } });
  const twice = await Promise.all([1, 2].map(() => post(setPassword, '/api/admin/set-password', { token: live, password: PW }).then(r => r.status)));
  ok('admin set-password: one link submitted twice at once lands once', twice.filter(s => s === 200).length === 1 && twice.filter(s => s === 400).length === 1, twice);
  ok('admin set-password: the link is spent', (await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } })).setPasswordToken === null);
  const otherLink = await signAdminSetPasswordToken({ adminId: emp.id, email: emp.email });
  ok('admin set-password: a signed link that is not the stored one is refused, and recorded', (await post(setPassword, '/api/admin/set-password', { token: otherLink, password: PW })).status === 400
    && (await prisma.securityEvent.count({ where: { accountId: emp.id, detail: 'set password, link already used or replaced' } })) >= 1);

  for (const f of ['src/app/api/admin/login/route.ts', 'src/app/api/cam/login/route.ts', 'src/app/api/admin/forgot-password/route.ts']) {
    ok(`${f.split('/').slice(-2, -1)[0]}: stores only the hash of the set-password link`, read(f).includes('setPasswordToken: hashToken(token)') && !read(f).includes('setPasswordToken: token,'));
  }
  ok('no route compares a stored link with !== any more', !read('src/app/api/admin/set-password/route.ts').includes('setPasswordToken !== token'));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

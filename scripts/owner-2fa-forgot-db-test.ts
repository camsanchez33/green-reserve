// Audit 2026-11-24 M6 and M7.
//  M6: a stolen gr_owner cookie could start and confirm a new authenticator (swapping in its own) with
//      no fresh second factor, no record and no alert. Replacing now needs a fresh "Confirm it's you";
//      a first set-up needs a recent second factor; every change is a security event and an email.
//  M7: admin forgot-password answered an unknown email at once and a real one after the send (or 500),
//      and was capped only per address. Now the answer is the same and immediate for every email,
//      the work happens after the response, and each address gets at most 3 links an hour.
// Real database. Run: npx tsx scripts/owner-2fa-forgot-db-test.ts
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';

// next/headers and after() only work inside a real request: the routes read this jar, and after() work is queued here.
let jar: Record<string, string> = {};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({ get: (n: string) => (jar[n] ? { name: n, value: jar[n] } : undefined), getAll: () => [], has: (n: string) => n in jar, set: () => {} });
nextHeaders.headers = async () => new Headers({ 'user-agent': 'test-browser' });
const queued: (() => unknown)[] = [];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextServer = require('next/server');
nextServer.after = (task: unknown) => { queued.push(typeof task === 'function' ? (task as () => unknown) : () => task); };
const runAfter = async () => { while (queued.length) await queued.shift()!(); };

import { prisma } from '../src/lib/prisma';
import { signOwnerToken } from '../src/lib/owner-session';
import { generateTotpSecret, signEnrolToken } from '../src/lib/owner-totp';
import { authenticator } from 'otplib';
import { POST as twoFactor } from '../src/app/api/admin/two-factor/route';
import { POST as forgot } from '../src/app/api/admin/forgot-password/route';

const TAG = 'owner2faforgottest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: TAG } }, { key: { contains: '192.0.2.' } }, { key: { startsWith: 'cam:step-up:' } }] } });
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: TAG } } });
}

let ipN = 0;
const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${(ipN++ % 250) + 1}`, 'user-agent': 'test-browser' },
});
const post2fa = (body: unknown) => twoFactor(req('/api/admin/two-factor', body), undefined);

(async () => {
  process.env.RESEND_API_KEY = '';
  await cleanup();

  // ── M6 ──
  const owner = await prisma.adminUser.create({ data: { name: 'Two Owner', email: `${TAG}+owner@t.local`, passwordHash: 'x', role: 'owner', active: true } });
  const device = await prisma.ownerDevice.create({ data: { adminId: owner.id, tokenHash: `${TAG}-dev`, approvedAt: new Date() } });
  const session = async (stepUpAt: Date | null, stepUpFresh = false) => {
    const s = await prisma.ownerSession.create({ data: { adminId: owner.id, deviceId: device.id, method: 'email', expiresAt: new Date(Date.now() + 3600_000), stepUpAt, stepUpFresh } });
    jar = { gr_owner: await signOwnerToken(s.id, owner.id, s.expiresAt) };
    return s;
  };

  // First set-up: a recent second factor is enough (there's nothing else to confirm with yet).
  await session(new Date(Date.now() - 10 * 60_000));
  const lateFirst = await post2fa({ action: 'start' });
  ok('M6 first set-up more than 5 minutes after signing in is refused', lateFirst.status === 403);
  await session(new Date());
  const first = await post2fa({ action: 'start' });
  const firstBody = await first.json() as { secret: string; enrolToken: string; replacing: boolean };
  ok('M6 first set-up right after signing in starts', first.status === 200 && firstBody.replacing === false);
  const confirmed = await post2fa({ action: 'confirm', enrolToken: firstBody.enrolToken, code: authenticator.generate(firstBody.secret) });
  ok('M6 …and confirms', confirmed.status === 200 && !!(await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } })).twoFactorSecret);
  ok('M6 …and is a security event', (await prisma.securityEvent.count({ where: { accountId: owner.id, kind: 'second_factor_changed', detail: 'authenticator app set up' } })) === 1);

  // Replacing: a stolen cookie (signed in a minute ago, no fresh confirm) can no longer swap the app.
  await session(new Date(Date.now() - 60_000), false);
  const swap = await post2fa({ action: 'start' });
  const swapBody = await swap.json() as { code?: string };
  ok('M6 replacing without a fresh "Confirm it\'s you" is refused with the step-up answer', swap.status === 403 && swapBody.code === 'step_up', { s: swap.status, swapBody });
  await session(new Date(), false);
  ok('M6 …even straight after signing in (sign-in is not a fresh confirm)', (await post2fa({ action: 'start' })).status === 403);
  const fresh = await session(new Date(), true);
  const replace = await post2fa({ action: 'start' });
  const replaceBody = await replace.json() as { secret: string; enrolToken: string; replacing: boolean };
  ok('M6 with a fresh confirm, replacing starts', replace.status === 200 && replaceBody.replacing === true);
  ok('M6 …and the confirm is used up', (await prisma.ownerSession.findUniqueOrThrow({ where: { id: fresh.id } })).stepUpFresh === false);
  ok('M6 …so a second start needs another confirm', (await post2fa({ action: 'start' })).status === 403);
  const forged = await post2fa({ action: 'confirm', enrolToken: await signEnrolToken({ adminId: 'someone-else', secret: generateTotpSecret() }), code: '000000' });
  ok('M6 confirm still needs an enrolment token made for this owner', forged.status === 400);
  const replaced = await post2fa({ action: 'confirm', enrolToken: replaceBody.enrolToken, code: authenticator.generate(replaceBody.secret) });
  ok('M6 confirming the new app replaces it and is recorded', replaced.status === 200 && (await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } })).twoFactorSecret === replaceBody.secret
    && (await prisma.securityEvent.count({ where: { accountId: owner.id, kind: 'second_factor_changed', detail: 'authenticator app replaced' } })) === 1);
  const regen = await post2fa({ action: 'regenerate', code: authenticator.generate(replaceBody.secret) });
  ok('M6 new recovery codes still need a current code, and are recorded', regen.status === 200 && (await prisma.securityEvent.count({ where: { accountId: owner.id, kind: 'second_factor_changed', detail: 'recovery codes replaced' } })) === 1);
  const route = read('src/app/api/admin/two-factor/route.ts');
  ok('M6 every change emails the owner', (route.match(/await announce\(req, admin/g) ?? []).length === 2 && route.includes('sendOwnerTwoFactorChanged('));
  ok('M6 the profile card asks "Confirm it\'s you" when told to', read('src/components/admin/OwnerTwoFactorCard.tsx').includes("stepUpFetch('/api/admin/two-factor'"));

  // ── M7 ──
  jar = {};
  const emp = await prisma.adminUser.create({ data: { name: 'Forgot Emp', email: `${TAG}+emp@t.local`, passwordHash: 'x', role: 'support', active: true } });
  await prisma.adminUser.create({ data: { name: 'Off Emp', email: `${TAG}+off@t.local`, passwordHash: 'x', role: 'support', active: false } });
  const answers: { status: number; body: string }[] = [];
  for (const email of [emp.email, `${TAG}+nobody@t.local`, `${TAG}+off@t.local`]) {
    const r = await forgot(req('/api/admin/forgot-password', { email }));
    answers.push({ status: r.status, body: await r.text() });
  }
  ok('M7 a real, an unknown and a turned-off email get the same answer', answers.every(a => a.status === 200 && a.body === answers[0].body), answers);
  ok('M7 …before anything is looked up or sent (the work waits until after the response)', queued.length === 3 && (await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } })).setPasswordToken === null);
  await runAfter();
  ok('M7 after the response, only the real, active login gets a link', !!(await prisma.adminUser.findUniqueOrThrow({ where: { id: emp.id } })).setPasswordToken
    && !(await prisma.adminUser.findFirstOrThrow({ where: { email: `${TAG}+off@t.local` } })).setPasswordToken);
  ok('M7 the send failing (no email key here) changes nothing about the answer', answers[0].status === 200);
  ok('M7 every request is a security event', (await prisma.securityEvent.count({ where: { email: { startsWith: TAG }, kind: 'reset_requested' } })) === 3);
  for (let i = 0; i < 3; i++) await forgot(req('/api/admin/forgot-password', { email: emp.email }));
  await runAfter();
  const capped = await prisma.securityEvent.count({ where: { accountId: emp.id, kind: 'rate_limited', detail: { contains: 'too many links' } } });
  ok('M7 a 4th link for one address in an hour is not sent, from any network', capped === 1, capped);
  const bad = await forgot(req('/api/admin/forgot-password', { email: { not: '' } }));
  ok('M7 an email that is not a string is refused', bad.status === 400);

  jar = {};
  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

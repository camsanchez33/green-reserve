// SEC-3 — the security log and Admin → Security, against a database: an event
// is recorded with the platform's IP; 20 failures from one address in an hour
// is a Problem (19 isn't) and the Problem names no address or email; an
// admin/owner lockout is a Problem, a course one isn't; 90 days is kept; the
// overview and "locked out now" read right; Sentry's answers become plain
// sentences; the live-header check; and every sign-in door records.
// Needs a database. Run: npx tsx scripts/security-events-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { securityEvent, securityFindings, purgeOldSecurityEvents, securityOverview, lockedAccountsNow, BURST_PER_IP } from '../src/lib/security-events';
import { openSentryIssues, sentryApiBase } from '../src/lib/sentry-issues';
import { securityChecklist } from '../src/lib/security-checklist';
import { failUnknownLogin, unknownLoginLockedUntil, LOGIN_MAX_ATTEMPTS } from '../src/lib/login-guard';

const TAG = 'secevtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const NOW = new Date('2031-06-10T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const req = (ip: string, ua = 'TestBrowser/1.0') => new Request('https://x.test/', { headers: { 'x-vercel-forwarded-for': ip, 'x-forwarded-for': '6.6.6.6', 'user-agent': ua } });

async function cleanup() {
  await prisma.securityEvent.deleteMany({ where: { OR: [{ email: { startsWith: TAG } }, { userAgent: { startsWith: TAG } }, { ip: { startsWith: '203.0.113.' } }] } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: TAG } }, { key: { contains: '203.0.113.' } }] } });
}
const ev = (kind: string, surface: string, ip: string, at: Date, extra: Record<string, unknown> = {}) =>
  prisma.securityEvent.create({ data: { kind, surface, ip, email: `${TAG}@x.test`, userAgent: TAG, createdAt: at, ...extra } });

async function main() {
  // Recording
  await securityEvent(req('203.0.113.9', `${TAG}-ua`), { kind: 'signin_failed', surface: 'admin', email: `  ${TAG.toUpperCase()}@X.TEST `, detail: 'wrong password' });
  const row = await prisma.securityEvent.findFirst({ where: { userAgent: `${TAG}-ua` } });
  check('an event is recorded with the platform’s IP, not the client-written leftmost one', row?.ip === '203.0.113.9', row);
  check('…the email is trimmed and lower-cased, the detail kept', row?.email === `${TAG}@x.test` && row?.detail === 'wrong password', row);

  // Rate-limited is recorded once per 10 minutes per door and address, not per refused request.
  for (let i = 0; i < 5; i++) await securityEvent(req('203.0.113.50', `${TAG}-rl`), { kind: 'rate_limited', surface: 'course', detail: 'sign-in' });
  check('a throttled address is recorded once, not on every refused request', (await prisma.securityEvent.count({ where: { userAgent: `${TAG}-rl` } })) === 1);
  // No address adds more than its hourly cap of rows.
  await prisma.rateLimit.upsert({ where: { key: 'secev:ip:203.0.113.51' }, create: { key: 'secev:ip:203.0.113.51', count: 200, windowStart: new Date() }, update: { count: 200, windowStart: new Date() } });
  await securityEvent(req('203.0.113.51', `${TAG}-cap`), { kind: 'signin_failed', surface: 'golfer' });
  check('past its hourly cap an address adds no more rows', (await prisma.securityEvent.count({ where: { userAgent: `${TAG}-cap` } })) === 0);

  // An unknown email locks exactly like a real account: 4 plain answers, then locked on the 5th, locked while it lasts.
  const ghost = `${TAG}-ghost@x.test`;
  const answers: (Date | null)[] = [];
  for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) answers.push(await failUnknownLogin('course', ghost, 'wrong'));
  check('an unknown email gets the plain answer 4 times, then the lockout on the 5th — like a real account', answers.slice(0, 4).every(a => a === null) && answers[4] instanceof Date, answers);
  const until = await unknownLoginLockedUntil('course', ghost);
  check('…and stays locked for 15 minutes', !!until && Math.abs(until.getTime() - Date.now() - 15 * 60_000) < 5_000, until);
  check('…and the next wrong password after it expires locks again (the count never resets on its own)', (await failUnknownLogin('course', ghost, 'wrong')) instanceof Date);
  check('another door counts separately', (await unknownLoginLockedUntil('admin', ghost)) === null);

  // Findings
  for (let i = 0; i < BURST_PER_IP - 1; i++) await ev('signin_failed', 'course', '203.0.113.20', ago(10 + i));
  let f = await securityFindings(NOW);
  check(`${BURST_PER_IP - 1} failures from one address is not a Problem`, !f.some(x => x.key === 'security:burst-ip'), f);
  await ev('second_factor_failed', 'course', '203.0.113.20', ago(5));
  await ev('signin_failed', 'course', '203.0.113.20', ago(90)); // outside the hour
  f = await securityFindings(NOW);
  const burst = f.find(x => x.key === 'security:burst-ip');
  check(`${BURST_PER_IP} in the hour is a Problem (a wrong second factor counts)`, !!burst && /20 failed/.test(burst.detail), f);
  check('…and the Problem names no address or email (Problems is open to employees)', !!burst && !/203\.0\.113|@/.test(burst.title + burst.detail), burst);
  check('a successful sign-in never counts as a failure', !(await (async () => { await ev('signin_ok', 'course', '203.0.113.21', ago(3)); return (await securityFindings(NOW)).find(x => x.key === 'security:burst-ip' && /21 failed/.test(x.detail)); })()));

  const admin = await prisma.adminUser.create({ data: { email: `${TAG}-admin@x.test`, name: 'Sec Test', role: 'support', passwordHash: '', lockoutUntil: new Date(Date.now() + 10 * 60_000) } });
  await ev('locked_out', 'admin', '203.0.113.30', ago(20), { accountId: admin.id });
  await ev('locked_out', 'course', '203.0.113.31', ago(20), { accountId: 'some-staff' });
  f = await securityFindings(NOW);
  check('an admin lockout is a Problem', f.some(x => x.key === `security:lockout:${admin.id}`), f);
  check('a course lockout is not', !f.some(x => x.key === 'security:lockout:some-staff'));

  // Overview
  const o = await securityOverview(NOW);
  check('the busiest address is first', o.topIps[0]?.ip === '203.0.113.20' && o.topIps[0].failed === BURST_PER_IP + 1, o.topIps.slice(0, 2));
  check('the list of events leaves out successful sign-ins', !o.recent.some(r => r.kind === 'signin_ok'));
  const locked = await lockedAccountsNow();
  check('a locked admin shows under "Locked out right now"', locked.some(l => l.email === `${TAG}-admin@x.test` && l.who === 'Admin'), locked);

  // Retention
  await ev('signin_failed', 'golfer', '203.0.113.40', new Date(NOW.getTime() - 91 * 86_400_000));
  await ev('signin_failed', 'golfer', '203.0.113.41', new Date(NOW.getTime() - 89 * 86_400_000));
  await purgeOldSecurityEvents(NOW);
  const left = await prisma.securityEvent.findMany({ where: { ip: { in: ['203.0.113.40', '203.0.113.41'] } }, select: { ip: true } });
  check('older than 90 days is deleted, newer is kept', left.length === 1 && left[0].ip === '203.0.113.41', left);

  // Sentry
  const env = { SENTRY_READ_TOKEN: 't', SENTRY_ORG: 'gr', SENTRY_PROJECT: 'web' } as unknown as NodeJS.ProcessEnv;
  const notSet = await openSentryIssues({} as NodeJS.ProcessEnv);
  check('no token: says exactly what to add', !notSet.ok && notSet.reason === 'not_set_up' && /SENTRY_READ_TOKEN/.test(notSet.message));
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const refused = await openSentryIssues(env, reply(401, {}));
  check('a refused token is a plain sentence', !refused.ok && /refused the token/.test(refused.message));
  let seenUrl = '', seenAuth = '';
  const ok = await openSentryIssues(env, (async (u: string, init?: RequestInit) => {
    seenUrl = u; seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
    return new Response(JSON.stringify([
      { id: '1', shortId: 'WEB-1', title: 'TypeError: x', culprit: '/api/bookings', level: 'error', count: '12', userCount: 3, firstSeen: '2031-06-01T00:00:00Z', lastSeen: '2031-06-10T11:00:00Z', permalink: 'https://gr.sentry.io/issues/1/' },
      { id: '2', title: 'Other', count: '1', permalink: 'https://evil.example/phish' },
    ]), { status: 200 });
  }) as unknown as typeof fetch);
  check('asks for the open errors with the token as a header', /\/api\/0\/projects\/gr\/web\/issues\/\?query=is%3Aunresolved/.test(seenUrl) && seenAuth === 'Bearer t', seenUrl);
  check('maps title, place, counts and the Sentry link', ok.ok && ok.issues[0].title === 'TypeError: x' && ok.issues[0].events === 12 && ok.issues[0].users === 3 && ok.issues[0].link === 'https://gr.sentry.io/issues/1/', ok);
  check('a link that isn’t Sentry’s is dropped', ok.ok && ok.issues[1].link === '');
  check('the API host follows the DSN’s region', sentryApiBase({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/2' } as unknown as NodeJS.ProcessEnv) === 'https://de.sentry.io' && sentryApiBase({ SENTRY_DSN: 'https://k@o1.ingest.us.sentry.io/2' } as unknown as NodeJS.ProcessEnv) === 'https://sentry.io');

  // Checklist
  const headersOk = (async () => new Response('{}', { status: 200, headers: { 'strict-transport-security': 'max-age=63072000; includeSubDomains', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'content-security-policy': "frame-ancestors 'none'; base-uri 'self'" } })) as unknown as typeof fetch;
  const headersGone = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  const base = { NEXT_PUBLIC_URL: 'https://site.test', JWT_SECRET: 'x'.repeat(40), CRON_SECRET: 'c', STRIPE_WEBHOOK_SECRET: 's' } as unknown as NodeJS.ProcessEnv;
  const good = await securityChecklist(base, headersOk);
  const gone = await securityChecklist({ ...base, JWT_SECRET: 'short' } as NodeJS.ProcessEnv, headersGone);
  check('headers present on the live site: ok', good.find(c => c.key === 'headers')?.status === 'ok');
  check('headers missing: red, and says which', gone.find(c => c.key === 'headers')?.status === 'bad' && /HTTPS-only/.test(gone.find(c => c.key === 'headers')!.text));
  check('a short session key is red', gone.find(c => c.key === 'jwt')?.status === 'bad' && good.find(c => c.key === 'jwt')?.status === 'ok');
  check('no secret value is ever shown', !JSON.stringify(good).includes('x'.repeat(40)));

  // Every door records
  const doors: [string, RegExp[]][] = [
    ['src/app/api/admin/login/route.ts', [/kind: 'rate_limited', surface: 'admin'/, /'unknown account'/, /kind: lockoutUntil \? 'locked_out' : 'signin_failed', surface: 'admin'/, /kind: 'signin_ok', surface: 'admin'/, /if \(!admin \|\| !admin\.active \|\| !admin\.passwordHash \|\| admin\.role === 'owner'\) \{[\s\S]*?failUnknownLogin\('admin'/]],
    ['src/app/api/cam/login/route.ts', [/kind: 'rate_limited', surface: 'owner'/, /kind: 'second_factor_failed', surface: 'owner'.*'passkey'/, /kind: 'new_device'/, /kind: 'signin_ok', surface: 'owner'/, /kind: lockoutUntil \? 'locked_out' : 'signin_failed', surface: 'owner'/]],
    ['src/app/api/auth/login/route.ts', [/kind: 'rate_limited', surface: 'course'/, /'staff login, wrong password'/, /'owner login, wrong password'/, /if \(!staff\.active\) return unknownLogin\(/, /return unknownLogin\(req, email, password, undefined, 'unknown account'\)/, /failUnknownLogin\('course'/]],
    ['src/app/api/auth/2fa/verify/route.ts', [/kind: 'second_factor_failed', surface: 'course'/, /kind: 'signin_ok', surface: 'course'/]],
    ['src/app/api/cam/step-up/route.ts', [/kind: 'step_up_failed'/]],
    ['src/app/api/golfer/auth/otp/verify/route.ts', [/kind: 'signin_failed', surface: 'golfer'/]],
    ['src/app/api/member/[courseSlug]/verify/route.ts', [/kind: 'signin_failed', surface: 'member'/, /rateLimit\(`member-verify-ip:/]],
    ['src/app/api/cam/login/route.ts', [/failUnknownLogin\('owner'/]],
  ];
  for (const [file, res] of doors) {
    const src = readFileSync(file, 'utf8');
    const missing = res.filter(r => !r.test(src));
    check(`${file} records its outcomes`, missing.length === 0, missing.map(String));
  }
  const twofa = readFileSync('src/app/api/auth/2fa/verify/route.ts', 'utf8');
  check('a wrong code is logged after the attempt counter moves, never before', twofa.indexOf("kind: 'second_factor_failed'") > twofa.indexOf('twoFactorAttempts: clearCode ? 0 : attempts'));
  const adminLogin = readFileSync('src/app/api/admin/login/route.ts', 'utf8');
  check('no answer at the employee door says an account exists or is turned off', !/Account not activated|Account disabled/.test(adminLogin + readFileSync('src/app/api/auth/login/route.ts', 'utf8')));
  const checks = readFileSync('src/lib/admin-checks.ts', 'utf8');
  check('the hourly check raises security Problems and purges old events', /securityFindings\(now\)/.test(checks) && /purgeOldSecurityEvents\(now\)/.test(checks));
  const route = readFileSync('src/app/api/admin/security/route.ts', 'utf8');
  check('Admin → Security is owner only', /requireOwner\(session\)/.test(route));
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });

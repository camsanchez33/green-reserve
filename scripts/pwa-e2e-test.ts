// PWA install (Cam 2026-11-24): the service worker in a real browser against a local `next start`. Signed in to the
// dashboard and the admin, with the worker active, after loading signed-in pages and calling the API, the caches
// must hold only /_next/static/* and gr-offline.html. Also: offline navigation shows the offline page, the worker's
// scopes are /dashboard and /admin only, the homepage and golfer pages get no manifest and no worker, and the
// dashboard's theme-color follows the look.
// Local throwaway database only (perf-seed's course and operator). Needs the app running:
//   npx next build && npx next start -p 3100 &   then   TEST_URL=http://localhost:3100 npx tsx scripts/pwa-e2e-test.ts
// In CI it runs after "Start the app" (tests.yml) with CHROME_PATH pointing at the runner's Chrome.
import { createRequire } from 'module';
import { prisma } from '../src/lib/prisma';
import { signToken } from '../src/lib/auth';
import { signAdminToken } from '../src/lib/admin-session';

const req = createRequire(__filename);
// The machine's Playwright when there is one (cloud sessions); playwright-core with the runner's Chrome in CI.
// Neither is a repo dependency, so it is untyped here (as in scripts/screenshots/capture.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = ((): any => { try { return req('playwright'); } catch { return req('playwright-core'); } })();

const BASE = (process.env.TEST_URL || 'http://localhost:3100').replace(/\/$/, '');
let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const ADMIN_EMAIL = 'pwa-e2e@ci.local';

async function main() {
  const host = new URL(process.env.DATABASE_URL || 'postgresql://x@missing/x').hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) { console.error(`pwa-e2e: refusing ${host} — local throwaway databases only`); process.exit(1); }
  const base = new URL(BASE);
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) { console.error('pwa-e2e: local app only'); process.exit(1); }

  // perf-seed's operator and course (tests.yml and perf-audit.yml seed them); seeded here too if missing.
  const op = await prisma.courseOperator.findUnique({ where: { email: 'perf-audit@ci.local' }, select: { id: true, email: true, sessionVersion: true } });
  if (!op) { console.error('pwa-e2e: run scripts/perf-seed.ts first'); process.exit(1); }
  const admin = await prisma.adminUser.upsert({
    where: { email: ADMIN_EMAIL }, update: { active: true, role: 'support' },
    create: { email: ADMIN_EMAIL, name: 'PWA Test', passwordHash: 'ci-only-no-login', role: 'support' },
  });
  const opCookie = await signToken({ operatorId: op.id, email: op.email, sv: op.sessionVersion });
  const adminCookie = await signAdminToken({ adminId: admin.id, email: admin.email, name: admin.name, role: 'support', mfa: true });

  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  try {
    // ---- /sw.js itself ----
    const sw = await fetch(BASE + '/sw.js');
    check('/sw.js: 200 JavaScript, no-cache', sw.status === 200 && /javascript/.test(sw.headers.get('content-type') || '') && /no-cache/.test(sw.headers.get('cache-control') || ''));

    for (const area of [
      { name: 'dashboard', scope: '/dashboard', cookie: { name: 'gr_operator', value: opCookie }, pages: ['/dashboard', '/dashboard/money', '/dashboard/settings', '/dashboard/golfers'], api: ['/api/operator/my-courses', '/api/health'] },
      { name: 'admin', scope: '/admin', cookie: { name: 'admin_session', value: adminCookie }, pages: ['/admin', '/admin/profile', '/admin/courses'], api: ['/api/admin/session', '/api/health'] },
    ]) {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ ...area.cookie, url: BASE }]);
      const page = await ctx.newPage();
      await page.goto(BASE + area.pages[0], { waitUntil: 'load' });
      check(`${area.name}: signed in (not sent to a login page)`, !/\/login/.test(new URL(page.url()).pathname), page.url());
      // In <head>: Chrome ignores a manifest link anywhere else (Next 15 streams its own metadata into <body>).
      check(`${area.name}: manifest linked in <head>`, await page.locator(`head > link[rel="manifest"][href="/${area.name}.webmanifest"]`).count() === 1);
      check(`${area.name}: Chrome found the manifest`, await (async () => { const c = await ctx.newCDPSession(page); const m = await c.send('Page.getAppManifest'); return String(m.url).endsWith(`/${area.name}.webmanifest`); })());
      // Wait until the worker is active and controls this page (clients.claim, no reload needed).
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller ? null
        : new Promise<void>(r => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true })))).catch(() => undefined);
      const scopes: string[] = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname)));
      check(`${area.name}: one worker, scope ${area.scope}`, scopes.length === 1 && scopes[0] === area.scope, scopes);
      check(`${area.name}: page is controlled`, await page.evaluate(() => !!navigator.serviceWorker.controller));

      // Signed-in pages (twice, so a cache-first second pass happens) and API calls, all through the worker.
      // 'load' plus a pause, not 'networkidle': the dashboard polls, so the network is never idle.
      for (const p of [...area.pages, ...area.pages]) { await page.goto(BASE + p, { waitUntil: 'load' }); await page.waitForTimeout(1500); }
      const apiStatus = await page.evaluate((urls: string[]) => Promise.all(urls.map(u => fetch(u, { credentials: 'same-origin' }).then(r => r.status))), area.api);
      check(`${area.name}: signed-in API answered 200 through the page`, (apiStatus as number[]).every(s => s === 200), apiStatus);

      const cached: string[] = await page.evaluate(async () => {
        const out: string[] = [];
        for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(k + ' ' + new URL(r.url).pathname);
        return out;
      });
      const paths = cached.map(c => c.split(' ')[1]);
      const stray = paths.filter(p => !(p.startsWith('/_next/static/') || p === '/gr-offline.html'));
      check(`${area.name}: cache holds only /_next/static/* and gr-offline.html`, stray.length === 0, stray);
      check(`${area.name}: offline page precached`, paths.includes('/gr-offline.html'));
      check(`${area.name}: static files cached`, paths.some(p => p.startsWith('/_next/static/')));
      check(`${area.name}: one cache, named gr-pwa-<version>`, new Set(cached.map(c => c.split(' ')[0])).size === 1 && cached.every(c => c.startsWith('gr-pwa-')), [...new Set(cached.map(c => c.split(' ')[0]))]);

      // Offline: a navigation shows the offline page; online again, the real page.
      await ctx.setOffline(true);
      await page.goto(BASE + area.pages[1], { waitUntil: 'load' }).catch(() => undefined);
      check(`${area.name}: offline navigation shows "You're offline"`, (await page.content()).includes("You're offline"));
      await ctx.setOffline(false);
      await page.goto(BASE + area.pages[1], { waitUntil: 'load' });
      check(`${area.name}: back online, the real page`, !(await page.content()).includes("You're offline"));
      await ctx.close();
    }

    // ---- theme-color follows the look ----
    for (const [look, colour] of [['dark', '#1D1E1D'], ['light', '#E9EAE6']] as const) {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: 'gr_operator', value: opCookie, url: BASE }, { name: 'gr_op_theme', value: look, url: BASE + '/dashboard' }]);
      const page = await ctx.newPage();
      await page.goto(BASE + '/dashboard/settings', { waitUntil: 'load' });
      const tc = await page.locator('meta[name="theme-color"]').first().getAttribute('content');
      check(`dashboard theme-color, ${look} look`, tc === colour, tc);
      await ctx.close();
    }

    // ---- The homepage and golfer pages stay untouched ----
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const p of ['/', '/courses/perf-audit']) {
      await page.goto(BASE + p, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => rs.length));
      check(`${p}: no manifest, no worker`, await page.locator('link[rel="manifest"]').count() === 0 && regs === 0 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)), regs);
    }
    await ctx.close();
  } finally {
    await browser.close();
    await prisma.adminUser.deleteMany({ where: { email: ADMIN_EMAIL } }).catch(() => undefined);
    await prisma.$disconnect();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

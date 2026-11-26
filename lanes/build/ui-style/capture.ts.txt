// UI-STYLES prototype capture: the REAL pages of the local screenshot course in four surface styles.
// Local database only. Usage: DATABASE_URL=… JWT_SECRET=… npx tsx scripts/ui-proto/capture.ts
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prisma } from '../../src/lib/prisma';
import { signToken } from '../../src/lib/auth';
import { signAdminToken } from '../../src/lib/admin-session';

const BASE = 'http://localhost:3124';
const OUT = process.env.UI_OUT!;
const SLUG = 'greenreserve-test-course';
const TZ = 'America/New_York';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) { console.error('local only'); process.exit(1); }
const { chromium } = createRequire(import.meta.url)('playwright');
const CSS = fs.readFileSync(path.join(__dirname, 'themes.css'), 'utf8');
const STYLES = (process.env.UI_STYLES ? process.env.UI_STYLES.split(',') : ['glass-light', 'glass-dark', 'solid-light', 'solid-dark']) as string[];


// Prototype-only tagging at capture time (Cam v4 comments): icons for every rail item by its label, the
// dashboard's third group named "Settings", and every search field marked so one search style applies.
// A real build would put the icons in the nav arrays (OperatorSidebar already has lucide icons) instead.
async function tagPage(p: any) {
  return p.evaluate(fs.readFileSync(path.join(__dirname, 'tag.js'), 'utf8'));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const course = await prisma.course.findUniqueOrThrow({ where: { slug: SLUG }, include: { operator: true } });
  const opToken = await signToken({ operatorId: course.operator!.id, email: course.operator!.email });
  const admin = await prisma.adminUser.upsert({
    where: { email: 'ui-proto@example.com' }, update: { active: true, role: 'manager' },
    create: { email: 'ui-proto@example.com', name: 'Jordan Example', passwordHash: 'x', role: 'manager' },
  });
  const adminToken = await signAdminToken({ adminId: admin.id, email: admin.email, name: admin.name, role: 'manager', mfa: true });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + 864e5));
  const tt = await prisma.teeTime.findFirst({ where: { courseId: course.id, date: { gt: today } }, orderBy: [{ date: 'asc' }, { time: 'asc' }] });
  const ONLY = process.env.UI_PAGES ? process.env.UI_PAGES.split(',') : null;
  const pages0: { key: string; url: string; who: 'op' | 'admin' | 'none' }[] = [
    { key: 'dash-teesheet', url: '/dashboard', who: 'op' },
    { key: 'dash-home', url: '/dashboard/home', who: 'op' },
    { key: 'dash-settings', url: '/dashboard/settings', who: 'op' },
    { key: 'admin-overview', url: '/admin', who: 'admin' },
    { key: 'admin-golfers', url: '/admin/golfers', who: 'admin' },
    { key: 'golfer-course', url: `/courses/${SLUG}?date=${process.env.UI_DATE ?? tt?.date ?? tomorrow}`, who: 'none' },
    { key: 'golfer-info', url: `/courses/${SLUG}?date=${process.env.UI_DATE ?? tt?.date ?? tomorrow}`, who: 'none' },
    { key: 'golfer-book', url: tt ? `/book?course_slug=${SLUG}&tee_time_id=${tt.id}&date=${tt.date}` : `/courses/${SLUG}`, who: 'none' },
    { key: 'home', url: '/', who: 'none' },
    { key: 'home2', url: '/#scroll', who: 'none' },
  ];
  const pages = ONLY ? pages0.filter(x => ONLY.includes(x.key)) : pages0;
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).format(new Date()).match(/GMT([+-]\d\d:\d\d)/)?.[1] ?? '-05:00';
  const clock = new Date(`${today}T10:05:00${offset}`);
  const b = await chromium.launch();
  for (const vp of (process.env.UI_PHONE_ONLY ? [{ w: 390, h: 844, tag: 'm' }] : [{ w: 1280, h: 800, tag: 'd' }, { w: 390, h: 844, tag: 'm' }])) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, timezoneId: TZ, isMobile: vp.tag === 'm', hasTouch: vp.tag === 'm' });
    await ctx.clock.setFixedTime(clock);
    // v5 (Cam): on a phone the tee sheet opens in its list view.
    if (vp.tag === 'm') await ctx.addInitScript(() => { try { localStorage.setItem('gr_sheet_view', 'list'); } catch {} });
    await ctx.addCookies([
      { name: 'gr_operator', value: opToken, url: BASE },
      { name: 'admin_session', value: adminToken, url: BASE },
    ]);
    const p = await ctx.newPage();
    for (const pg of pages) {
      await p.goto(BASE + pg.url, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
      await p.waitForTimeout(1500);
      if (pg.key === 'home2') await p.evaluate(() => window.scrollTo(0, window.innerHeight * 1.05));
      const found = await tagPage(p);
      if (pg.key === 'golfer-info') await p.click('[data-ui-ctabs] button[data-t="info"]').catch(() => {});
      if (process.env.UI_PROBE) console.log(pg.key, vp.tag, JSON.stringify(found));
      await p.addStyleTag({ content: CSS + '\nnextjs-portal,[data-nextjs-toast]{display:none!important}' });
      for (const st of STYLES) {
        await p.evaluate((s: string) => {
          if (s === 'current') { document.documentElement.removeAttribute('data-ui'); return; }
          document.documentElement.setAttribute('data-ui', s);
          const dark = s.endsWith('dark');
          document.querySelectorAll('.op-look, [data-admin-shell]').forEach(el => el.setAttribute('data-theme', dark ? 'dark' : 'light'));
        }, st);
        await p.waitForTimeout(400);
        const file = path.join(OUT, `${pg.key}-${st}-${vp.tag}.jpg`);
        await p.screenshot({ path: file, type: 'jpeg', quality: 72, fullPage: !!process.env.UI_FULL });
        console.log('wrote', path.basename(file), p.url().replace(BASE, ''));
      }
    }
    await ctx.close();
  }
  await b.close();
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

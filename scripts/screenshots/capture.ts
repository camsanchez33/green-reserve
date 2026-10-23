// Product screenshots (Cam 2026-10-23): photographs the real pages of the
// seeded demo course (scripts/screenshots/seed.ts) for the homepage feature
// rows and /teesheet. Retake after any change to those pages — every image
// is the live UI, nothing drawn by hand.
//
//   1. a local Postgres with the migrations applied, then the seed
//   2. the app on it:  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_… npx next dev -p 3124
//      (any pk_test_ string — Stripe's card field draws without a real key)
//   3. DATABASE_URL=… JWT_SECRET=<the app's> npx tsx scripts/screenshots/capture.ts
//
// Playwright isn't a dependency of the app: point PLAYWRIGHT_MODULE at an
// install (npm i --prefix /tmp/pw playwright → /tmp/pw/node_modules/playwright).
// Writes public/home/shots/*.png.
//
// The one thing not live: the AI assistant's reply. Its answer is built here
// from the seeded tee sheet (the real unpaid groups) and handed to the real
// widget, because the screenshot must not depend on a model call.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../../src/lib/prisma';
import { signToken } from '../../src/lib/auth';
import { formatTeeTime } from '../../src/lib/format';

const BASE = process.env.SHOTS_URL ?? 'http://localhost:3124';
const OUT = path.join(process.cwd(), 'public/home/shots');
const SLUG = 'hollow-brook-demo';
const TZ = 'America/New_York';
/** The seed plays today's rounds before 10:00; the browser's clock is fixed just after. */
const CLOCK = '10:05';

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) { console.error('Refusing: screenshots are taken from a local database only.'); process.exit(1); }

const req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = req(process.env.PLAYWRIGHT_MODULE ?? 'playwright') as any;

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const course = await prisma.course.findUniqueOrThrow({ where: { slug: SLUG }, include: { operator: true } });
  const token = await signToken({ operatorId: course.operator!.id, email: course.operator!.email });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  // The fixed clock: today at 10:05 in the course's timezone.
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).format(new Date()).match(/GMT([+-]\d\d:\d\d)/)?.[1] ?? '-04:00';
  const clock = new Date(`${today}T${CLOCK}:00${offset}`);

  // This afternoon's groups that haven't paid: the assistant's answer and the pay screen use them.
  const unpaid = await prisma.booking.findMany({
    where: { courseId: course.id, status: 'confirmed', paidAt: null, teeTime: { date: today, time: { gte: '12:00' } } },
    include: { teeTime: { select: { time: true } } }, orderBy: { teeTime: { time: 'asc' } },
  });
  const phoneGroups = unpaid.filter(b => b.source !== 'online');
  if (phoneGroups.length < 2) throw new Error('The seed left too few unpaid phone groups this afternoon — reseed.');
  const payFor = phoneGroups[0];
  const checkInToken = payFor.checkInToken ?? randomUUID();
  if (!payFor.checkInToken) await prisma.booking.update({ where: { id: payFor.id }, data: { checkInToken } });

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const laptop = async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1.8, timezoneId: TZ });
    await ctx.clock.setFixedTime(clock);
    await ctx.addCookies([{ name: 'gr_operator', value: token, url: BASE }]);
    return ctx;
  };
  const phone = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: TZ });
    await ctx.clock.setFixedTime(clock);
    return ctx;
  };
  // Dev-only overlays never belong in a screenshot.
  const clean = (p: { addStyleTag: (o: { content: string }) => Promise<unknown> }) => p.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }' });
  const shot = async (p: { screenshot: (o: { path: string }) => Promise<unknown> }, name: string) => { await p.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`wrote ${name}.png`); };

  // ── The tee sheet ──
  {
    const ctx = await laptop(); const p = await ctx.newPage();
    await p.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: 240000 });
    await p.getByText('Next up').first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.evaluate(() => window.scrollTo(0, 0));
    await shot(p, 'tee-sheet');
    await ctx.close();
  }

  // ── The AI assistant: a real question about the day, answered from the seeded sheet, with a drafted change ──
  {
    const ctx = await laptop(); const p = await ctx.newPage();
    const names = phoneGroups.slice(0, 3).map(g => `${g.golferName} at ${formatTeeTime(g.teeTime.time)} (${g.players} players, ${usd(g.totalAmount)})`);
    const reply = `${phoneGroups.length} groups booked by phone this afternoon haven’t paid yet: ${names.join(', ')}${phoneGroups.length > 3 ? ` and ${phoneGroups.length - 3} more` : ''}. I can text ${payFor.golferName.split(' ')[0]} a pay link now — they’d pay on their phone with Apple Pay, Google Pay or a card.`;
    const card = {
      id: 'shot-card', title: `Text ${payFor.golferName} a pay link`,
      changes: [{ label: 'Group', from: '', to: `${payFor.golferName} · ${formatTeeTime(payFor.teeTime.time)} · ${payFor.players} players` }, { label: 'Amount', from: '', to: usd(payFor.totalAmount) }],
      note: 'They pay on their own phone; the tee sheet turns green when it lands.',
      call: { method: 'PATCH', path: '/api/operator/bookings', body: { id: payFor.id, action: 'send_pay_link', via: 'sms' } },
    };
    await p.route('**/api/birdie/chat', async (route: { request: () => { method: () => string }; fulfill: (o: object) => Promise<void> }) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: { enabled: true, persona: 'operator', greeting: "Hi — I'm Birdie. Ask me how to do anything on your dashboard, or what your course is set to.", chips: [], helpsWith: '' } });
      }
      const lines = [{ t: 'status', d: 'Looking at today’s tee sheet…' }, { t: 'text', d: reply }, { t: 'card', d: card }];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map(l => JSON.stringify(l)).join('\n') + '\n' });
    });
    await p.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: 240000 });
    await p.getByText('Next up').first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.getByRole('button', { name: /Open Birdie|Ask Birdie/ }).first().click();
    await p.getByLabel('Message Birdie').fill('Who hasn’t paid for this afternoon?');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.getByText(card.title).waitFor({ timeout: 30000 });
    await p.waitForTimeout(400);
    await shot(p, 'assistant');
    await ctx.close();
  }

  // ── Analytics and the monthly review ──
  // The server reads the real time, so a week ending today would count today's
  // later rounds as no-shows. Ask for the week ending yesterday instead — what
  // an owner gets by picking those dates in the range picker.
  {
    const ctx = await laptop(); const p = await ctx.newPage();
    const day = (n: number) => new Date(new Date(`${today}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
    await p.route('**/api/operator/analytics*', (route: { request: () => { url: () => string }; continue: (o: object) => Promise<void> }) => {
      const u = new URL(route.request().url());
      if (!u.searchParams.get('from')) { u.searchParams.set('from', day(-7)); u.searchParams.set('to', day(-1)); }
      return route.continue({ url: u.toString() });
    });
    await p.goto(`${BASE}/dashboard/analytics`, { waitUntil: 'load', timeout: 240000 });
    await p.getByText('Monthly review').first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.getByRole('button', { name: 'Read' }).first().click().catch(() => {});
    await p.waitForTimeout(600);
    await p.getByText('What to look at').first().scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, -40));
    await shot(p, 'analytics');
    await ctx.close();
  }

  // ── The golfer pays on their phone ──
  {
    const ctx = await phone(); const p = await ctx.newPage();
    await p.goto(`${BASE}/checkin/${payFor.id}?token=${checkInToken}`, { waitUntil: 'load', timeout: 240000 });
    await p.getByText(/pay \$/i).first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(1500);
    await shot(p, 'pay');
    await ctx.close();
  }

  // ── The golfer's booking page ──
  {
    const ctx = await phone(); const p = await ctx.newPage();
    await p.goto(`${BASE}/courses/${SLUG}`, { waitUntil: 'load', timeout: 240000 });
    // Tomorrow: the server's own clock may already be past today's last tee time.
    const tmr = new Date(clock.getTime() + 86_400_000);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(tmr);
    const dd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).format(tmr);
    await p.locator('button').filter({ hasText: wd }).filter({ hasText: new RegExp(`\\b${dd}\\b`) }).first().click({ timeout: 120000 });
    await p.getByText(/\/ player/).first().waitFor({ timeout: 120000 });
    await clean(p);
    await shot(p, 'booking-page');
    await ctx.close();
  }

  await b.close();
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

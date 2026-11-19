// Homepage feature pages (Cam 2026-11-18): photographs every picture on the seven feature pages
// (src/components/home/feature-pages.ts) plus the Tee sheet page's before/after (TryIt.tsx) into
// public/home/shots/features/. Real pages of the seeded test course, nothing drawn by hand; the one
// exception is the assistant's reply text, mocked exactly as capture.ts does.
//
//   1. a local Postgres with the migrations applied, then
//      npx tsx scripts/screenshots/seed.ts && npx tsx scripts/screenshots/seed-features.ts
//   2. the app on it (see capture.ts), then
//      DATABASE_URL=… JWT_SECRET=<the app's> PLAYWRIGHT_MODULE=… npx tsx scripts/screenshots/capture-features.ts
//   ONLY=tee-sheet-1,pro-shop-2 limits the run to those shots.
//
// try-after books "Dana Ruiz" at 1:10 PM through claimTeeTime (the one place every booking is born) and
// removes her again when it is done, so a retake starts from the same sheet.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../../src/lib/prisma';
import { signToken } from '../../src/lib/auth';
import { signMemberSessionToken } from '../../src/lib/member-session';
import { claimTeeTime } from '../../src/lib/claim-tee-time';
import { formatTeeTime } from '../../src/lib/format';
import { runProposeTool } from '../../src/lib/birdie/proposals';

const BASE = process.env.SHOTS_URL ?? 'http://localhost:3124';
const OUT = path.join(process.cwd(), 'public/home/shots/features');
const SLUG = 'greenreserve-test-course';
const TZ = 'America/New_York';
/** The seed plays today's rounds before 10:00; the browser's clock is fixed just after. */
const CLOCK = '10:05';
const LONG = 240000;
const ONLY = (process.env.ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean);
const want = (...names: string[]) => !ONLY.length || names.some(n => ONLY.includes(n));

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) { console.error('Refusing: screenshots are taken from a local database only.'); process.exit(1); }

const req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = req(process.env.PLAYWRIGHT_MODULE ?? 'playwright') as any;

async function main() {
  const course = await prisma.course.findUniqueOrThrow({ where: { slug: SLUG }, include: { operator: true } });
  const token = await signToken({ operatorId: course.operator!.id, email: course.operator!.email });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const day = (n: number) => new Date(new Date(`${today}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).format(new Date()).match(/GMT([+-]\d\d:\d\d)/)?.[1] ?? '-04:00';
  const clock = new Date(`${today}T${CLOCK}:00${offset}`);

  const unpaid = await prisma.booking.findMany({
    where: { courseId: course.id, status: 'confirmed', paidAt: null, teeTime: { date: today, time: { gte: '12:00' } } },
    include: { teeTime: { select: { time: true } } }, orderBy: { teeTime: { time: 'asc' } },
  });
  const phoneGroups = unpaid.filter(b => b.source !== 'online');
  if (phoneGroups.length < 2) throw new Error('The seed left too few unpaid phone groups this afternoon — reseed.');
  const payFor = phoneGroups[0];
  const payOnline = unpaid.find(b => b.source === 'online' && b.accessFeeTotal > 0);
  if (!payOnline) throw new Error('The seed left no unpaid online group this afternoon — reseed.');
  const payOnlineToken = payOnline.checkInToken ?? randomUUID();
  if (!payOnline.checkInToken) await prisma.booking.update({ where: { id: payOnline.id }, data: { checkInToken: payOnlineToken } });

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const laptop = async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1.8, timezoneId: TZ });
    await ctx.clock.setFixedTime(clock);
    await ctx.addCookies([{ name: 'gr_operator', value: token, url: BASE }]);
    return ctx;
  };
  const phone = async (cookie?: { name: string; value: string }) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: TZ });
    await ctx.clock.setFixedTime(clock);
    if (cookie) await ctx.addCookies([{ ...cookie, url: BASE }]);
    return ctx;
  };
  const clean = (p: { addStyleTag: (o: { content: string }) => Promise<unknown> }) => p.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }' });
  const shot = async (p: { screenshot: (o: { path: string }) => Promise<unknown> }, name: string) => { await p.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`wrote ${name}.png`); };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onTime = (p: any) => p.route('**/api/operator/sheet-money*', async (route: any) => {
    const res = await route.fetch(); const json = await res.json();
    return route.fulfill({ response: res, json: { ...json, lateGroups: 0 } });
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sane = async (p: any) => {
    const strip = await p.getByRole('group', { name: 'The day' }).innerText();
    if (/\bpast\b/.test(strip) && await p.getByText('All on time').count()) throw new Error('The strip shows late groups beside "All on time" — the clocks disagree.');
  };
  // The tee sheet, loaded and ready (the seat rows, the unpaid groups).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openSheet = async (p: any) => {
    await onTime(p);
    await p.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: LONG });
    await p.locator('[aria-label*=" booked"]').first().waitFor({ timeout: 120000 });
    await p.getByText('Not paid yet').first().waitFor({ timeout: 120000 });
    await sane(p);
    await clean(p);
    await p.waitForTimeout(800);
  };
  // A dashboard page: the page itself, then the dev overlays hidden.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openPage = async (p: any, url: string, ready: string | RegExp) => {
    await p.goto(`${BASE}${url}`, { waitUntil: 'load', timeout: LONG });
    await p.getByText(ready).first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(800);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noLoading = async (p: any) => { await p.getByText(/^Loading/).first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {}); await p.waitForTimeout(500); };
  // The 1:10 PM row of the grid, centred: both Try-it pictures are framed from here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const centre110 = async (p: any) => {
    await p.getByText('1:10', { exact: true }).first().evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(500);
  };
  // The booking page of this course (phone), today's times.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openBookingPage = async (p: any) => {
    await p.goto(`${BASE}/courses/${SLUG}`, { waitUntil: 'load', timeout: LONG });
    await p.getByText(/\/ player|prices are per player/).first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(1200);
  };
  // The booking step for 1:10 PM tomorrow (more than the free-cancellation window away, so the policy reads as it does for a golfer planning ahead).
  const bookUrl = async () => {
    const tt = await prisma.teeTime.findFirstOrThrow({ where: { courseId: course.id, date: day(1), time: '13:10', playersBooked: 0 } });
    const qp = new URLSearchParams({ tee_time_id: tt.id, course_name: course.name, course_slug: SLUG, date: tt.date, time: tt.time, players: '2', cart: '0' });
    return `${BASE}/book?${qp}`;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openBookStep = async (p: any) => {
    await p.goto(await bookUrl(), { waitUntil: 'load', timeout: LONG });
    await p.getByText('Your details').first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(2500);
  };

  // ── tee-sheet-1: the tee sheet ──
  if (want('tee-sheet-1')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openSheet(p);
    await p.evaluate(() => window.scrollTo(0, 0));
    await shot(p, 'tee-sheet-1');
    await ctx.close();
  }

  // ── tee-sheet-2 / tee-sheet-3: the booking page, and the alert form from a full time ──
  if (want('tee-sheet-2')) {
    const ctx = await phone(); const p = await ctx.newPage();
    await openBookingPage(p);
    await shot(p, 'tee-sheet-2');
    await ctx.close();
  }
  if (want('tee-sheet-3')) {
    const ctx = await phone(); const p = await ctx.newPage();
    await openBookingPage(p);
    await p.getByText('Tell me if it opens').first().click();
    await p.getByRole('dialog').waitFor({ timeout: 30000 });
    await p.waitForTimeout(800);
    await shot(p, 'tee-sheet-3');
    await ctx.close();
  }

  // ── try-before / try-after: 1:10 PM open, then Dana Ruiz's online booking ──
  if (want('try-before', 'try-after')) {
    const tt = await prisma.teeTime.findFirstOrThrow({ where: { courseId: course.id, date: today, time: '13:10' } });
    const clear = async () => {
      await prisma.booking.deleteMany({ where: { teeTimeId: tt.id } });
      await prisma.teeTime.update({ where: { id: tt.id }, data: { playersBooked: 0, status: 'available' } });
    };
    await clear();
    const ctx = await laptop(); const p = await ctx.newPage();
    await openSheet(p);
    await centre110(p);
    await shot(p, 'try-before');
    const email = 'dana.ruiz@example.com';
    await claimTeeTime({
      teeTimeId: tt.id, courseId: course.id, golferAccountId: null, golferName: 'Dana Ruiz', golferEmail: email, golferPhone: '845-555-0188', players: 2,
      appliedRate: 'standard', greenFeeTotal: tt.greenFeeCents * 2, cartFeeTotal: 0, rangeBallsTotal: 0, accessFeeTotal: 300, totalAmount: tt.greenFeeCents * 2 + 300,
      checkInToken: randomUUID(), paymentStatus: 'card_on_file', status: 'confirmed', source: 'online', termsAcceptedAt: new Date(),
    }, { type: 'golfer', id: null }, { online: true });
    await p.reload({ waitUntil: 'load', timeout: LONG });
    await p.locator('[aria-label*=" booked"]').first().waitFor({ timeout: 120000 });
    await p.getByText('Dana Ruiz').first().waitFor({ timeout: 60000 });
    await clean(p);
    await centre110(p);
    await shot(p, 'try-after');
    await ctx.close();
    await clear();
  }

  // ── payments-1: the golfer pays on their phone ──
  if (want('payments-1')) {
    const ctx = await phone(); const p = await ctx.newPage();
    await p.goto(`${BASE}/checkin/${payOnline.id}?token=${payOnlineToken}`, { waitUntil: 'load', timeout: LONG });
    await p.getByText(/pay \$/i).first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(1500);
    await shot(p, 'payments-1');
    await ctx.close();
  }

  // ── payments-2 / pro-shop-4: the booking step ──
  if (want('payments-2', 'pro-shop-4')) {
    const ctx = await phone(); const p = await ctx.newPage();
    await openBookStep(p);
    if (want('pro-shop-4')) {
      await p.getByText('Your details').first().evaluate((el: Element) => el.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(500);
      await shot(p, 'pro-shop-4');
    }
    if (want('payments-2')) {
      // One large bucket, so the total carries range balls; then the total, the policy and the agree box above the Book bar.
      await p.getByRole('button', { name: 'One more Range balls, large bucket' }).click();
      await p.waitForTimeout(600);
      await p.getByText('Green fees').first().evaluate((el: Element) => el.scrollIntoView({ block: 'start' }));
      await p.evaluate(() => window.scrollBy(0, -24));
      await p.waitForTimeout(500);
      await shot(p, 'payments-2');
    }
    await ctx.close();
  }

  // ── payments-3: a group opened on the tee sheet ──
  if (want('payments-3')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openSheet(p);
    const row = p.getByText(payFor.golferName, { exact: false }).first();
    await row.evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
    await row.click();
    await p.getByRole('dialog').getByText('Check in', { exact: true }).waitFor({ timeout: 30000 });
    await p.waitForTimeout(800);
    await shot(p, 'payments-3');
    await ctx.close();
  }

  // ── payments-4: Revenue, Payments tab ──
  if (want('payments-4')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/money', /\d+ payments/);
    await noLoading(p);
    await p.getByText(/\d+ payments/).first().evaluate((el: Element) => el.scrollIntoView({ block: 'start' }));
    await p.evaluate(() => window.scrollBy(0, -190));
    await p.waitForTimeout(500);
    await shot(p, 'payments-4');
    await ctx.close();
  }

  // ── Pro shop ──
  if (want('pro-shop-1')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/shop', 'Logo cap');
    await p.getByText('Range balls, large bucket').first().click();
    await p.getByText('Hot dog').first().click();
    await p.getByText('Charge $15.00').first().waitFor({ timeout: 60000 });
    await p.getByText('Working it out').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    await p.locator('h1').first().evaluate((el: Element) => el.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(800);
    await shot(p, 'pro-shop-1');
    await ctx.close();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopTab = async (p: any, name: string) => {
    await openPage(p, '/dashboard/shop', 'Logo cap');
    await p.getByRole('tab', { name, exact: true }).or(p.getByRole('button', { name, exact: true })).first().click();
    await p.waitForTimeout(1500);
  };
  if (want('pro-shop-2')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await shopTab(p, 'Stock');
    await shot(p, 'pro-shop-2');
    await ctx.close();
  }
  if (want('pro-shop-3')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await shopTab(p, 'Close out');
    // A count of the drawer on the page's own plus buttons (bills and coins). What should be in the drawer shows
    // only once the count is saved, which closes the register, so the picture stops at the count.
    const plus = p.getByRole('button', { name: /^(\+|One more)/ });
    for (const [i, n] of [[0, 1], [1, 2], [2, 4], [3, 3], [4, 2], [5, 6], [6, 3], [7, 2], [8, 1], [9, 4]]) for (let k = 0; k < n; k++) await plus.nth(i).click();
    await p.waitForTimeout(800);
    await shot(p, 'pro-shop-3');
    await ctx.close();
  }

  // ── Memberships ──
  if (want('memberships-1')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/members', 'Your memberships');
    await p.waitForTimeout(1000);
    await shot(p, 'memberships-1');
    await ctx.close();
  }
  if (want('memberships-2')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/members', 'Your memberships');
    await p.getByText('Full Member', { exact: true }).first().click();
    await p.getByText('Marcus Bell').first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(1000);
    await shot(p, 'memberships-2');
    await ctx.close();
  }
  if (want('memberships-3')) {
    const ctx = await phone(); const p = await ctx.newPage();
    await p.goto(`${BASE}/courses/${SLUG}/login`, { waitUntil: 'load', timeout: LONG });
    await p.getByText(/log in/i).first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(1200);
    await shot(p, 'memberships-3');
    await ctx.close();
  }
  if (want('memberships-4')) {
    // The log-in cookie, minted as the emailed code does (lib/member-session): a paid Senior member.
    const m = await prisma.courseMembership.findFirstOrThrow({ where: { courseId: course.id, membershipType: 'Senior', paymentStatus: 'paid' } });
    const value = await signMemberSessionToken({ courseId: course.id, email: m.inviteEmail });
    const ctx = await phone({ name: 'gr_member', value }); const p = await ctx.newPage();
    await openBookingPage(p);
    await p.getByText('Your price').first().waitFor({ timeout: 60000 });
    await shot(p, 'memberships-4');
    await ctx.close();
  }

  // ── Events ──
  if (want('events-1')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/events', 'Club Championship');
    await shot(p, 'events-1');
    await ctx.close();
  }
  const cup = await prisma.courseEvent.findFirst({ where: { courseId: course.id, name: 'Club Championship' } });
  if (want('events-2')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/events', 'Club Championship');
    await p.getByText('Club Championship').first().click();
    await p.getByText('Loading the event').first().waitFor({ timeout: 10000 }).catch(() => {});
    await p.getByText('Loading the event').first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(2000);
    await shot(p, 'events-2');
    await ctx.close();
  }
  if (want('events-3') && cup) {
    const ctx = await phone(); const p = await ctx.newPage();
    await p.goto(`${BASE}/events/${cup.id}`, { waitUntil: 'load', timeout: LONG });
    await p.getByText('Club Championship').first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(1200);
    await shot(p, 'events-3');
    await ctx.close();
  }

  // ── Analytics ──
  if (want('analytics-1', 'analytics-2')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    // The server reads the real time: ask for the week ending yesterday (what the range picker does).
    await p.route('**/api/operator/analytics*', (route: { request: () => { url: () => string }; continue: (o: object) => Promise<void> }) => {
      const u = new URL(route.request().url());
      if (!u.searchParams.get('from')) { u.searchParams.set('from', day(-7)); u.searchParams.set('to', day(-1)); }
      return route.continue({ url: u.toString() });
    });
    await p.goto(`${BASE}/dashboard/analytics`, { waitUntil: 'load', timeout: LONG });
    await p.getByText('Unsold player spots').first().waitFor({ timeout: 120000 });
    await clean(p);
    await p.waitForTimeout(1500);
    if (want('analytics-1')) {
      await p.getByText(/Projections/).first().waitFor({ timeout: 60000 }).catch(() => {});
      await p.getByText('Unsold player spots').first().evaluate((el: Element) => el.scrollIntoView({ block: 'start' }));
      await p.evaluate(() => window.scrollBy(0, -24));
      await p.waitForTimeout(600);
      await shot(p, 'analytics-1');
    }
    if (want('analytics-2')) {
      await p.getByRole('tab', { name: 'Reviews', exact: true }).or(p.getByRole('button', { name: 'Reviews', exact: true })).first().click();
      await p.getByText('Monthly reports').first().waitFor({ timeout: 60000 });
      await p.getByRole('button', { name: 'Read' }).first().click();
      await p.getByText('What to look at').first().waitFor({ timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(800);
      await p.getByText('Monthly reports').first().evaluate((el: Element) => el.scrollIntoView({ block: 'start' }));
      await p.evaluate(() => window.scrollBy(0, -40));
      await p.waitForTimeout(500);
      await shot(p, 'analytics-2');
    }
    await ctx.close();
  }
  if (want('analytics-3')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    const due = unpaid.filter(g => !g.checkedInAt && !g.noShowAt);
    const names = due.slice(0, 3).map(g => `${g.golferName} at ${formatTeeTime(g.teeTime.time)} (${g.players})`);
    const reply = `${due.length} groups are booked this afternoon and haven’t checked in yet: ${names.join(', ')}${due.length > 3 ? ` and ${due.length - 3} more` : ''}. I can text ${payFor.golferName.split(' ')[0]} their pay link so they can pay before they arrive.`;
    const drafted = await runProposeTool('propose_send_pay_link', { date: today, time: payFor.teeTime.time, golfer: payFor.golferName, via: 'sms' },
      { courseId: course.id, timezone: TZ, can: () => true });
    if (!('card' in drafted) || !drafted.card) throw new Error(`The real pay-link card refused: ${JSON.stringify(drafted)}`);
    const card = drafted.card;
    await p.route('**/api/birdie/chat', async (route: { request: () => { method: () => string }; fulfill: (o: object) => Promise<void> }) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: { enabled: true, persona: 'operator', greeting: "Hi — I'm your course's assistant. Ask me how to do anything on your dashboard, or what your course is set to.", chips: [], helpsWith: '' } });
      }
      const lines = [{ t: 'status', d: 'Looking at today’s tee sheet…' }, { t: 'text', d: reply }, { t: 'card', d: card }];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map(l => JSON.stringify(l)).join('\n') + '\n' });
    });
    await openSheet(p);
    await p.getByRole('button', { name: /Open the assistant|Ask the assistant/ }).first().click();
    await p.getByLabel('Message the assistant').fill('Who’s still to check in this afternoon?');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.getByText(card.title).waitFor({ timeout: 30000 });
    await p.waitForTimeout(400);
    await shot(p, 'analytics-3');
    await ctx.close();
  }

  // ── Team ──
  if (want('team-1', 'team-2', 'team-3')) {
    const ctx = await laptop(); const p = await ctx.newPage();
    await openPage(p, '/dashboard/team', 'Owen Fitzgerald');
    if (want('team-1')) await shot(p, 'team-1');
    if (want('team-3')) {
      await p.getByText('Rosa Delgado').first().click();
      await p.getByText('What Rosa can do').first().waitFor({ timeout: 60000 });
      await p.waitForTimeout(1200);
      await shot(p, 'team-3');
      await p.goto(`${BASE}/dashboard/team`, { waitUntil: 'load', timeout: LONG });
      await p.getByText('Owen Fitzgerald').first().waitFor({ timeout: 120000 });
      await clean(p);
    }
    if (want('team-2')) {
      await p.getByRole('tab', { name: 'Roles' }).or(p.getByRole('button', { name: 'Roles' })).first().click();
      await p.waitForTimeout(1500);
      await shot(p, 'team-2');
    }
    await ctx.close();
  }

  await b.close();
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

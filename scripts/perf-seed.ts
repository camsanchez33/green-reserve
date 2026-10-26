// R-GOLF-014 (Cam 2026-10-26: audit the PR's own build). The perf workflow runs
// Lighthouse against `next start` on a throwaway Postgres, so the golfer pages
// need one live public course with open tee times to render as they do live.
// Idempotent. Run: npx tsx scripts/perf-seed.ts   (slug: perf-audit)
import { appendFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const SLUG = 'perf-audit';

(async () => {
  // Never against a real database: this makes a live public course.
  const host = new URL(process.env.DATABASE_URL || 'postgresql://x@missing/x').hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) { console.error(`perf-seed: refusing to seed ${host} — local throwaway databases only`); process.exit(1); }
  const op = await prisma.courseOperator.upsert({
    where: { email: 'perf-audit@ci.local' },
    update: {},
    create: { name: 'Perf Audit', email: 'perf-audit@ci.local', password: 'ci-only-no-login' },
  });
  const course = await prisma.course.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      name: 'Perf Audit Golf Club', slug: SLUG, operatorId: op.id, address: '1 Fairway Rd', city: 'Montclair', state: 'NJ', zipCode: '07042',
      holes: 18, par: 72, type: 'public', timezone: 'America/New_York', active: true, liveStatus: 'live',
      // No late or no-show fee, so no card at booking: /book is audited without Stripe.js,
      // the path CLAUDE.md's "Stripe deferred until a card is needed" budget guards.
      lateCancellationFeeCents: 0, noShowFeeCents: 0,
      description: 'An 18-hole public course used only by the CI performance audit.',
    },
  });
  const today = todayIn('America/New_York');
  const rows = [];
  for (let d = 0; d < 3; d++) {
    const date = addDaysStr(today, d);
    for (let h = 7; h < 17; h++) for (const m of ['00', '20', '40']) {
      rows.push({ courseId: course.id, date, time: `${String(h).padStart(2, '0')}:${m}`, holes: 18, greenFeeCents: 6500, cartFeeCents: 2000, playersAvailable: 4 });
    }
  }
  const existing = await prisma.teeTime.count({ where: { courseId: course.id, date: { gte: today } } });
  if (!existing) await prisma.teeTime.createMany({ data: rows });
  // /book is audited with a real open time (tomorrow, so it is never in the past).
  const tomorrow = addDaysStr(today, 1);
  const tt = await prisma.teeTime.findFirstOrThrow({ where: { courseId: course.id, date: tomorrow }, orderBy: { time: 'asc' }, select: { id: true } });
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `AUDIT_TEE_TIME_ID=${tt.id}\nAUDIT_DATE=${tomorrow}\n`);
  console.log(`perf-seed: ${SLUG} ready (${existing || rows.length} tee times from ${today}); /book uses ${tt.id} on ${tomorrow}`);
  await prisma.$disconnect();
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

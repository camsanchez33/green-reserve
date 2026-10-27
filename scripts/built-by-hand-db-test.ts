// Cam 2026-10-27: a course made with Admin → Create course has no inquiry on
// purpose. It is marked built by hand, never reads as "Orphaned", and the
// orphan sweep never deletes or archives it. Also: resending a sign-in code is
// rate-limited (it used to let anyone with an owner's password flood them).
// Real database. Run: npx tsx scripts/built-by-hand-db-test.ts
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { computeCourseHealth } from '../src/lib/course-metrics';
import { sweepOrphanCourses, forceDeleteOrphan } from '../src/lib/lifecycle';
import { signPendingTwoFactorToken } from '../src/lib/auth';
import { POST as resend } from '../src/app/api/auth/2fa/resend/route';

const TAG = 'builtbyhandtest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  await prisma.securityEvent.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: '2fa-resend:' } } }).catch(() => {});
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-built-by-hand-0123456789abcdef';
  await cleanup();
  const old = new Date(Date.now() - 90 * 86_400_000);
  const op = await prisma.courseOperator.create({ data: { name: 'Hand Test', email: `${TAG}@t.local`, password: 'x' } });
  const op2 = await prisma.courseOperator.create({ data: { name: 'Orphan Test', email: `${TAG}+2@t.local`, password: 'x' } });
  const hand = await prisma.course.create({ data: { name: 'Hand Built GC', slug: `${TAG}-hand`, operatorId: op.id, address: 'a', city: 'c', state: 'NY', zipCode: '1', builtByHand: true, createdAt: old } });
  const orphan = await prisma.course.create({ data: { name: 'Lost Inquiry GC', slug: `${TAG}-orphan`, operatorId: op2.id, address: 'a', city: 'c', state: 'NY', zipCode: '1', createdAt: old } });

  const base = { archivedAt: null, active: false, liveStatus: 'draft', stripeAccountActive: false, welcomeEmailSentAt: null, createdAt: old, bookings30d: 0, bookingsPrev30d: 0 };
  ok('a course with a lost inquiry still reads as Orphaned', computeCourseHealth({ ...base, hasLinkedInquiry: false }).status === 'orphaned');
  const routes = ['src/app/api/admin/courses/route.ts', 'src/app/api/admin/course-detail/route.ts'].map(f => readFileSync(f, 'utf8'));
  ok('the courses list and course page treat built by hand as linked, so it reads as setup, not Orphaned', routes[0].includes('linkedCourseIds.has(c.id) || c.builtByHand') && routes[1].includes('!!linkedInquiry || course.builtByHand'));

  const dry = await sweepOrphanCourses('test', true);
  ok('the sweep still finds a real orphan', dry.some(i => i.id === orphan.id));
  ok('…and never lists a course built by hand', !dry.some(i => i.id === hand.id));
  const force = await forceDeleteOrphan(hand.id, hand.name, 'test');
  ok('force delete refuses a course built by hand', !force.ok && (await prisma.course.count({ where: { id: hand.id } })) === 1);
  ok('Create course marks it when there is no inquiry', readFileSync('src/app/api/admin/create-course/route.ts', 'utf8').includes('builtByHand: !fromInquiry,'));

  // Resend: 5 per sign-in in 10 minutes, then 429 with a security event.
  // A fresh address each run: security events from one address are recorded once per 10 minutes.
  const ip = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const pending = await signPendingTwoFactorToken({ operatorId: op.id });
  const call = () => resend(new NextRequest('http://localhost/api/auth/2fa/resend?method=email', { method: 'POST', headers: { cookie: `gr_2fa_pending=${pending}`, 'x-forwarded-for': ip } }));
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await call()).status);
  ok('five resends go through (the send itself may fail here without an email key)', statuses.slice(0, 5).every(s => s !== 429), statuses);
  ok('the sixth in ten minutes is refused', statuses[5] === 429, statuses);
  ok('…and recorded as a security event', (await prisma.securityEvent.count({ where: { accountId: op.id, kind: 'rate_limited', detail: 'resend sign-in code' } })) === 1);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`built-by-hand: ${failed} failed`); process.exit(1); }
  console.log('built-by-hand: all passed');
})();

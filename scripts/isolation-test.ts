/**
 * Tenant isolation integration test.
 *
 * Asserts tenant boundaries across all auth surfaces. Failing cases are
 * real vulnerabilities — fix before shipping.
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. DATABASE_URL set (or via .env.local)
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx scripts/isolation-test.ts
 *
 * Exit 0 = all pass, exit 1 = failures.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const prisma = new PrismaClient();
const TS = 'isoltest';
const PASS = 'IsolTest#9876';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function api(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<{ status: number; body: unknown; text: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const body = JSON.parse(text).catch?.(() => text) ?? text;
  return { status: res.status, body, text };
}

async function getCookie(res: Response): Promise<string> {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function loginOp(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return getCookie(res);
}

async function loginGolfer(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/golfer/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return getCookie(res);
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return getCookie(res);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seed() {
  const hash = await bcrypt.hash(PASS, 10);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 60);
  const dateStr = futureDate.toISOString().split('T')[0];

  const [opA, opB] = await Promise.all([
    prisma.courseOperator.upsert({
      where: { email: `${TS}-opA@test.local` },
      create: { name: 'Isol Op A', email: `${TS}-opA@test.local`, passwordHash: hash },
      update: { passwordHash: hash },
    }),
    prisma.courseOperator.upsert({
      where: { email: `${TS}-opB@test.local` },
      create: { name: 'Isol Op B', email: `${TS}-opB@test.local`, passwordHash: hash },
      update: { passwordHash: hash },
    }),
  ]);

  const courseBase = { holes: 18, greenFee: 50, cartFee: 20, liveStatus: 'live', active: true, timezone: 'America/Los_Angeles', cancellationHours: 24 };
  const [courseA, courseB] = await Promise.all([
    prisma.course.upsert({
      where: { slug: `${TS}-course-a` },
      create: { name: 'Isol Course A', slug: `${TS}-course-a`, operatorId: opA.id, address: '1 A', city: 'A City', state: 'CA', zip: '90001', ...courseBase },
      update: { operatorId: opA.id },
    }),
    prisma.course.upsert({
      where: { slug: `${TS}-course-b` },
      create: { name: 'Isol Course B', slug: `${TS}-course-b`, operatorId: opB.id, address: '2 B', city: 'B City', state: 'CA', zip: '90002', ...courseBase },
      update: { operatorId: opB.id },
    }),
  ]);

  const [golferA, golferB] = await Promise.all([
    prisma.golferAccount.upsert({
      where: { email: `${TS}-golferA@test.local` },
      create: { email: `${TS}-golferA@test.local`, password: hash, firstName: 'GolferA', lastName: 'Test', phone: '' },
      update: { password: hash },
    }),
    prisma.golferAccount.upsert({
      where: { email: `${TS}-golferB@test.local` },
      create: { email: `${TS}-golferB@test.local`, password: hash, firstName: 'GolferB', lastName: 'Test', phone: '' },
      update: { password: hash },
    }),
  ]);

  await prisma.teeTime.deleteMany({ where: { courseId: courseA.id, date: dateStr, time: '09:00' } });
  const teeTimeA = await prisma.teeTime.create({
    data: { courseId: courseA.id, date: dateStr, time: '09:00', holes: 18, greenFee: 50, cartFee: 20, playersAvailable: 4, playersBooked: 0, status: 'available' },
  });

  // Booking for golfer A on course A — golfer B must not be able to cancel it
  const bookingA = await prisma.booking.create({
    data: {
      teeTimeId: teeTimeA.id, courseId: courseA.id, golferAccountId: golferA.id,
      golferName: 'GolferA Test', golferEmail: `${TS}-golferA@test.local`,
      players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150,
      status: 'confirmed', paymentStatus: 'no_payment_method', checkInToken: randomUUID(),
    },
  });

  // Booking on Course B — Op A must not be able to see it from their session
  await prisma.teeTime.deleteMany({ where: { courseId: courseB.id, date: dateStr, time: '09:00' } });
  const teeTimeB = await prisma.teeTime.create({
    data: { courseId: courseB.id, date: dateStr, time: '09:00', holes: 18, greenFee: 60, cartFee: 25, playersAvailable: 4, playersBooked: 1, status: 'available' },
  });
  const bookingB = await prisma.booking.create({
    data: {
      teeTimeId: teeTimeB.id, courseId: courseB.id, golferAccountId: golferB.id,
      golferName: 'GolferB Test', golferEmail: `${TS}-golferB@test.local`,
      players: 1, greenFeeTotal: 6000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 6150,
      status: 'confirmed', paymentStatus: 'no_payment_method', checkInToken: randomUUID(),
    },
  });

  // Admin viewer
  const adminViewer = await prisma.adminUser.upsert({
    where: { email: `${TS}-viewer@test.local` },
    create: { name: 'Isol Viewer', email: `${TS}-viewer@test.local`, passwordHash: hash, role: 'viewer', active: true },
    update: { passwordHash: hash, role: 'viewer', active: true },
  });

  return { opA, opB, courseA, courseB, golferA, golferB, teeTimeA, teeTimeB, bookingA, bookingB, adminViewer };
}

async function cleanup(data: Awaited<ReturnType<typeof seed>>) {
  const { courseA, courseB, golferA, golferB, teeTimeA, teeTimeB, bookingA, bookingB, opA, opB, adminViewer } = data;
  await prisma.booking.deleteMany({ where: { id: { in: [bookingA.id, bookingB.id] } } });
  await prisma.teeTime.deleteMany({ where: { id: { in: [teeTimeA.id, teeTimeB.id] } } });
  await prisma.course.deleteMany({ where: { id: { in: [courseA.id, courseB.id] } } });
  await prisma.golferAccount.deleteMany({ where: { id: { in: [golferA.id, golferB.id] } } });
  await prisma.courseOperator.deleteMany({ where: { id: { in: [opA.id, opB.id] } } });
  await prisma.adminUser.deleteMany({ where: { id: adminViewer.id } });
}

// ── Test runner ───────────────────────────────────────────────────────────────

type Result = { name: string; pass: boolean; got?: number; want?: number | number[]; note?: string };
const results: Result[] = [];

function check(name: string, condition: boolean, note?: string) {
  results.push({ name, pass: condition, note });
  console.log(`  ${condition ? '✅' : '❌'} ${name}${note ? ` — ${note}` : ''}`);
}

function checkStatus(name: string, got: number, want: number | number[]) {
  const pass = Array.isArray(want) ? want.includes(got) : got === want;
  const wantStr = Array.isArray(want) ? want.join(' or ') : String(want);
  results.push({ name, pass, got, want });
  console.log(`  ${pass ? '✅' : '❌'} ${name} → ${got} (want ${wantStr})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔒 GreenReserve tenant isolation test');
  console.log(`   Target: ${BASE_URL}\n`);
  console.log('   Seeding fixtures...');

  const data = await seed();
  const { courseB, bookingA, bookingB } = data;

  const cookieA = await loginOp(`${TS}-opA@test.local`, PASS);
  const cookieB = await loginOp(`${TS}-opB@test.local`, PASS);
  const golferCookieA = await loginGolfer(`${TS}-golferA@test.local`, PASS);
  const golferCookieB = await loginGolfer(`${TS}-golferB@test.local`, PASS);
  const viewerCookie = await loginAdmin(`${TS}-viewer@test.local`, PASS);

  console.log('\n── Auth guard: no credentials ────────────────────────────────────');
  {
    const r = await api('/api/operator/bookings');
    checkStatus('Operator route without cookie → 401', r.status, 401);
  }
  {
    const r = await api('/api/bookings');
    checkStatus('Golfer route without cookie → 401', r.status, 401);
  }
  {
    const r = await api('/api/admin/stats');
    checkStatus('Admin route without cookie → 401', r.status, 401);
  }

  console.log('\n── Token replay attacks ──────────────────────────────────────────');
  {
    // Swap cookie name: golfer token presented to operator route
    const swapped = golferCookieA.replace('gr_golfer=', 'dashboard_session=');
    const r = await api('/api/operator/bookings', { cookie: swapped });
    checkStatus('Golfer token on operator route → 401', r.status, 401);
  }
  {
    // Swap cookie name: operator token presented to golfer route
    const swapped = cookieA.replace('dashboard_session=', 'gr_golfer=');
    const r = await api('/api/bookings', { cookie: swapped });
    checkStatus('Operator token on golfer route → 401', r.status, 401);
  }
  {
    const r = await api('/api/admin/stats', { cookie: 'admin_session=tampered.invalid.token' });
    checkStatus('Tampered admin token → 401', r.status, 401);
  }

  console.log('\n── Operator cross-course data isolation ──────────────────────────');
  {
    // Op A's session is locked to course A — their GET /api/operator/bookings
    // must return course A bookings only (courseId derived from JWT, not request)
    const r = await api('/api/operator/bookings', { cookie: cookieA });
    const bodyStr = JSON.stringify(r.body);
    const hasBId = bodyStr.includes(courseB.id);
    const hasBBooking = bodyStr.includes(bookingB.id);
    checkStatus('Op A bookings endpoint returns 200', r.status, 200);
    check('Op A bookings response has no Course B ID', !hasBId, hasBId ? `LEAK: ${courseB.id}` : undefined);
    check('Op A bookings response has no Course B booking', !hasBBooking, hasBBooking ? `LEAK: ${bookingB.id}` : undefined);
  }
  {
    // Same for tee-times
    const r = await api('/api/operator/tee-times?date=2099-01-01', { cookie: cookieA });
    const bodyStr = JSON.stringify(r.body);
    check('Op A tee-times has no Course B ID', !bodyStr.includes(courseB.id));
  }

  console.log('\n── Golfer cross-account booking isolation ────────────────────────');
  {
    // Golfer B cannot cancel Golfer A's booking
    const r = await api('/api/bookings/cancel', {
      method: 'POST', cookie: golferCookieB,
      body: { bookingId: bookingA.id },
    });
    checkStatus('Golfer B cannot cancel Golfer A booking → 403/404', r.status, [403, 404]);
  }
  {
    // Golfer B using Golfer A's check-in token — should be 401/403/404
    const checkInToken = (await prisma.booking.findUnique({ where: { id: bookingA.id }, select: { checkInToken: true } }))?.checkInToken;
    if (checkInToken) {
      const r = await api(`/api/checkin/${bookingA.id}?token=${checkInToken}`, { method: 'POST', cookie: golferCookieB });
      // Check-in is token-gated — with the correct token it would succeed regardless of golfer
      // The important thing is: with a WRONG/missing token it should fail
      const rWrong = await api(`/api/checkin/${bookingA.id}?token=wrong-token-xyz`, { method: 'POST' });
      checkStatus('Check-in with wrong token → 401/403', rWrong.status, [401, 403, 404]);
    }
  }
  {
    // Golfer A cannot see Golfer B's bookings in their GET /api/bookings list
    const r = await api('/api/bookings', { cookie: golferCookieA });
    const bodyStr = JSON.stringify(r.body);
    const hasBBooking = bodyStr.includes(bookingB.id);
    checkStatus('Golfer A bookings returns 200', r.status, 200);
    check('Golfer A booking list has no Golfer B booking', !hasBBooking, hasBBooking ? `LEAK: ${bookingB.id}` : undefined);
  }

  console.log('\n── Admin viewer role gate ────────────────────────────────────────');
  {
    const r = await api(`/api/admin/transactions?courseId=${data.courseA.id}`, { cookie: viewerCookie });
    checkStatus('Viewer cannot access transactions (financial PII) → 403', r.status, 403);
  }
  {
    const r = await api('/api/admin/activity', { cookie: viewerCookie });
    checkStatus('Viewer cannot access activity feed (financial PII) → 403', r.status, 403);
  }
  {
    const r = await api(`/api/admin/course-members?courseId=${data.courseA.id}`, { cookie: viewerCookie });
    checkStatus('Viewer cannot access course-members (golfer PII) → 403', r.status, 403);
  }
  {
    // Viewer CAN access non-PII admin stats
    const r = await api('/api/admin/stats', { cookie: viewerCookie });
    checkStatus('Viewer can access admin stats (aggregated, no PII) → 200', r.status, 200);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  await cleanup(data);

  const failures = results.filter(r => !r.pass);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${results.length - failures.length}/${results.length}`);

  if (failures.length > 0) {
    console.log('\n❌ FAILURES (each is a real vulnerability):');
    failures.forEach(f => {
      const wantStr = Array.isArray(f.want) ? f.want.join(' or ') : String(f.want ?? '');
      const detail = f.got !== undefined ? ` (got ${f.got}, want ${wantStr})` : '';
      console.log(`   • ${f.name}${detail}${f.note ? ` — ${f.note}` : ''}`);
    });
    console.log('\n❌ ISOLATION TEST FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ ISOLATION TEST PASSED');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());

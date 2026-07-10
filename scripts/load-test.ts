/**
 * Load test — 100-course Saturday morning spike.
 *
 * Seeds 100 courses each with a day of tee times, then fires concurrent booking
 * requests: spread traffic across many courses + heavy contention on a few hot slots.
 *
 * Asserts:
 *   - No double-books (capacity invariant holds via claimTeeTime)
 *   - No 500 errors from connection exhaustion
 *   - p95 latency < 3000 ms
 *   - Every request resolves (200 or 409, never a hang)
 *
 * NEVER run against production. Point DATABASE_URL at a branch DB.
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. .env.local with DATABASE_URL pointing at a branch/test DB
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx scripts/load-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const prisma = new PrismaClient();
const TS = `loadtest-${Date.now()}`;

const NUM_COURSES = 100;
const HOT_SLOTS = 3;          // slots that get hammered with concurrent requests
const HOT_CONCURRENT = 8;     // concurrent requests per hot slot
const SPREAD_CONCURRENT = 40; // concurrent requests spread across remaining courses
const P95_THRESHOLD_MS = 3000;

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seed() {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const dateStr = futureDate.toISOString().split('T')[0];

  // Create a single "load test" operator to own all courses
  const operator = await prisma.courseOperator.create({
    data: {
      name: `${TS}-op`,
      email: `${TS}@loadtest.local`,
      password: 'x',
    },
  });

  // 100 courses
  const courses = await Promise.all(
    Array.from({ length: NUM_COURSES }, (_, i) =>
      prisma.course.create({
        data: {
          slug: `${TS}-course-${i}`,
          name: `Load Test Course ${i}`,
          city: 'TestCity',
          state: 'CA',
          zipCode: '90001',
          address: `${i} Test Dr`,
          holes: 18,
          timezone: 'America/Los_Angeles',
          cancellationHours: 24,
          liveStatus: 'live',
          active: true,
        },
      })
    )
  );

  // Each course gets 4 tee times for the date; HOT_SLOTS on the first course
  // only have capacity 1 to maximize contention
  const allTeeTimes = await Promise.all(
    courses.flatMap((c, ci) => {
      const times = ['08:00', '08:08', '08:16', '08:24'];
      return times.map((time, ti) => {
        const isHot = ci === 0 && ti < HOT_SLOTS;
        return prisma.teeTime.create({
          data: {
            courseId: c.id,
            date: dateStr,
            time,
            holes: 18,
            greenFee: 50,
            cartFee: 20,
            playersAvailable: isHot ? 1 : 4,
            playersBooked: 0,
            status: 'available',
          },
        });
      });
    })
  );

  return { operator, courses, allTeeTimes, dateStr };
}

async function cleanup(data: Awaited<ReturnType<typeof seed>>) {
  const courseIds = data.courses.map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: courseIds } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: courseIds } } });
  await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  await prisma.courseOperator.delete({ where: { id: data.operator.id } });
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function postBooking(teeTimeId: string, players: number): Promise<{ status: number; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teeTimeId,
        players,
        golferName: `Load Tester ${randomUUID().slice(0, 6)}`,
        golferEmail: `lt-${randomUUID().slice(0, 8)}@loadtest.local`,
        golferPhone: '',
        paymentMethodId: null,
        customerId: null,
        cartSelected: false,
        rangeBallsSize: '',
      }),
    });
    return { status: res.status, ms: Date.now() - start };
  } catch {
    return { status: 0, ms: Date.now() - start };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nGreenReserve load test — ${BASE_URL}`);
  console.log(`Seeding ${NUM_COURSES} courses...`);
  const data = await seed();
  const { allTeeTimes, courses } = data;

  // Hot tee times: first HOT_SLOTS slots on course 0, capacity=1
  const hotTimes = allTeeTimes.filter(
    t => t.courseId === courses[0].id && ['08:00', '08:08', '08:16'].includes(t.time)
  );

  // Spread tee times: one slot per course (all others), capacity=4
  const spreadTimes = courses.slice(1, 1 + SPREAD_CONCURRENT).map(c => {
    const t = allTeeTimes.find(tt => tt.courseId === c.id && tt.time === '08:00');
    return t!;
  });

  const allLatencies: number[] = [];
  let successes = 0;
  let conflicts = 0;
  let errors = 0;

  // ── Hot slot contention ───────────────────────────────────────────────────
  console.log(`\nHot slot contention: ${hotTimes.length} slots × ${HOT_CONCURRENT} concurrent...`);
  const hotRequests: Promise<{ status: number; ms: number }>[] = [];
  for (const tt of hotTimes) {
    for (let i = 0; i < HOT_CONCURRENT; i++) {
      hotRequests.push(postBooking(tt.id, 1));
    }
  }
  const hotResults = await Promise.all(hotRequests);
  for (const r of hotResults) {
    allLatencies.push(r.ms);
    if (r.status === 200 || r.status === 201) successes++;
    else if (r.status === 409) conflicts++;
    else errors++;
  }

  // ── Spread traffic ────────────────────────────────────────────────────────
  console.log(`Spread traffic: ${spreadTimes.length} courses × 2 concurrent...`);
  const spreadRequests: Promise<{ status: number; ms: number }>[] = [];
  for (const tt of spreadTimes) {
    for (let i = 0; i < 2; i++) {
      spreadRequests.push(postBooking(tt.id, 2));
    }
  }
  const spreadResults = await Promise.all(spreadRequests);
  for (const r of spreadResults) {
    allLatencies.push(r.ms);
    if (r.status === 200 || r.status === 201) successes++;
    else if (r.status === 409) conflicts++;
    else errors++;
  }

  // ── Verify no double-books ─────────────────────────────────────────────────
  console.log('\nVerifying capacity invariant...');
  const courseIds = courses.map(c => c.id);
  const bookings = await prisma.booking.findMany({
    where: { courseId: { in: courseIds }, status: 'confirmed' },
    select: { teeTimeId: true, players: true },
  });
  const bySlot = new Map<string, number>();
  for (const b of bookings) {
    bySlot.set(b.teeTimeId, (bySlot.get(b.teeTimeId) ?? 0) + b.players);
  }
  const teeTimeMap = new Map(allTeeTimes.map(t => [t.id, t]));
  let doubleBooks = 0;
  for (const [ttId, booked] of bySlot) {
    const tt = teeTimeMap.get(ttId);
    if (tt && booked > tt.playersAvailable) {
      console.error(`  DOUBLE-BOOK: slot ${ttId} booked=${booked} capacity=${tt.playersAvailable}`);
      doubleBooks++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  await cleanup(data);

  const total = allLatencies.length;
  allLatencies.sort((a, b) => a - b);
  const p50 = allLatencies[Math.floor(total * 0.5)];
  const p95 = allLatencies[Math.floor(total * 0.95)];
  const p99 = allLatencies[Math.floor(total * 0.99)];
  const max = allLatencies[total - 1];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Total requests : ${total}`);
  console.log(`  200 success  : ${successes}`);
  console.log(`  409 conflict : ${conflicts}`);
  console.log(`  error/hang   : ${errors}`);
  console.log(`Latency p50    : ${p50} ms`);
  console.log(`Latency p95    : ${p95} ms  (threshold: ${P95_THRESHOLD_MS} ms)`);
  console.log(`Latency p99    : ${p99} ms`);
  console.log(`Latency max    : ${max} ms`);
  console.log(`Double-books   : ${doubleBooks}`);

  const pass = doubleBooks === 0 && errors === 0 && p95 < P95_THRESHOLD_MS;
  if (pass) {
    console.log('\nLOAD TEST PASSED');
    process.exit(0);
  } else {
    if (doubleBooks > 0) console.error(`FAIL: ${doubleBooks} double-book(s) — capacity invariant violated`);
    if (errors > 0) console.error(`FAIL: ${errors} error/hang responses (expected 200 or 409 only)`);
    if (p95 >= P95_THRESHOLD_MS) console.error(`FAIL: p95 latency ${p95} ms exceeds ${P95_THRESHOLD_MS} ms`);
    console.error('\nLOAD TEST FAILED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

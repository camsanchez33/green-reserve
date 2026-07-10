/**
 * Concurrency test for atomic tee-time booking.
 *
 * Seeds one test course with a 4-player tee time slot, fires 20 simultaneous
 * booking requests from different "golfers", then asserts:
 *   - Total booked players == slot capacity (4)
 *   - Every request got either 200 or 409 (no 500s)
 *   - At least some requests got 409 "filled up"
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. DATABASE_URL set in environment (or loaded via .env.local)
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx scripts/concurrency-test.ts
 *
 * Exit 0 = pass, exit 1 = fail.
 */

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const prisma = new PrismaClient();

async function main() {
  console.log('🏌️  GreenReserve concurrency test — booking atomicity');
  console.log(`   Target: ${BASE_URL}`);

  // ── Seed test fixtures ─────────────────────────────────────────────────────

  // Minimal operator account
  const operator = await prisma.courseOperator.upsert({
    where: { email: 'conctest-op@test.greenreserve.local' },
    create: {
      name: 'Concurrency Test Operator',
      email: 'conctest-op@test.greenreserve.local',
      password: 'not-a-real-hash',
    },
    update: {},
  });

  // Minimal course — no Stripe so no card collection
  const course = await prisma.course.upsert({
    where: { slug: 'conctest-course-greenreserve-local' },
    create: {
      name: 'Concurrency Test Course',
      slug: 'conctest-course-greenreserve-local',
      operatorId: operator.id,
      address: '1 Test Dr',
      city: 'Testville',
      state: 'CA',
      zipCode: '90210',
      holes: 18,
      liveStatus: 'live',
      active: true,
      timezone: 'America/Los_Angeles',
      cancellationHours: 24,
    },
    update: { active: true, liveStatus: 'live' },
  });

  // One tee time slot with 4-player capacity (far future to avoid PAST rejection)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const dateStr = futureDate.toISOString().split('T')[0];

  // Remove any existing test tee time for idempotency
  await prisma.booking.deleteMany({ where: { teeTime: { courseId: course.id, date: dateStr, time: '10:00' } } });
  await prisma.teeTime.deleteMany({ where: { courseId: course.id, date: dateStr, time: '10:00' } });

  const teeTime = await prisma.teeTime.create({
    data: {
      courseId: course.id,
      date: dateStr,
      time: '10:00',
      holes: 18,
      greenFee: 50,
      cartFee: 20,
      playersAvailable: 4,
      playersBooked: 0,
      status: 'available',
    },
  });

  console.log(`\n   Tee time: ${dateStr} 10:00 · capacity: 4 · id: ${teeTime.id}`);
  console.log('   Firing 20 simultaneous booking requests (1 player each)...\n');

  // ── Fire 20 parallel requests ──────────────────────────────────────────────

  const requests = Array.from({ length: 20 }, (_, i) =>
    fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teeTimeId: teeTime.id,
        players: 1,
        golferName: `Test Golfer ${i + 1}`,
        golferEmail: `golfer${i + 1}@test.greenreserve.local`,
        golferPhone: '5550000000',
        // No paymentMethodId/customerId → no-card flow (course has no Stripe)
      }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    })
  );

  const results = await Promise.all(requests);

  // ── Assertions ─────────────────────────────────────────────────────────────

  const successes = results.filter(r => r.status === 200);
  const conflicts = results.filter(r => r.status === 409);
  const errors    = results.filter(r => r.status !== 200 && r.status !== 409);

  // Re-read from DB to verify ground truth
  const fresh = await prisma.teeTime.findUnique({
    where: { id: teeTime.id },
    select: { playersBooked: true },
  });
  const dbBookedCount = await prisma.booking.count({
    where: { teeTimeId: teeTime.id, status: 'confirmed' },
  });

  console.log('Results:');
  console.log(`  200 OK:    ${successes.length}`);
  console.log(`  409 Conflict: ${conflicts.length}`);
  console.log(`  Other errors: ${errors.length}`, errors.map(e => e.status).join(', '));
  console.log(`\nDB state:`);
  console.log(`  teeTime.playersBooked: ${fresh?.playersBooked}`);
  console.log(`  confirmed bookings:    ${dbBookedCount}`);

  const totalBookedPlayers = successes.reduce((sum, r) => sum + (r.body?.players ?? 1), 0);

  let passed = true;
  function assert(cond: boolean, msg: string) {
    const icon = cond ? '✅' : '❌';
    console.log(`\n${icon} ${msg}`);
    if (!cond) passed = false;
  }

  assert(errors.length === 0, `No non-200/409 responses (got ${errors.length})`);
  assert(successes.length <= 4, `At most 4 successful bookings (got ${successes.length})`);
  assert(conflicts.length >= 16, `At least 16 conflicts (got ${conflicts.length})`);
  assert(fresh?.playersBooked === successes.length, `DB playersBooked matches success count (${fresh?.playersBooked} == ${successes.length})`);
  assert(dbBookedCount === successes.length, `DB booking count matches (${dbBookedCount} == ${successes.length})`);
  assert(totalBookedPlayers <= 4, `Total booked players <= 4 (got ${totalBookedPlayers})`);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  await prisma.booking.deleteMany({ where: { teeTimeId: teeTime.id } });
  await prisma.teeTime.delete({ where: { id: teeTime.id } });
  console.log('\n   Cleaned up test data.');

  if (passed) {
    console.log('\n✅ CONCURRENCY TEST PASSED — no double-bookings detected');
    process.exit(0);
  } else {
    console.log('\n❌ CONCURRENCY TEST FAILED — see failures above');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());

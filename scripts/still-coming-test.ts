// R-CRON-001 — "still coming" must stick. Staff clear a no-show (noShowAt back
// to null, both charges refunded); the hourly cron's automatic no-show used to
// pick the booking straight back up, since its due time was still past, and
// mark + charge it again. dueAutoNoShows() is the cron's own list.
// Needs a database, no Stripe. Run: npx tsx scripts/still-coming-test.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { dueAutoNoShows } from '../src/lib/no-show-fee';

const prisma = new PrismaClient();
const TAG = 'stillcomingtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  const bookings = await prisma.booking.findMany({ where: { courseId }, select: { id: true } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookings.map(b => b.id) } } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const operator = await prisma.courseOperator.create({ data: { name: 'Still Coming Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' } });
  // UTC timezone keeps the test independent of where it runs.
  const course = await prisma.course.create({
    data: {
      name: 'Still Coming Test Course', slug: `${TAG}-course`, operatorId: operator.id,
      address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18,
      liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
    },
  });
  // Tee time two hours ago, auto no-show after 15 minutes → due.
  const now = new Date();
  const tee = new Date(now.getTime() - 2 * 3600_000);
  const date = tee.toISOString().slice(0, 10);
  const time = tee.toISOString().slice(11, 16);
  const mk = async (label: string) => {
    const t = await prisma.teeTime.create({ data: { courseId: course.id, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 1, status: 'available' } }).catch(async () =>
      prisma.teeTime.findFirstOrThrow({ where: { courseId: course.id, date, time } }));
    return prisma.booking.create({
      data: {
        teeTimeId: t.id, courseId: course.id, golferName: label, golferEmail: `${TAG}-${label}@test.local`,
        players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000,
        status: 'confirmed', paymentStatus: 'card_on_file', checkInToken: randomUUID(), autoNoShowMinutesAtBooking: 15,
      },
    });
  };
  const untouched = await mk('untouched');
  const clearedB = await mk('cleared');

  // What "still coming" leaves behind: noShowAt null (never set here) + a no_show_cleared event.
  await prisma.bookingEvent.create({ data: { bookingId: clearedB.id, courseId: course.id, type: 'no_show_cleared', actorType: 'staff', playerCount: 1 } });

  const due = await dueAutoNoShows(now);
  check('a late, never-cleared booking is due for automatic no-show', due.includes(untouched.id));
  check('a booking staff cleared with "still coming" is NOT re-marked', !due.includes(clearedB.id));

  const early = await dueAutoNoShows(new Date(tee.getTime() + 10 * 60_000));
  check('nothing is due before the N-minute grace has passed', !early.includes(untouched.id));

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

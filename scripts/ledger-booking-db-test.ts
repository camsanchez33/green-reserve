// REVIEW_LEDGER follow-ups (2026-10-26): R-BOOK-002 two cancels of one booking
// at once free its seats once, and R-AUTH-010 / R-OPS-010 the settings and
// course PATCH never return the raw Course row. Real database, no Stripe (the
// booking carries no fees). Run: npx tsx scripts/ledger-booking-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { performCancellation } from '../src/lib/cancel-booking';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'ledgerbook';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Ledger Book GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', lateCancellationFeeCents: 0 } });
  const date = addDaysStr(todayIn('UTC'), 5);
  // Two groups on one time: 3 + 1 of 4 seats.
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'full' } });
  const mk = (players: number) => prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'G', golferEmail: `${TAG}+${players}@t.local`, players,
    greenFeeTotal: 5000 * players, cartFeeTotal: 0, accessFeeTotal: 150 * players, totalAmount: 5150 * players, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const three = await mk(3);
  await mk(1);

  const STAFF = { type: 'staff' as const, id: null };
  const [a, b] = await Promise.all([performCancellation(three.id, STAFF, { notifySlotAlerts: false }), performCancellation(three.id, STAFF, { notifySlotAlerts: false })]);
  const wins = [a, b].filter(r => 'success' in r && r.success).length;
  ok('two cancels of one booking at once: exactly one succeeds', wins === 1, { a, b });
  const slot = await prisma.teeTime.findUniqueOrThrow({ where: { id: tt.id } });
  ok('…and its 3 seats are freed once (4 → 1), never twice', slot.playersBooked === 1, slot.playersBooked);
  const events = await prisma.bookingEvent.count({ where: { bookingId: three.id, type: 'booking_cancelled' } });
  ok('…with one cancel event', events === 1, events);
  const again = await performCancellation(three.id, STAFF, { notifySlotAlerts: false });
  ok('a third cancel afterwards is refused', 'error' in again && again.status === 409);

  for (const f of ['src/app/api/operator/settings/route.ts', 'src/app/api/operator/courses/route.ts']) {
    const src = readFileSync(f, 'utf8');
    ok(`${f.split('/')[4]} PATCH returns the stripped course, never the raw row`, src.includes('return NextResponse.json(operatorSafe(courseToWire(updated)));') && !src.includes('return NextResponse.json(updated);'));
  }

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('ledger-booking-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

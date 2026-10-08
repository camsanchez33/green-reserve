// ACT-1 (PLATFORM_ROADMAP_SPEC §2): moving a group to another tee time — the
// one lib/move-booking.ts that staff, the golfer's own swap and frost delay
// share. Proves the price rules (kept by default; at the new slot a member
// keeps their tier rate and a counter booking never gains a booking fee), the
// slot counts, the checks, the dry run and the event. Needs a database.
// Run: npx tsx scripts/move-booking-test.ts
import { PrismaClient } from '@prisma/client';
import { moveBooking } from '../src/lib/move-booking';

const prisma = new PrismaClient();
const TAG = 'movebookingtest';
const NOW = new Date('2026-10-08T12:00:00Z');
const STAFF = { type: 'staff' as const, id: null };
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  const bookings = await prisma.booking.findMany({ where: { courseId }, select: { id: true } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookings.map(b => b.id) } } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

let n = 0;
async function course() {
  const operator = await prisma.courseOperator.upsert({
    where: { email: `${TAG}@test.local` }, update: {},
    create: { name: 'Move Test', email: `${TAG}@test.local`, password: 'not-a-real-hash' },
  });
  return prisma.course.create({ data: {
    name: 'Move Test Course', slug: `${TAG}-${++n}`, operatorId: operator.id, address: '1 Test Dr', city: 'Testville', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
  } });
}
const slot = (courseId: string, date: string, time: string, o: { green?: number; booked?: number; status?: string } = {}) => prisma.teeTime.create({ data: {
  courseId, date, time, holes: 18, greenFeeCents: o.green ?? 5000, cartFeeCents: 2000, playersAvailable: 4, playersBooked: o.booked ?? 0, status: o.status ?? 'available',
} });
async function book(courseId: string, teeTimeId: string, o: { players?: number; green?: number; access?: number; rate?: string; status?: string } = {}) {
  const players = o.players ?? 2;
  const green = (o.green ?? 5000) * players, access = o.access ?? 150 * players;
  await prisma.teeTime.update({ where: { id: teeTimeId }, data: { playersBooked: { increment: players } } });
  return prisma.booking.create({ data: {
    teeTimeId, courseId, golferName: 'Move Golfer', golferEmail: `${TAG}@test.local`, players,
    greenFeeTotal: green, cartFeeTotal: 0, accessFeeTotal: access, totalAmount: green + access,
    status: o.status ?? 'confirmed', paymentStatus: 'card_on_file', appliedRate: o.rate ?? 'standard',
  } });
}
const tt = (id: string) => prisma.teeTime.findUnique({ where: { id } });
const bk = (id: string) => prisma.booking.findUnique({ where: { id } });

async function main() {
  await cleanup();
  const c = await course();

  // 1. Staff move, price kept.
  const a = await slot(c.id, '2026-10-20', '08:00');          // Tue
  const b = await slot(c.id, '2026-10-20', '09:00', { green: 7000 });
  const g = await book(c.id, a.id);
  const r1 = await moveBooking({ bookingId: g.id, newTeeTimeId: b.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW });
  check('a move succeeds', r1.ok);
  check('the booking is on the new time', (await bk(g.id))?.teeTimeId === b.id);
  check('the old slot is released', (await tt(a.id))?.playersBooked === 0);
  check('the new slot is claimed', (await tt(b.id))?.playersBooked === 2);
  check('the booked price is kept', (await bk(g.id))?.greenFeeTotal === 10000);
  check('the dry-run figures offer the new rate', r1.ok && r1.newSlotTotals.greenFeeTotal === 14000);
  const ev = await prisma.bookingEvent.findFirst({ where: { bookingId: g.id, type: 'booking_moved' } });
  check('the move is logged on the booking', !!ev && (ev.metadata as { to?: string })?.to === '2026-10-20 09:00');

  // 2. At the new slot's rate (standard booking).
  const c2 = await slot(c.id, '2026-10-21', '08:00', { green: 6000 });
  const r2 = await moveBooking({ bookingId: g.id, newTeeTimeId: c2.id, courseId: c.id, pricing: 'new_slot', actor: STAFF, now: NOW });
  const g2 = await bk(g.id);
  check('new_slot reprices a standard booking', r2.ok && g2?.greenFeeTotal === 12000);
  check('the booking fee keeps its amount', g2?.accessFeeTotal === 300);
  check('the total adds up', g2?.totalAmount === 12000 + 300);

  // 3. A member keeps their tier rate at the new time.
  await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Gold', discountPct: 20 } });
  const m1 = await slot(c.id, '2026-10-22', '08:00');           // Thu, $50
  const m2 = await slot(c.id, '2026-10-24', '08:00', { green: 8000 }); // Sat, $80
  const member = await book(c.id, m1.id, { green: 4000, rate: 'Gold' });
  await moveBooking({ bookingId: member.id, newTeeTimeId: m2.id, courseId: c.id, pricing: 'new_slot', actor: { type: 'golfer' }, now: NOW });
  check('a member is repriced at their tier rate, not the public one', (await bk(member.id))?.greenFeeTotal === 6400 * 2, String((await bk(member.id))?.greenFeeTotal));

  // 4. A counter booking (no booking fee) never gains one.
  const k1 = await slot(c.id, '2026-10-22', '10:00');
  const k2 = await slot(c.id, '2026-10-22', '11:00');
  const counter = await book(c.id, k1.id, { access: 0 });
  await moveBooking({ bookingId: counter.id, newTeeTimeId: k2.id, courseId: c.id, pricing: 'new_slot', actor: STAFF, now: NOW });
  check('a counter booking still has no booking fee', (await bk(counter.id))?.accessFeeTotal === 0);

  // 5. A blocked old slot stays blocked.
  const bl = await slot(c.id, '2026-10-23', '08:00', { status: 'blocked' });
  const bl2 = await slot(c.id, '2026-10-23', '09:00');
  const onBlocked = await book(c.id, bl.id);
  await moveBooking({ bookingId: onBlocked.id, newTeeTimeId: bl2.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW });
  check('moving off a blocked slot leaves it blocked', (await tt(bl.id))?.status === 'blocked');

  // 6. Refusals.
  const full = await slot(c.id, '2026-10-25', '08:00', { booked: 3 });
  const blocked = await slot(c.id, '2026-10-25', '09:00', { status: 'blocked' });
  const past = await slot(c.id, '2026-10-01', '08:00');
  const x = await slot(c.id, '2026-10-26', '08:00');
  const mover = await book(c.id, x.id);
  const fail = async (opts: Partial<Parameters<typeof moveBooking>[0]>) => {
    const r = await moveBooking({ bookingId: mover.id, newTeeTimeId: full.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW, ...opts });
    return r.ok ? 'ok' : r.code;
  };
  check('no room for the whole group → FULL', (await fail({ newTeeTimeId: full.id })) === 'FULL');
  check('a blocked time → BLOCKED', (await fail({ newTeeTimeId: blocked.id })) === 'BLOCKED');
  check('a time that has gone off → PAST', (await fail({ newTeeTimeId: past.id })) === 'PAST');
  check('its own time → SAME', (await fail({ newTeeTimeId: x.id })) === 'SAME');
  check('a stale view of where it was → MOVED', (await fail({ newTeeTimeId: bl2.id, expectFromTeeTimeId: a.id })) === 'MOVED');
  const other = await course();
  const theirs = await slot(other.id, '2026-10-26', '09:00');
  check('another course’s time → WRONG_COURSE', (await fail({ newTeeTimeId: theirs.id })) === 'WRONG_COURSE');
  check('another course’s booking → NOT_FOUND', (await fail({ newTeeTimeId: bl2.id, courseId: other.id })) === 'NOT_FOUND');
  const done = await book(c.id, (await slot(c.id, '2026-10-26', '10:00')).id, { status: 'completed' });
  check('a checked-in group → NOT_CONFIRMED', (await moveBooking({ bookingId: done.id, newTeeTimeId: bl2.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW })).ok === false);
  check('nothing moved on a refusal', (await bk(mover.id))?.teeTimeId === x.id && (await tt(full.id))?.playersBooked === 3);

  // 7. Dry run changes nothing; cutoff flag.
  const soon = await slot(c.id, '2026-10-09', '08:00'); // 20h after NOW, inside the 24h window
  const dry = await moveBooking({ bookingId: mover.id, newTeeTimeId: soon.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW, dryRun: true });
  check('a dry run reports the move', dry.ok && dry.to.teeTimeId === soon.id);
  check('a dry run moves nothing', (await bk(mover.id))?.teeTimeId === x.id && (await tt(soon.id))?.playersBooked === 0);
  check('a time inside the free-cancellation window is flagged', dry.ok && dry.cutoffPassed === true);
  check('a time outside it is not', r1.ok && r1.cutoffPassed === false);
  check('no hold is due when the booking carries no fee', dry.ok && dry.holdDueCents === 0);
  await prisma.booking.update({ where: { id: mover.id }, data: { cancellationFeeTotal: 2500 } });
  const dryHold = await moveBooking({ bookingId: mover.id, newTeeTimeId: soon.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW, dryRun: true });
  check('moving inside the window reports the hold the cron will take', dryHold.ok && dryHold.holdDueCents === 2500);
  await prisma.booking.update({ where: { id: mover.id }, data: { cancellationFeeChargeId: 'pi_already' } });
  const dryTaken = await moveBooking({ bookingId: mover.id, newTeeTimeId: soon.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW, dryRun: true });
  check('a hold already taken is not reported again', dryTaken.ok && dryTaken.holdDueCents === 0);
  await prisma.booking.update({ where: { id: mover.id }, data: { lateFeeTimingAtBooking: 'late_cancel', cancellationFeeChargeId: '' } });
  const dryLate = await moveBooking({ bookingId: mover.id, newTeeTimeId: soon.id, courseId: c.id, pricing: 'keep', actor: STAFF, now: NOW, dryRun: true });
  check('a late-cancel policy takes nothing at the cutoff', dryLate.ok && dryLate.holdDueCents === 0);

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

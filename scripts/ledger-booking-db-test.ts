// REVIEW_LEDGER follow-ups (2026-10-26): R-BOOK-002 two cancels of one booking
// at once free its seats once, and R-AUTH-010 / R-OPS-010 the settings and
// course PATCH never return the raw Course row; a cancel that loses the race
// gives back a late fee it charged. Real database, Stripe stubbed.
// Run: npx tsx scripts/ledger-booking-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { performCancellation } from '../src/lib/cancel-booking';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { stripe } from '../src/lib/stripe';
import { sendCheckInLinkOnce } from '../src/lib/check-in-email';
import { createSchedule, updateSchedule } from '../src/lib/schedule-service';

// Stripe stub: `duringCharge` runs while a charge is in flight.
let n = 0;
let duringCharge: (() => Promise<void>) | null = null;
const refunds: string[] = [];
const st = stripe as unknown as Record<string, Record<string, unknown>>;
st.paymentMethods.create = async () => ({ id: `pm_clone_${++n}` });
st.paymentIntents.create = async (p: { amount: number }) => {
  const pi = { id: `pi_lb_${++n}`, amount: p.amount, status: 'succeeded' };
  if (duringCharge) { const f = duringCharge; duringCharge = null; await f(); }
  return pi;
};
st.refunds.create = async (p: { payment_intent: string }) => { refunds.push(p.payment_intent); return { id: `re_${++n}`, amount: 1000 }; };

const TAG = 'ledgerbook';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
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

  // A golfer's late cancel (fee charged now) loses to a waived weather cancel that
  // commits while the golfer's charge is in flight: the fee goes back, on the record.
  const fc = await prisma.course.create({ data: { name: 'Ledger Fee GC', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_lb', stripeAccountActive: true } });
  const soon = new Date(Date.now() + 2 * 3600_000);
  const ft = await prisma.teeTime.create({ data: { courseId: fc.id, date: soon.toISOString().slice(0, 10), time: soon.toISOString().slice(11, 16), holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  const late = await prisma.booking.create({ data: { teeTimeId: ft.id, courseId: fc.id, golferName: 'Late', golferEmail: `${TAG}+late@t.local`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'confirmed', paymentStatus: 'card_on_file',
    stripeCustomerId: 'cus_x', stripePaymentMethodId: 'pm_x', cancellationFeeTotal: 1000, cancellationHoursAtBooking: 24, lateFeeTimingAtBooking: 'late_cancel' } });
  duringCharge = async () => { await performCancellation(late.id, { type: 'system' }, { notifySlotAlerts: false, waiveFee: true, courseCalledOff: 'weather' }); };
  const before = refunds.length;
  const lost = await performCancellation(late.id, { type: 'golfer', id: null }, { notifySlotAlerts: false });
  const lb = await prisma.booking.findUniqueOrThrow({ where: { id: late.id } });
  const ledger = await prisma.paymentEvent.findMany({ where: { bookingId: late.id, kind: 'refund' } });
  ok('a late cancel beaten by a waived cancel mid-charge: refused', 'error' in lost && lost.status === 409, lost);
  ok('…its late fee is refunded, and the refund is on the ledger', refunds.length === before + 1 && ledger.length === 1, { refunds: refunds.length - before, ledger: ledger.length });
  ok('…and the booking says no fee kept', lb.status === 'cancelled' && !lb.cancellationFeeChargeId && lb.cancellationFeeTotal === 0, lb);

  // R-CRON-007: the check-in email's dedup is claimed, and a failed send is put back.
  // (No RESEND_API_KEY here, so every send fails — the path that matters.)
  const noCard = await prisma.booking.create({ data: { teeTimeId: ft.id, courseId: fc.id, golferName: 'Pay Link', golferEmail: `${TAG}+link@t.local`, players: 1,
    greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'confirmed', paymentStatus: 'no_payment_method', checkInToken: 'tok' } });
  const withRels = await prisma.booking.findUniqueOrThrow({ where: { id: noCard.id }, include: { teeTime: true, course: true } });
  const sent = await sendCheckInLinkOnce(withRels);
  const afterFail = await prisma.booking.findUniqueOrThrow({ where: { id: noCard.id } });
  ok('a check-in email that fails to send leaves the booking to be tried again', sent === 'failed' && afterFail.paymentStatus === 'no_payment_method', { sent, ps: afterFail.paymentStatus });
  await prisma.booking.update({ where: { id: noCard.id }, data: { paymentStatus: 'awaiting_checkin' } });
  const second = await sendCheckInLinkOnce(withRels); // the stale read still says no_payment_method
  ok('…and a booking another run already claimed is not sent twice', second === 'taken');
  const crons = ['src/app/api/cron/hourly/route.ts', 'src/app/api/cron/cancellation-cutoff/route.ts'].map(f => readFileSync(f, 'utf8'));
  ok('…both crons send it only through sendCheckInLinkOnce', crons.every(c => c.includes('sendCheckInLinkOnce(booking)') && !c.includes("data: { paymentStatus: 'awaiting_checkin' }")));
  // R-BOOK-011: an interval below 1 (or not a whole number) is refused, never saved.
  const sch = await createSchedule(fc.id, { daysOfWeek: [1], startTime: '07:00', endTime: '08:00', intervalMinutes: 10, greenFeeWeekday: 50 });
  const refusals: string[] = [];
  for (const bad of [-5, 0, 2.5]) {
    try { await updateSchedule(sch.id, { intervalMinutes: bad }); refusals.push(`saved ${bad}`); }
    catch (e) { refusals.push(/minutes apart/.test((e as Error).message) ? 'refused' : (e as Error).message); }
  }
  const schAfter = await prisma.teeTimeSchedule.findUniqueOrThrow({ where: { id: sch.id } });
  ok('R-BOOK-011: a schedule update with −5, 0 or 2.5 minutes is refused, and the interval stays', refusals.every(r => r === 'refused') && schAfter.intervalMinutes === 10, { refusals, iv: schAfter.intervalMinutes });
  let created = 'saved';
  try { await createSchedule(fc.id, { daysOfWeek: [2], startTime: '07:00', endTime: '08:00', intervalMinutes: -5 }); } catch (e) { created = /minutes apart/.test((e as Error).message) ? 'refused' : (e as Error).message; }
  ok('…and so is a new schedule with −5 minutes', created === 'refused', created);
  await updateSchedule(sch.id, { intervalMinutes: 9 });
  ok('…while a real interval still saves', (await prisma.teeTimeSchedule.findUniqueOrThrow({ where: { id: sch.id } })).intervalMinutes === 9);

  for (const f of ['src/app/api/operator/settings/route.ts', 'src/app/api/operator/courses/route.ts']) {
    const src = readFileSync(f, 'utf8');
    ok(`${f.split('/')[4]} PATCH returns the stripped course, never the raw row`, src.includes('return NextResponse.json(operatorSafe(courseToWire(updated)));') && !src.includes('return NextResponse.json(updated);'));
  }

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('ledger-booking-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

// REVIEW_LEDGER money batch (2026-10-26): G9 change-players after a no-show,
// G14 "still coming" only on a flagged booking, no no-show on a paid round,
// the cutoff hold charged only on a booking still confirmed with a card, and
// G3 as Cam decided it (a no-show past its midnight is closed). Real
// database, Stripe stubbed. Independent of the time of day.
// Run: npx tsx scripts/ledger-money-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { chargeCutoffHold } from '../src/lib/cutoff-hold';
import { dueNoShowCharges, dueAutoNoShows, noShowClosed } from '../src/lib/no-show-fee';
import { performCheckIn } from '../src/lib/checkin-booking';
import { settleAtCounter } from '../src/lib/counter-pay';
import { performCancellation } from '../src/lib/cancel-booking';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'ledgermoney';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

// Stripe stub: every charge succeeds; `duringCharge` runs between the charge and its recording.
let n = 0;
let duringCharge: (() => Promise<void>) | null = null;
let declineAll = false;
const charges: { key?: string; amount: number }[] = [];
const refunds: string[] = [];
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.paymentMethods.create = async () => ({ id: `pm_clone_${++n}` });
// Like Stripe: a key still in flight answers "in progress"; a finished key replays its PaymentIntent.
const byKey = new Map<string, { id: string; amount: number; status: string }>();
const inFlight = new Set<string>();
s.paymentIntents.create = async (p: { amount: number }, o: { idempotencyKey?: string }) => {
  const key = o.idempotencyKey ?? `nokey-${n}`;
  if (inFlight.has(key)) throw new Error('There is currently another in-progress request using this idempotency key.');
  if (declineAll) throw Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' });
  const seen = byKey.get(key); if (seen) return seen;
  inFlight.add(key);
  const pi = { id: `pi_${TAG}_${++n}`, amount: p.amount, status: 'succeeded' };
  charges.push({ key: o.idempotencyKey, amount: p.amount });
  if (duringCharge) { const f = duringCharge; duringCharge = null; await f(); }
  inFlight.delete(key); byKey.set(key, pi);
  return pi;
};
s.refunds.create = async (p: { payment_intent: string; amount?: number }) => { refunds.push(p.payment_intent); return { id: `re_${++n}`, amount: p.amount ?? 1000 }; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  const bids = (await prisma.booking.findMany({ where: { courseId: { in: ids } }, select: { id: true } })).map(b => b.id);
  await prisma.paymentEvent.deleteMany({ where: { bookingId: { in: bids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Ledger GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', cancellationHours: 24, stripeAccountId: 'acct_ledger', stripeAccountActive: true } });
  const today = todayIn('UTC');
  const yesterday = addDaysStr(today, -1);
  const slot = (date: string, time: string) => prisma.teeTime.create({ data: { courseId: c.id, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4 } });
  const booking = (teeTimeId: string, extra: Record<string, unknown> = {}) => prisma.booking.create({ data: {
    teeTimeId, courseId: c.id, golferName: 'Four', golferEmail: `${TAG}+g@t.local`, players: 4,
    greenFeeTotal: 20000, cartFeeTotal: 0, accessFeeTotal: 600, totalAmount: 20600, status: 'confirmed', paymentStatus: 'card_on_file',
    stripeCustomerId: 'cus_x', stripePaymentMethodId: 'pm_x', cancellationFeeTotal: 2000, ...extra } });

  // ── The cutoff hold ──────────────────────────────────────────────────
  // Tee time an hour from now, 24h window: the cutoff has passed.
  const soon = new Date(Date.now() + 3600_000);
  const t1 = await slot(soon.toISOString().slice(0, 10), hhmm(soon));
  const plain = await booking(t1.id);
  ok('a hold due now is charged and recorded', (await chargeCutoffHold(plain.id)) === 'charged');
  const p1 = await prisma.booking.findUniqueOrThrow({ where: { id: plain.id } });
  ok('…as cancellation_fee_charged with its PaymentIntent', p1.paymentStatus === 'cancellation_fee_charged' && !!p1.cancellationFeeChargeId, p1);
  ok('…and never twice', (await chargeCutoffHold(plain.id)) === 'changed');

  const waived = await booking(t1.id);
  duringCharge = async () => { await prisma.booking.update({ where: { id: waived.id }, data: { status: 'cancelled', cancellationFeeTotal: 0 } }); };
  const before = refunds.length;
  ok('a booking cancelled (fee waived) while its hold was being charged: the charge is refunded', (await chargeCutoffHold(waived.id)) === 'refunded' && refunds.length === before + 1);
  const w1 = await prisma.booking.findUniqueOrThrow({ where: { id: waived.id } });
  ok('…and the booking is left cancelled, never marked charged', w1.status === 'cancelled' && w1.paymentStatus === 'card_on_file' && !w1.cancellationFeeChargeId, w1);

  const late = await booking(t1.id);
  duringCharge = async () => {
    const pi = `pi_${TAG}_${n}`; // the late cancel shares the cron's idempotency key, so it gets the same PaymentIntent
    await prisma.booking.update({ where: { id: late.id }, data: { status: 'cancelled', paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: pi } });
  };
  const before2 = refunds.length;
  ok('a late cancel that recorded the same charge meanwhile: kept, not refunded', (await chargeCutoffHold(late.id)) === 'recorded_elsewhere' && refunds.length === before2);

  const checkedIn = await booking(t1.id);
  duringCharge = async () => { await prisma.booking.update({ where: { id: checkedIn.id }, data: { status: 'completed', paymentStatus: 'paid', checkedInAt: new Date() } }); };
  ok('a group checked in and paid while its hold was being charged: refunded', (await chargeCutoffHold(checkedIn.id)) === 'refunded');

  // A golfer cancelling late WHILE the cron's charge is in flight: the cancel's own
  // charge (same key) hears "in progress", waits, replays the cron's PaymentIntent.
  const racing = await booking(t1.id);
  let cancelRun: Promise<unknown> | null = null;
  duringCharge = async () => { cancelRun = performCancellation(racing.id, { type: 'golfer' }); await new Promise(r => setTimeout(r, 300)); };
  const before3 = refunds.length;
  const rr = await chargeCutoffHold(racing.id);
  const cr = await cancelRun;
  const r1 = await prisma.booking.findUniqueOrThrow({ where: { id: racing.id } });
  ok('a late cancel racing the cron’s in-flight charge: one charge, kept, never refunded', refunds.length === before3 && (rr === 'charged' || rr === 'recorded_elsewhere') && r1.status === 'cancelled' && r1.paymentStatus === 'cancellation_fee_charged' && !!r1.cancellationFeeChargeId && r1.cancellationFeeTotal === 2000, { rr, cr, r1: { status: r1.status, ps: r1.paymentStatus, id: r1.cancellationFeeChargeId, fee: r1.cancellationFeeTotal } });

  // R-PAY-010: a declined hold is ledgered, once.
  const declined = await booking(t1.id, { stripePaymentMethodId: 'pm_declines' });
  declineAll = true;
  const d1 = await chargeCutoffHold(declined.id);
  const d2 = await chargeCutoffHold(declined.id);
  declineAll = false;
  const dRows = await prisma.paymentEvent.count({ where: { bookingId: declined.id, kind: 'charge_failed' } });
  const dB = await prisma.booking.findUniqueOrThrow({ where: { id: declined.id } });
  ok('a declined hold is reported as declined and ledgered once, however many runs try it', d1 === 'declined' && d2 === 'declined' && dRows === 1, { d1, d2, dRows });
  ok('…and the booking is left as it was (no check-in prompt a day early)', dB.status === 'confirmed' && dB.paymentStatus === 'card_on_file' && dB.checkInFailReason === '');
  const busy = await booking(t1.id, { stripePaymentMethodId: 'pm_busy' });
  inFlight.add(`cancelfee-${busy.id}-pm_busy`);
  const b1 = await chargeCutoffHold(busy.id);
  inFlight.delete(`cancelfee-${busy.id}-pm_busy`);
  ok('the other cron charging the same hold at that moment is not a decline: nothing ledgered', b1 === 'not_due' && (await prisma.paymentEvent.count({ where: { bookingId: busy.id } })) === 0, b1);

  const gone = await booking(t1.id, { status: 'cancelled' });
  const nCharges = charges.length;
  ok('a booking already cancelled before the charge: nothing charged', (await chargeCutoffHold(gone.id)) === 'changed' && charges.length === nCharges);

  const t2 = await slot(addDaysStr(today, -3), '08:00');
  const stale = await booking(t2.id);
  ok('a cutoff missed by days (tee time long past): not charged as a hold', (await chargeCutoffHold(stale.id)) === 'not_due' && charges.length === nCharges);

  const later = new Date(Date.now() + 72 * 3600_000);
  const t3 = await slot(later.toISOString().slice(0, 10), hhmm(later));
  const open = await booking(t3.id);
  ok('a booking still inside its free window: not charged', (await chargeCutoffHold(open.id)) === 'not_due' && charges.length === nCharges);

  // ── Never a no-show on a paid round ───────────────────────────────────
  const ty = await slot(yesterday, '08:00');
  const flaggedUnpaid = await booking(ty.id, { noShowAt: new Date(Date.now() - 3600_000), noShowFeeTotal: 1000, paymentStatus: 'card_on_file' });
  const flaggedPaid = await booking(ty.id, { noShowAt: new Date(Date.now() - 3600_000), noShowFeeTotal: 1000, paymentStatus: 'paid', roundPaymentIntentId: 'pi_round' });
  const due = await dueNoShowCharges(new Date());
  ok('the midnight no-show charge takes an unpaid flagged group', due.includes(flaggedUnpaid.id));
  ok('…and skips a round already paid', !due.includes(flaggedPaid.id));
  const autoUnpaid = await booking(ty.id, { autoNoShowMinutesAtBooking: 0 });
  const autoPaid = await booking(ty.id, { autoNoShowMinutesAtBooking: 0, paymentStatus: 'paid', roundPaymentIntentId: 'pi_round2' });
  const auto = await dueAutoNoShows(new Date());
  ok('automatic no-show marks an unpaid group', auto.includes(autoUnpaid.id));
  ok('…and never a round already paid', !auto.includes(autoPaid.id));

  // ── Late arrival: a no-show past its midnight is closed ───────────────────
  ok('a no-show flagged today is still open (still coming / check in work)', !noShowClosed({ noShowAt: new Date(), teeTime: { date: today }, course: { timezone: 'UTC' } }));
  ok('…one whose day has ended is closed', noShowClosed({ noShowAt: new Date(), teeTime: { date: yesterday }, course: { timezone: 'UTC' } }));
  ok('…and an unflagged booking never is', !noShowClosed({ noShowAt: null, teeTime: { date: yesterday }, course: { timezone: 'UTC' } }));
  const closedCard = await booking(ty.id, { noShowAt: new Date(Date.now() - 3600_000) });
  const nc = charges.length;
  const ci = await performCheckIn(closedCard.id, STAFF);
  ok('checking in a no-show the day after is refused, nothing charged', 'error' in ci && ci.status === 409 && /no-show/.test(ci.error) && charges.length === nc, ci);
  const closedCash = await booking(ty.id, { noShowAt: new Date(Date.now() - 3600_000), paymentStatus: 'manual' });
  const cash = await settleAtCounter(c.id, closedCash.id, { actor: STAFF, actorName: 't' });
  ok('…and so is taking cash for it', !cash.ok && cash.status === 409, cash);
  const cc = await prisma.booking.findUniqueOrThrow({ where: { id: closedCash.id } });
  ok('…the booking stays a confirmed no-show', cc.status === 'confirmed' && !!cc.noShowAt);

  // ── Route guards (the routes read cookies, so their checks are read from source) ──
  const players = readFileSync('src/lib/change-party.ts', 'utf8');
  ok('G9: change-players refuses a no-show or a started tee time', /booking\.noShowAt \|\| \(who\.by === 'golfer' && isPastIn\(/.test(players) && players.includes("code: 'STARTED'"));
  ok('R-BOOK-004: change-players never reopens a blocked time, nor sells into it', players.includes("slot.status !== 'blocked' ?") && players.includes("slot.status === 'blocked' && newPlayers > booking.players"));
  const sheet = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  const sc = sheet.slice(sheet.indexOf("if (action === 'still_coming')"));
  ok('G14: still coming refuses anything but a confirmed, flagged booking — before any refund', /booking\.status !== 'confirmed' \|\| !booking\.noShowAt/.test(sc) && sc.indexOf('!booking.noShowAt') < sc.indexOf('refundSeparateAccessFee'));
  const ns = sheet.slice(sheet.indexOf("if (action === 'no_show')"));
  ok('staff can’t mark a paid round a no-show', ns.indexOf('roundPaid(booking)') > 0 && ns.indexOf('roundPaid(booking)') < ns.indexOf('markNoShow('));
  const reader = readFileSync('src/lib/reader-rounds.ts', 'utf8');
  ok('the card reader refuses a closed no-show before it starts', /noShowClosed\(b\)\) return fail\(409/.test(reader));
  for (const f of ['src/app/api/cron/hourly/route.ts', 'src/app/api/cron/cancellation-cutoff/route.ts']) {
    const src = readFileSync(f, 'utf8');
    ok(`${f.split('/')[4]}: the hold goes through chargeCutoffHold, no charge of its own`, src.includes('chargeCutoffHold(booking.id, now)') && !src.includes('chargeOnConnectedAccount'));
  }

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('ledger-money-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

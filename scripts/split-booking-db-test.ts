// SPLIT-1 (Cam 2026-11-02: "if John Smith walks in with three people and they all want to pay
// separately … that has to be seamless"): paying separately splits players off into their own
// booking at the group's own per-player price.
//  1. the money never changes by splitting: the two totals (and each part) add up to the one before,
//     for a plain group, a member's group, residents, cart, range balls and a promo discount;
//  2. who stays keeps the member's rate, the residents that fit, the range balls; who leaves pays the
//     group's other-player price, at the counter (manual, no card), with no fees;
//  3. refused: paid, on the reader, a charge started, a no-show, a pack, an event time, everyone;
//  4. a split racing a payment changes nothing (the guard on what the group was);
//  5. split + cash in one request is a register cash sale of the new group only; the rest still owe.
// Needs a database. Run: npx tsx scripts/split-booking-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { splitShares, splitRefusal } from '../src/lib/split-booking';
import { splitBooking, splitOffLateArrivals, holdRefundCents, hasShareToRefund } from '../src/lib/split-booking-db';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'splittest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const actor = { type: 'staff' as const, id: 'test' };
const pub = { greenFeeCents: 4500, cartFeeCents: 2000 };
const base = { residentPlayers: 0, residentRateCents: null, memberRateCents: null, memberCartCents: null, rangeBallsTotal: 0 };
const sum = (a: { totalAmount: number }, b: { totalAmount: number }) => a.totalAmount + b.totalAmount;

// 1–2. pure shares
const plain = { ...base, players: 4, greenFeeTotal: 18000, cartFeeTotal: 8000, accessFeeTotal: 600, totalAmount: 26600 };
const p1 = splitShares(plain, 1, pub)!;
ok('plain group of 4, one pays alone: $45 + $20 cart + $1.50 fee', p1.leave.totalAmount === 6650 && p1.keep.totalAmount === 19950 && sum(p1.keep, p1.leave) === plain.totalAmount, p1);
const p3 = splitShares(plain, 3, pub)!;
ok('three leave: the parts still add up', sum(p3.keep, p3.leave) === plain.totalAmount && p3.keep.players === 1 && p3.leave.players === 3);
const odd = { ...base, players: 3, greenFeeTotal: 13501, cartFeeTotal: 0, accessFeeTotal: 451, totalAmount: 13952 };
const o1 = splitShares(odd, 1, pub)!;
ok('odd cents never lose or gain a cent', sum(o1.keep, o1.leave) === odd.totalAmount && o1.keep.greenFeeTotal + o1.leave.greenFeeTotal === odd.greenFeeTotal && o1.keep.accessFeeTotal + o1.leave.accessFeeTotal === odd.accessFeeTotal, o1);
const mem = { ...base, players: 4, greenFeeTotal: 2000 + 3 * 4500, cartFeeTotal: 0, accessFeeTotal: 600, totalAmount: 2000 + 13500 + 600, memberRateCents: 2000 };
const m1 = splitShares(mem, 1, pub)!;
ok('a member\'s group: the member stays at $20, the guest who leaves pays the guest $45', m1.leave.greenFeeTotal === 4500 && m1.keep.greenFeeTotal === 2000 + 2 * 4500, m1);
const res = { ...base, players: 4, greenFeeTotal: 2 * 3200 + 2 * 4500, cartFeeTotal: 0, accessFeeTotal: 600, totalAmount: 6400 + 9000 + 600, residentPlayers: 2, residentRateCents: 3200 };
const r3 = splitShares(res, 3, pub)!;
ok('residents: the one who stays keeps a resident rate; the other resident leaves with theirs', r3.keep.residentPlayers === 1 && r3.leave.residentPlayers === 1 && r3.leave.residentRateCents === 3200 && sum(r3.keep, r3.leave) === res.totalAmount, r3);
const promo = { ...plain, totalAmount: plain.totalAmount - 2000 };
const pr = splitShares(promo, 2, pub)!;
ok('a promo discount divides by players', pr.leave.totalAmount === 13300 - 1000 && sum(pr.keep, pr.leave) === promo.totalAmount, pr);
const range = { ...plain, rangeBallsTotal: 1200, totalAmount: plain.totalAmount + 1200 };
const rg = splitShares(range, 1, pub)!;
ok('range balls stay with the booker', rg.keep.rangeBallsTotal === 1200 && rg.leave.rangeBallsTotal === 0 && rg.leave.totalAmount === 6650 && sum(rg.keep, rg.leave) === range.totalAmount);
ok('can\'t split off everyone, or nobody', splitShares(plain, 4, pub) === null && splitShares(plain, 0, pub) === null && splitShares({ ...plain, players: 1 }, 1, pub) === null);

// 3. refusals (pure)
const okB = { status: 'confirmed', paymentStatus: 'card_on_file', players: 4, noShowAt: null, roundPaymentIntentId: '', shopLockedAt: null, readerStartedAt: null, feePaidCents: 0, appliedRate: 'standard' };
ok('an open group can split', splitRefusal(okB) === null);
for (const [label, b] of [['paid', { paymentStatus: 'paid' }], ['paid in cash', { paymentStatus: 'paid_offline' }], ['on the reader', { readerStartedAt: new Date() }], ['a charge started', { roundPaymentIntentId: 'pi_x' }], ['a no-show', { noShowAt: new Date() }], ['a pack', { appliedRate: 'pack' }], ['checked in', { status: 'completed' }]] as const) {
  ok(`refused: ${label}`, typeof splitRefusal({ ...okB, ...b }) === 'string');
}

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId: { in: ids } } } }).catch(() => {});
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Split Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: `${TAG} Course`, slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  const date = addDaysStr(todayIn('UTC'), 1);
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '09:00', holes: 18, greenFeeCents: 4500, cartFeeCents: 2000, playersAvailable: 4, playersBooked: 4, status: 'available' } });
  const mk = (o: Record<string, unknown> = {}) => prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'John Smith', golferEmail: `${TAG}+john@test.local`, players: 4, greenFeeTotal: 18000, cartFeeTotal: 8000, cartSelected: true, accessFeeTotal: 600, totalAmount: 26600, status: 'confirmed', paymentStatus: 'card_on_file', stripePaymentMethodId: 'pm_test', ...o } as never });

  // 2. a real split
  const john = await mk();
  const r = await splitBooking(course.id, john.id, 1, { name: 'Mike', actor });
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: john.id } });
  const mike = r.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: r.newBookingId } }) : null;
  ok('split: John keeps 3 at $199.50, card on file kept', r.ok && after.players === 3 && after.totalAmount === 19950 && after.stripePaymentMethodId === 'pm_test' && after.paymentStatus === 'card_on_file', after);
  ok('…Mike is his own group of 1 at $66.50, paying at the counter, no card, no fees', !!mike && mike.players === 1 && mike.totalAmount === 6650 && mike.paymentStatus === 'manual' && mike.golferName === 'Mike' && mike.stripePaymentMethodId === '' && mike.cancellationFeeTotal === 0 && mike.noShowFeeTotal === 0 && mike.teeTimeId === tt.id);
  ok('…the tee time\'s seats are unchanged', (await prisma.teeTime.findUniqueOrThrow({ where: { id: tt.id } })).playersBooked === 4);
  ok('…both bookings carry an event saying what happened', (await prisma.bookingEvent.count({ where: { courseId: course.id, bookingId: { in: [john.id, r.ok ? r.newBookingId : ''] } } })) === 2);
  ok('another course can\'t split it', !(await splitBooking('other-course', john.id, 1, { actor })).ok);

  // Final review 2026-11-02: a hold already taken at the cutoff. The booker's row carries the smaller fee and the
  // leavers' share goes back (here Stripe isn't configured, so the refund fails and staff are told the exact amount).
  const held = await mk({ paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_hold', cancellationFeeTotal: 4000 });
  await prisma.course.update({ where: { id: course.id }, data: { lateFeeBasis: 'player', stripeAccountId: 'acct_test' } });
  const rh = await splitBooking(course.id, held.id, 1, { actor });
  const heldAfter = await prisma.booking.findUniqueOrThrow({ where: { id: held.id } });
  ok('a group whose hold is taken can still split (that\'s every card group on the day at a hold course)', rh.ok && heldAfter.players === 3 && heldAfter.paymentStatus === 'cancellation_fee_charged' && heldAfter.cancellationFeeChargeId === 'pi_hold');
  ok('…its fee record drops to the 3 who stay ($30)', heldAfter.cancellationFeeTotal === 3000, heldAfter.cancellationFeeTotal);
  ok('…and the one who left gets their $10 share of the hold back — or staff are told exactly what to refund', rh.ok && rh.note === 'Split done, but $10.00 of the late-cancellation hold couldn’t be refunded automatically — refund it in Stripe.', rh.ok ? rh.note : rh);
  ok('a group with no hold has nothing to give back', r.ok && r.note === null);
  const db = readFileSync('src/lib/split-booking-db.ts', 'utf8');
  ok('the hold share is refunded on the course\'s account and written to the ledger', db.includes('refundOnConnectedAccount({ paymentIntentId: h.chargeId, connectedAccountId: h.account, amountCents: h.cents })') && db.includes("recordMove({ courseId: h.courseId, what: 'hold', direction: 'out'"));
  await prisma.course.update({ where: { id: course.id }, data: { lateFeeBasis: 'booking', stripeAccountId: '' } });

  // PARTIAL-1 (Cam 2026-11-04: "if only one person's checked in the other should still be open"): the ones still on
  // their way split off with the group's card, contact and rules, linked to it — and a hold is shared, not refunded.
  await prisma.course.update({ where: { id: course.id }, data: { lateFeeBasis: 'player', noShowFeeBasis: 'player', noShowFeeCents: 1500, stripeAccountId: 'acct_test' } });
  const late = await mk({ golferPhone: '5551234567', stripeCustomerId: 'cus_1', paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_hold2', cancellationFeeTotal: 4000, noShowFeeTotal: 6000, autoNoShowMinutesAtBooking: 30, lateFeeTimingAtBooking: 'hold_at_cutoff', source: 'online' });
  const ra = await splitOffLateArrivals(course.id, late.id, 1, actor);
  const lateAfter = await prisma.booking.findUniqueOrThrow({ where: { id: late.id } });
  const coming = ra.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: ra.newBookingId } }) : null;
  ok('late arrivals: the 3 here keep 3 players, their share of the fees', ra.ok && lateAfter.players === 3 && lateAfter.cancellationFeeTotal === 3000 && lateAfter.noShowFeeTotal === 4500, lateAfter);
  ok('…the one on the way keeps the card, contact and rules, linked to the group', !!coming && coming.splitFromId === late.id && coming.status === 'confirmed' && coming.players === 1
    && coming.stripePaymentMethodId === 'pm_test' && coming.stripeCustomerId === 'cus_1' && coming.golferEmail === late.golferEmail && coming.golferPhone === '5551234567'
    && coming.autoNoShowMinutesAtBooking === 30 && coming.lateFeeTimingAtBooking === 'hold_at_cutoff' && coming.source === 'online' && coming.golferName === 'John Smith · guest', coming);
  ok('…and its share of the hold: same charge, $10, nothing refunded at the split', !!coming && coming.paymentStatus === 'cancellation_fee_charged' && coming.cancellationFeeChargeId === 'pi_hold2' && coming.cancellationFeeTotal === 1000 && coming.noShowFeeTotal === 1500 && ra.ok && ra.note === null, coming);
  ok('…the fees still add up to the one booking', !!coming && coming.cancellationFeeTotal + lateAfter.cancellationFeeTotal === 4000 && coming.totalAmount + lateAfter.totalAmount === 26600);
  ok('a shared hold comes back only as each part\'s share', (await holdRefundCents(lateAfter)) === 3000 && !!coming && (await holdRefundCents(coming)) === 1000);
  const alone = await mk({ paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_alone', cancellationFeeTotal: 4000 });
  ok('…a hold one booking owns still comes back whole', (await holdRefundCents(alone)) === undefined && hasShareToRefund(undefined) && !hasShareToRefund(0));
  // A per-booking hold stays whole with the booker; the part on its way has none (and nothing for the cron to take).
  await prisma.course.update({ where: { id: course.id }, data: { lateFeeBasis: 'booking', noShowFeeBasis: 'booking' } });
  const flat = await mk({ paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_flat', cancellationFeeTotal: 2500 });
  const rf = await splitOffLateArrivals(course.id, flat.id, 2, actor);
  const flatRest = rf.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: rf.newBookingId } }) : null;
  ok('a per-booking hold stays whole with the booker; the rest carry no hold, card still on file', !!flatRest && flatRest.cancellationFeeTotal === 0 && flatRest.paymentStatus === 'card_on_file' && flatRest.cancellationFeeChargeId === '' && (await prisma.booking.findUniqueOrThrow({ where: { id: flat.id } })).cancellationFeeTotal === 2500, flatRest);
  const nocard = await mk({ paymentStatus: 'no_payment_method', stripePaymentMethodId: '' });
  const rn = await splitOffLateArrivals(course.id, nocard.id, 1, actor);
  const nocardRest = rn.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: rn.newBookingId } }) : null;
  ok('no card on the booking: the rest pay in store when they come (pay link or counter)', !!nocardRest && nocardRest.paymentStatus === 'no_payment_method' && nocardRest.stripePaymentMethodId === '', nocardRest);
  const ck = readFileSync('src/lib/checkin-booking.ts', 'utf8'); const cp = readFileSync('src/lib/counter-pay.ts', 'utf8'); const cb = readFileSync('src/lib/cancel-booking.ts', 'utf8');
  ok('card check-in and cash split the rest off before settling, and fall back when it can\'t', ck.includes('splitOffLateArrivals(booking.courseId, bookingId, booking.players - arrived, actor)') && cp.includes('splitOffLateArrivals(courseId, bookingId, booking.players - cip, opts.actor)'));
  ok('all three hold refunds give back only the booking\'s share', [ck, cp, cb].every(f => f.includes('holdRefundCents(') && f.includes('amountCents: share')));
  await prisma.course.update({ where: { id: course.id }, data: { lateFeeBasis: 'booking', noShowFeeBasis: 'booking', noShowFeeCents: 0, stripeAccountId: '' } });

  // 3–4. refused in the database too, and a racing payment wins
  const paid = await mk({ paymentStatus: 'paid', roundPaymentIntentId: 'pi_1', status: 'completed' });
  const rp = await splitBooking(course.id, paid.id, 1, { actor });
  ok('a paid group is refused and untouched', !rp.ok && (await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } })).players === 4);
  const ev = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '10:00', holes: 18, greenFeeCents: 4500, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'available' } });
  const src = readFileSync('src/lib/split-booking-db.ts', 'utf8');
  ok('an event-held time is refused', src.includes("if (b.teeTime.eventId) return { ok: false, status: 409"));
  void ev;
  ok('the change is guarded on what the group was (a payment, reader or charge started in between → nothing changes)', src.includes("where: { id: b.id, courseId, status: 'confirmed', players: b.players, paymentStatus: b.paymentStatus, roundPaymentIntentId: '', shopLockedAt: null, readerStartedAt: null, noShowAt: null, totalAmount: b.totalAmount }") && src.includes("if (!changed.count) return { ok: false, status: 409"));
  const racing = await mk();
  await prisma.booking.update({ where: { id: racing.id }, data: { readerStartedAt: new Date() } });
  ok('a group on the card reader is refused', !(await splitBooking(course.id, racing.id, 1, { actor })).ok && (await prisma.booking.findUniqueOrThrow({ where: { id: racing.id } })).players === 4);

  // 5. the route: split + cash is a register sale of the new group only
  const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  ok('the route needs sheet.counter_payment for a split', route.includes("split: 'sheet.counter_payment' };"));
  ok('split + cash rings up only the new group, and a refused cash sale leaves it owing (said so)', route.includes("ringUpCash(session.courseId, { lines: [], bookingIds: [r.newBookingId], walkIns: []") && route.includes('cashError: cash.error'));
  const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
  ok('the tee sheet previews with the same splitShares the server uses', page.includes("import { splitShares } from '@/lib/split-booking';") && src.includes("import { splitShares, splitRefusal } from './split-booking';"));
  ok('"Showed up" says the rest stay booked (or, when the group can\'t split, that they won\'t be charged)', page.includes('{b.players - herePlayers} more stay booked.</p>') && page.includes('won’t be charged.</p>') && page.includes('>Pay separately</button>'));
  ok('a part split off sits under its group, which says how many of the group checked in', page.includes('· with {parentGroup.golferName}</span>') && page.includes('{b.players} of {groupOf} checked in') && page.includes('const under = (id: string)'));
  ok('a group checked in short shows what was paid and how many played', page.includes('{b.checkedInPlayers} of {b.players} played') && page.includes('const paidShownCents = partlyPlayed'));
  ok('a group paid in cash shows what the counter took (no booking fee), not the booked total', page.includes(': b.paidOffline ? (b.totalAmount ?? 0) - (b.accessFeeTotal ?? 0) + (b.shopTotalCents ?? 0) + (b.shopTaxCents ?? 0)'));

  await cleanup();
}

main().catch(e => { console.error(e); failed++; }).finally(async () => {
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
});

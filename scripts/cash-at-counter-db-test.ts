// CASH-1 (Cam 2026-10-25: "can't just be paid at counter — it's either paid
// online and it automatically lets them know it's paid, or they ring it up in
// store and take cash if needed"). Cash for a group on the tee sheet is a
// register cash sale of its round; a counter booking is never made already
// paid; the close-out counts that cash exactly once. Real database.
// Run: npx tsx scripts/cash-at-counter-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { ringUpCash } from '../src/lib/register';
import { createCounterBooking } from '../src/lib/counter-pay';
import { LATE_ADD_MESSAGE } from '../src/lib/late-add';
import { daySummary } from '../src/lib/register-close';
import { getBookingStatus } from '../src/lib/booking-status';
import { todayIn } from '../src/lib/course-time';
const TAG = 'cash1chk';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Cash GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const today = todayIn('UTC');
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: '23:50', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });

  // A walk-in made at the counter is unpaid until it is rung up.
  const made = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'Walk In', players: 2 }, STAFF);
  const w = made.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: made.id } }) : null;
  ok('a counter booking is never made already paid', made.ok && w?.paymentStatus === 'manual' && w.status === 'confirmed' && !w.paidOffline, w);
  ok('…its status says how it can be paid', getBookingStatus('confirmed', 'manual').label === 'Pays in store');

  // Cam 2026-10-27: nobody new joins a time LATE_ADD_MINUTES (20) after it went off — except
  // a walk-in staff forgot to put on the sheet, recorded with the "already played" button (late).
  const ago = (min: number) => { const d = new Date(Date.now() - min * 60_000); return d.toISOString().slice(11, 16); };
  if (new Date().getUTCHours() >= 1) {
    const gone = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: ago(25), holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
    const soon = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: ago(10), holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
    const refused = await createCounterBooking(c.id, { teeTimeId: gone.id, golferName: 'Too Late', players: 1 }, STAFF);
    ok('a time 25 min gone takes no new booking', !refused.ok && refused.status === 409 && refused.error === LATE_ADD_MESSAGE, refused);
    const grace = await createCounterBooking(c.id, { teeTimeId: soon.id, golferName: 'Running Late', players: 1 }, STAFF);
    ok('…a time 10 min gone still does', grace.ok, grace);
    const forgot = await createCounterBooking(c.id, { teeTimeId: gone.id, golferName: 'Forgot Them', players: 1, late: true }, STAFF);
    ok('…staff can record a walk-in who already played', forgot.ok, forgot);
    const phone = await createCounterBooking(c.id, { teeTimeId: gone.id, golferName: 'Phone Late', players: 1, source: 'phone', late: true }, STAFF);
    ok('…but not a phone booking', !phone.ok && phone.status === 409, phone);
    const golfer = await createCounterBooking(c.id, { teeTimeId: gone.id, golferName: 'Not Staff', players: 1, late: true }, { type: 'golfer', id: null });
    ok('…and only staff', !golfer.ok && golfer.status === 409, golfer);
  } else console.log('SKIP  late-add checks (within an hour of UTC midnight)');

  // An online group of four where three showed, paid in cash from the tee sheet.
  await prisma.teeTime.update({ where: { id: tt.id }, data: { playersAvailable: 8 } });
  const online = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Online Four', golferEmail: `${TAG}+o@t.local`, players: 4,
    greenFeeTotal: 20000, cartFeeTotal: 0, accessFeeTotal: 600, totalAmount: 20600, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const cash = await ringUpCash(c.id, { lines: [], bookingIds: [online.id], walkIns: [], headcounts: { [online.id]: 3 }, cashTenderedCents: 16000, soldBy: 'desk@t.local', actor: STAFF });
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: online.id } });
  ok('cash for a group is a register sale of its round — for the three who showed, no booking fee', cash.ok && cash.value.sale.totalCents === 15000 && cash.value.sale.roundsCents === 15000 && cash.value.sale.cashTenderedCents === 16000, cash);
  ok('…the group is checked in and paid, three of four', after.status === 'completed' && after.paymentStatus === 'paid_offline' && after.checkedInPlayers === 3);
  ok('…and reads as paid at the register', getBookingStatus('completed', 'paid_offline').label === 'Checked In · Paid at the register');
  const again = await ringUpCash(c.id, { lines: [], bookingIds: [online.id], walkIns: [], soldBy: 't', actor: STAFF });
  ok('…and can’t be taken twice', !again.ok);
  // The walk-in, paid in cash.
  const w2 = made.ok ? await ringUpCash(c.id, { lines: [], bookingIds: [made.id], walkIns: [], soldBy: 't', actor: STAFF }) : null;
  ok('the walk-in pays $100 in cash at the register', !!w2?.ok && w2.value.sale.totalCents === 10000);

  // A cash-handed-over figure below the total never leaves a paid round without its sale.
  const short = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Short', golferEmail: `${TAG}+s@t.local`, players: 1,
    greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000, status: 'confirmed', paymentStatus: 'manual' } });
  const under = await ringUpCash(c.id, { lines: [], bookingIds: [short.id], walkIns: [], cashTenderedCents: 2000, soldBy: 't', actor: STAFF });
  ok('a tender below the total: the sale is still recorded (no change figure), and staff are told', under.ok && under.value.sale.totalCents === 5000 && under.value.sale.cashTenderedCents === null && under.value.notes.some(n => /less than the total/.test(n)), under);

  // Cam 2026-10-29: a member's group of four (member $30 + $10 cart, guests $50 + $20, $8 of range balls), two show:
  // the member and one guest, range balls whole — never the per-player average ($129).
  const mem = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Member Four', golferEmail: `${TAG}+m@t.local`, players: 4, appliedRate: 'Full',
    greenFeeTotal: 18000, cartFeeTotal: 7000, cartSelected: true, rangeBallsTotal: 800, accessFeeTotal: 600, totalAmount: 26400, memberRateCents: 3000, memberCartCents: 1000, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const memCash = await ringUpCash(c.id, { lines: [], bookingIds: [mem.id], walkIns: [], headcounts: { [mem.id]: 2 }, soldBy: 't', actor: STAFF });
  ok('part of a member group pays the member’s spot and a guest’s, range balls whole', memCash.ok && memCash.value.sale.totalCents === 3000 + 5000 + 1000 + 2000 + 800, memCash.ok ? memCash.value.sale.totalCents : memCash);

  // The close-out: register cash, counted once; nothing under "marked paid at the counter".
  const s = await daySummary(c.id);
  ok('the close-out counts this cash once, as register cash sales', s.ok && s.value.cashSales.cents === 41800 && s.value.cashSales.roundsCents === 41800 && s.value.counterRounds.count === 0 && s.value.cashTakenCents === 41800, s.ok ? s.value : s);

  // No unrecorded path is left.
  const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  const sheet = readFileSync('src/app/dashboard/page.tsx', 'utf8');
  const counter = readFileSync('src/lib/counter-pay.ts', 'utf8');
  ok('the tee sheet’s cash goes through the register (old tabs too)', route.includes("if (action === 'take_cash' || action === 'paid_offline')") && /take_cash[\s\S]{0,900}ringUpCash\(/.test(route)
    // MEM-ACCT: the route settles a group itself only onto a member's account — never as cash.
    && (route.match(/settleAtCounter\(/g) ?? []).length === (route.match(/settleAtCounter\([^)]*onAccount: \{ membershipId \}/g) ?? []).length);
  ok('a walk-in "paying cash now" is booked, then rung up', /if \(checkInNow\) \{\s*const cash = await ringUpCash\(/.test(route));
  ok('a counter booking can’t be created paid', !counter.slice(counter.indexOf('export async function createCounterBooking')).includes("'paid_offline'") && !counter.includes('paidNow'));
  ok('the tee sheet no longer offers "paid at counter"', !/paid at counter/i.test(sheet) && sheet.includes("bookingLifecycle(b, 'take_cash')") && sheet.includes('/dashboard/shop?round='));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('cash-at-counter-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });

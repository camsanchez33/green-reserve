// Takes cash (Cam 2026-11-17: "Takes cash" OFF means no cash anywhere). Both
// states against a real database: on, cash works as before; off, every cash
// path refuses with the plain error and nothing that already moved changes;
// card-only paths and checks are untouched. Run: npx tsx scripts/takes-cash-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { ringUpCash } from '../src/lib/register';
import { createCounterBooking, settleAtCounter } from '../src/lib/counter-pay';
import { createSale, settleOpenSale, voidCashSale, refundSale } from '../src/lib/shop-sales';
import { markDuesPaidAtCourse } from '../src/lib/membership-dues';
import { markStatementPaidOffline } from '../src/lib/member-statements';
import { recordCoursePayment, settleOpenPayment, refundPayment } from '../src/lib/event-payments';
import { requireRegisterOpen } from '../src/lib/register-open';
import { cashRefused, CASH_OFF } from '../src/lib/takes-cash';
import { todayIn } from '../src/lib/course-time';

const TAG = 'takescash';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };
const refusedOff = (r: { ok: boolean; status?: number; error?: string }) => !r.ok && r.status === 409 && r.error === CASH_OFF;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventRefund.deleteMany({ where: { payment: { courseId: { in: ids } } } });
  await prisma.courseEventPayment.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // Static: the switch is the owner's.
  const settings = readFileSync('src/app/api/operator/settings/route.ts', 'utf8');
  // Routes that change state before reaching the lib refuse cash FIRST (review 2026-11-17).
  const bk = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8'), sales = readFileSync('src/app/api/operator/shop-sales/route.ts', 'utf8');
  const split = bk.slice(bk.indexOf("if (action === 'split')"));
  ok('Pay separately + cash is refused before the group is split', split.indexOf('cashRefused(session.courseId)') > -1 && split.indexOf('cashRefused(session.courseId)') < split.indexOf('splitBooking('));
  ok('a walk-in paying cash now is refused before the booking is made', bk.indexOf('if (checkInNow) { const off = await cashRefused(') > -1 && bk.indexOf('if (checkInNow) { const off = await cashRefused(') < bk.indexOf('createCounterBooking('));
  const pc = sales.slice(sales.indexOf("if (body.action === 'paid_cash') {"));
  ok('Take cash on an open sale is refused before its card payment is stopped', pc.indexOf('cashRefused(g.session.courseId)') > -1 && pc.indexOf('cashRefused(g.session.courseId)') < pc.indexOf('cancelSaleIntent(') && pc.indexOf('cashRefused(g.session.courseId)') < pc.indexOf('reconcileStuckSale('));
  ok('staff cannot change Takes cash', /session\.isStaff && 'takesCash' in body\) return NextResponse\.json\([^)]*\{ status: 403 \}/.test(settings));

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Cash GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  ok('a new course takes cash unless the owner turns it off', c.takesCash === true && (await cashRefused(c.id)) === null);
  const today = todayIn('UTC');
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: '23:50', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const item = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Balls', priceCents: 1000, stockCount: 50 } });

  // ON: cash works.
  const b1 = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'On Group', players: 1 }, STAFF);
  const on1 = b1.ok ? await ringUpCash(c.id, { lines: [], bookingIds: [b1.id], walkIns: [], soldBy: 'staff', actor: STAFF }) : null;
  ok('on: a group’s round is rung up in cash', !!on1?.ok, on1);
  const paidSale = await createSale({ courseId: c.id, lines: [{ shopItemId: item.id, quantity: 2 }], pay: 'cash', soldBy: 'staff' });
  ok('on: a cash sale at the register', paidSale.ok && paidSale.value.status === 'paid_cash', paidSale);
  const refundable = await createSale({ courseId: c.id, lines: [{ shopItemId: item.id, quantity: 1 }], pay: 'cash', soldBy: 'staff' });
  ok('on: the register must be open for a card at the counter', (await requireRegisterOpen(c.id)) !== null);
  // A register sale whose round was settled in cash just before the owner turned cash off (ringUpCash settles first).
  const b3 = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'Mid Sale', players: 1 }, STAFF);
  const s3 = b3.ok ? await settleAtCounter(c.id, b3.id, { actor: STAFF, actorName: 'staff' }) : null;
  ok('on: a round settles at the counter in cash', !!s3?.ok, s3);

  // OFF.
  await prisma.course.update({ where: { id: c.id }, data: { takesCash: false } });
  const movesBefore = await prisma.moneyMove.count({ where: { courseId: c.id } });
  const salesBefore = JSON.stringify(await prisma.shopSale.findMany({ where: { courseId: c.id }, orderBy: { id: 'asc' }, select: { id: true, status: true, totalCents: true, refundedCents: true } }));

  const b2 = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'Off Group', players: 1 }, STAFF);
  ok('off: a walk-in can still be booked', b2.ok, b2);
  const r1 = await ringUpCash(c.id, { lines: [], bookingIds: [b2.ok ? b2.id : ''], walkIns: [], soldBy: 'staff', actor: STAFF });
  ok('off: Take cash / split + cash / walk-in cash (ringUpCash) refuse', refusedOff(r1), r1);
  ok('…and the group still owes', b2.ok && (await prisma.booking.findUniqueOrThrow({ where: { id: b2.id } })).paymentStatus === 'manual');
  ok('off: settleAtCounter’s cash path refuses', b2.ok && refusedOff(await settleAtCounter(c.id, b2.id, { actor: STAFF, actorName: 'staff' })));
  ok('off: a cash sale at the register refuses', refusedOff(await createSale({ courseId: c.id, lines: [{ shopItemId: item.id, quantity: 1 }], pay: 'cash', soldBy: 'staff' })));
  const open = await prisma.shopSale.create({ data: { courseId: c.id, status: 'open', totalCents: 1000, soldBy: 'staff' } });
  ok('off: taking cash for an open sale refuses', refusedOff(await settleOpenSale(c.id, open.id, 'paid_cash')) && (await prisma.shopSale.findUniqueOrThrow({ where: { id: open.id } })).status === 'open');
  ok('off: voiding a cash sale (cash back from the drawer) refuses', paidSale.ok && refusedOff(await voidCashSale(c.id, paidSale.value.id)));
  ok('off: refunding a cash sale in cash refuses', refundable.ok && refusedOff(await refundSale(c.id, refundable.value.id, {}, 'staff')));
  ok('off: voiding an open sale still works (no money moves)', (await settleOpenSale(c.id, open.id, 'void')).ok);

  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', annualFeeCents: 50000 } });
  const m = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'M One' } });
  ok('off: dues in cash refuse', refusedOff(await markDuesPaidAtCourse(c.id, m.id, { method: 'cash' })));
  ok('off: dues with no method (which meant cash) refuse', refusedOff(await markDuesPaidAtCourse(c.id, m.id, {})));
  ok('off: dues by check still work', (await markDuesPaidAtCourse(c.id, m.id, { method: 'check' })).ok);
  ok('off: a statement paid in cash refuses', refusedOff(await markStatementPaidOffline(c.id, 'none', 'cash')));
  ok('off: …a statement by check is not refused for cash', (await markStatementPaidOffline(c.id, 'none', 'check')).error !== CASH_OFF);

  const ev = await prisma.courseEvent.create({ data: { courseId: c.id, name: 'Outing', date: today, startTime: '08:00', holdFrom: '08:00', holdTo: '12:00' } });
  ok('off: event cash refuses', refusedOff(await recordCoursePayment(c.id, ev.id, { amount: 50, method: 'cash' }, 'staff')));
  ok('off: event by check still works', (await recordCoursePayment(c.id, ev.id, { amount: 50, method: 'check' }, 'staff')).ok);
  ok('off: marking an open event payment paid in cash refuses', refusedOff(await settleOpenPayment(c.id, 'none', { method: 'cash' })));
  const cashPaid = await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId: c.id, label: 'Earlier cash', amountCents: 5000, method: 'cash', status: 'paid', paidAt: new Date() } });
  ok('off: refunding an event cash payment in cash refuses', refusedOff(await refundPayment(c.id, cashPaid.id, { amount: 10 }, 'staff')));

  ok('off: the register needn’t be open for a card', (await requireRegisterOpen(c.id)) === null);
  ok('a course that doesn’t exist is never let through', (await requireRegisterOpen('no-such-course')) !== null);
  const salesAfter = JSON.stringify(await prisma.shopSale.findMany({ where: { courseId: c.id, id: { not: open.id } }, orderBy: { id: 'asc' }, select: { id: true, status: true, totalCents: true, refundedCents: true } }));
  ok('turning it off changed no sale that had already moved money', salesAfter === JSON.stringify(JSON.parse(salesBefore).filter((s: { id: string }) => s.id !== open.id)));
  const cashMovesAfter = await prisma.moneyMove.count({ where: { courseId: c.id, method: 'cash' } });
  const cashMovesBefore = movesBefore; // every move before OFF was cash
  ok('no cash moved while it was off', cashMovesAfter === cashMovesBefore, { cashMovesAfter, cashMovesBefore });

  // Checked after the "nothing moved" checks: this round's cash was taken while cash was on.
  // ringUpCash checked before settling; createSale must not strand a round already settled.
  const midSale = b3.ok && s3?.ok ? await createSale({ courseId: c.id, lines: [], pay: 'cash', soldBy: 'staff', rounds: [{ bookingId: b3.id, name: 'round', amountCents: s3.amountCents }] }) : null;
  ok('off mid-sale: the sale for a round already settled in cash is still recorded', !!midSale?.ok && midSale.value.status === 'paid_cash', midSale);
  ok('off: items with an empty rounds list are refused', refusedOff(await createSale({ courseId: c.id, lines: [{ shopItemId: item.id, quantity: 1 }], pay: 'cash', soldBy: 'staff', rounds: [] })));
  const salesRoute = readFileSync('src/app/api/operator/shop-sales/route.ts', 'utf8');
  const routeCall = salesRoute.slice(salesRoute.indexOf('await createSale({'), salesRoute.indexOf('});', salesRoute.indexOf('await createSale({')));
  ok('only ringUpCash passes rounds to createSale (the register route never does)', routeCall.length > 0 && !/\brounds\b/.test(routeCall) && (readFileSync('src/lib/register.ts', 'utf8').match(/rounds/g) ?? []).length > 0);
  // ON again.
  await prisma.course.update({ where: { id: c.id }, data: { takesCash: true } });
  const back = await ringUpCash(c.id, { lines: [], bookingIds: [b2.ok ? b2.id : ''], walkIns: [], soldBy: 'staff', actor: STAFF });
  ok('turned back on, cash works again', back.ok, back);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('takes-cash-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

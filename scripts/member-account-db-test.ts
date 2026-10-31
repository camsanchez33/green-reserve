// MEM-ACCT (Cam 2026-10-30: member billing — rounds, guests and shop "on account"; a limit
// "course sets one per tier"; GreenReserve's fee "collect it on the statement"): a group's round
// goes on a member's account and is checked in like cash; the limit holds under two counters at
// once; credits take money off; nothing on account is cash in the drawer.
// Needs a database. Run: npx tsx scripts/member-account-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { fitsLimit, accountBalance, accountMembers, creditAccount, readAccountSettings, accountView } from '../src/lib/member-account';
import { createCounterBooking, settleAtCounter, accountDueCents, roundNote } from '../src/lib/counter-pay';
import { isBookingMode } from '../src/lib/booking-mode';
import { addDaysStr, todayIn } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'memberaccountdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.memberCharge.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const settle = (c: string, b: string, m: string) => settleAtCounter(c, b, { actor: STAFF, actorName: 'Front desk', onAccount: { membershipId: m } });

(async () => {
  await cleanup();
  ok('limits: under, at, over; credits always fit; no limit', fitsLimit(50, 50, 100) && !fitsLimit(60, 50, 100) && fitsLimit(500, -10, 100) && fitsLimit(1e6, 1e6, null));
  ok('tier settings are checked', readAccountSettings({ accountLimitCents: 50 }).ok === false && readAccountSettings({ accountLimitCents: Number.NaN }).ok === false && readAccountSettings({ accountOn: true, accountLimitCents: null }).ok);
  ok('a guest round: the counter price plus an online fee, prorated for a part check-in', (() => { const b = { players: 4, totalAmount: 20600, accessFeeTotal: 600, rangeBallsTotal: 0, greenFeeTotal: 20000, cartFeeTotal: 0, memberRateCents: null, memberCartCents: null, residentPlayers: 0, residentRateCents: null }; const all = accountDueCents(b); const two = accountDueCents(b, 2); return all.amountCents === 20600 && all.feeCents === 600 && two.feeCents === 300 && two.amountCents === 10000 + 300; })());
  ok('a new table is listed for the launch wipe', (WIPED_TABLES as readonly string[]).includes('MemberCharge'));

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Accounts', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const other = await prisma.course.create({ data: { name: 'Other', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', accountOn: true, accountLimitCents: 15000 } });
  const plain = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Social' } });
  const pat = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Pat Member', inviteEmail: `${TAG}+pat@t.local`, status: 'active' } });
  const off = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: plain.id, inviteName: 'Sam Social', inviteEmail: `${TAG}+sam@t.local`, status: 'active' } });
  const gone = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Lee Lapsed', inviteEmail: `${TAG}+lee@t.local`, status: 'inactive' } });
  const day = addDaysStr(todayIn('UTC'), 1);
  const slot = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 40 } });
  const book = async (n: number) => { const r = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Group', players: n }, STAFF); if (!r.ok) throw new Error(r.error); return r.id; };

  const picker = await accountMembers(c.id);
  ok('the picker: active members on a tier with accounts only, with balance and limit', picker.length === 1 && picker[0].id === pat.id && picker[0].balanceCents === 0 && picker[0].limitCents === 15000, picker);

  const b1 = await book(2);
  const r1 = await settle(c.id, b1, pat.id);
  const row = await prisma.booking.findUniqueOrThrow({ where: { id: b1 } });
  const line = await prisma.memberCharge.findUnique({ where: { bookingId: b1 } });
  ok('the line says whose round and when (walkthrough 2026-10-31)', line?.note === roundNote('Group', { date: day, time: '09:00' }, 2) && roundNote('Tim Jones', { date: '2026-10-31', time: '16:20' }, 3) === 'Tim Jones · Oct 31, 4:20 PM · 3 players' && roundNote('A', { date: '2026-01-05', time: '00:05' }, 1) === 'A · Jan 5, 12:05 AM · 1 player', line?.note);
  ok('a statement and the shop / event pay links are golfer pages (no marketing menu)', isBookingMode('/statement/x') && isBookingMode('/pay/shop/x') && isBookingMode('/pay/event/x') && !isBookingMode('/pricing'));
  ok('a group of two on the account: $100, checked in, on_account, not paid offline', r1.ok && r1.amountCents === 10000 && row.status === 'completed' && row.paymentStatus === 'on_account' && !row.paidOffline && line?.amountCents === 10000 && line.kind === 'round' && line.feeCents === 0 && line.createdBy === 'Front desk', { r1, ps: row.paymentStatus, line });
  ok('…settling it again is refused, with one line', !(await settle(c.id, b1, pat.id)).ok && (await prisma.memberCharge.count({ where: { bookingId: b1 } })) === 1);

  const b2 = await book(2);
  const over = await settle(c.id, b2, pat.id);
  const still = await prisma.booking.findUniqueOrThrow({ where: { id: b2 } });
  ok('past the $150 limit: refused with the reason, the group left unsettled', !over.ok && /limit/.test(over.error) && still.status === 'confirmed' && still.paymentStatus !== 'on_account' && (await prisma.memberCharge.count({ where: { bookingId: b2 } })) === 0, { over, s: still.status });
  ok('not on a tier with accounts, or not active: refused', !(await settle(c.id, b2, off.id)).ok && !(await settle(c.id, b2, gone.id)).ok && (await prisma.booking.findUniqueOrThrow({ where: { id: b2 } })).status === 'confirmed');
  ok('another course\'s member: refused', await (async () => { const om = await prisma.courseMembership.create({ data: { courseId: other.id, inviteName: 'X', status: 'active' } }); return !(await settle(c.id, b2, om.id)).ok; })());

  ok('a credit needs a reason and a sane amount', !(await creditAccount(c.id, pat.id, 3000, '', 'Owner')).ok && !(await creditAccount(c.id, pat.id, -5, 'x', 'Owner')).ok);
  const cr = await creditAccount(c.id, pat.id, 3000, 'Rain check', 'Owner');
  ok('a $30 credit: balance $70', cr.ok && cr.balanceCents === 7000 && (await accountBalance(pat.id)) === 7000);
  const v = await accountView(c.id, pat.id);
  ok('the member\'s account: balance, limit, lines newest first', !!v && v.balanceCents === 7000 && v.limitCents === 15000 && v.lines.length === 2 && v.lines[0].kind === 'credit');
  ok('another course can\'t see it', (await accountView(other.id, pat.id)) === null);

  // Two counters at once, $50 each with $80 of room: only one fits.
  await prisma.membershipTier.update({ where: { id: tier.id }, data: { accountLimitCents: 7000 + 8000 } });
  const [x, y] = [await book(1), await book(1)];
  const both = await Promise.all([settle(c.id, x, pat.id), settle(c.id, y, pat.id)]);
  ok('two counters at once: one fits ($50), the other ($50) would pass $150 — refused', both.filter(r => r.ok).length === 1 && (await accountBalance(pat.id)) === 12000, both);

  // Online booking with GreenReserve's fee: carried on the line, for the statement.
  const b3 = await book(1);
  await prisma.booking.update({ where: { id: b3 }, data: { source: 'online', accessFeeTotal: 150, totalAmount: 5150 } });
  await prisma.membershipTier.update({ where: { id: tier.id }, data: { accountLimitCents: null } });
  const r3 = await settle(c.id, b3, pat.id);
  const l3 = await prisma.memberCharge.findUnique({ where: { bookingId: b3 } });
  ok('an online booking: $51.50 on account, the $1.50 fee carried for the statement', r3.ok && l3?.amountCents === 5150 && l3.feeCents === 150, l3);

  // Wiring.
  ok('the golfer\'s check-in and receipt never say "charged to your card" for an account round', readFileSync('src/app/api/checkin/[bookingId]/route.ts', 'utf8').includes("onAccount: booking.paymentStatus === 'on_account'") && readFileSync('src/app/checkin/[bookingId]/page.tsx', 'utf8').includes("onAccount ? 'On your member account.") && (readFileSync('src/app/receipt/[bookingId]/page.tsx', 'utf8').match(/onAccount \? 'On your member account'/g) ?? []).length === 2);
  ok('shop tax on an account round is recorded (and retried) like cash', (readFileSync('src/lib/round-shop-tax.ts', 'utf8').match(/on_account/g) ?? []).length >= 2);
  const close = readFileSync('src/lib/register-close.ts', 'utf8');
  ok('the close-out counts only cash — on account is never in the drawer', close.includes("paymentStatus: 'paid_offline'") && !close.includes('on_account'));
  ok('analytics shows it apart', readFileSync('src/lib/analytics.ts', 'utf8').includes('accountCents: onAccount'));
  const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  ok('the tee-sheet action needs counter payments', route.includes("charge_account: 'sheet.counter_payment'") && route.includes('onAccount: { membershipId }'));
  const api = readFileSync('src/app/api/operator/member-accounts/route.ts', 'utf8');
  ok('credits need money.refund; one account needs members.view', api.includes("requirePermission(session, 'money.refund')") && api.includes("requirePermission(session, 'members.view')"));
  ok('the counter fee report doesn\'t count on-account as uncollected', !readFileSync('src/lib/access-fee.ts', 'utf8').includes('on_account'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('member-account-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

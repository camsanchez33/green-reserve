// Revamp 3 dead end 19 (Cam 2026-10-29): staff change a group's party size at the
// counter (lib/change-party, shared with the golfer's own link), and a card
// check-in takes a partial party from the card form too. Needs a database.
// Run: npx tsx scripts/change-party-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { changePartySize } from '../src/lib/change-party';
import { addDaysStr, todayIn } from '../src/lib/course-time';

const TAG = 'changepartydbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { code?: string }).code ?? 'throw'; } };

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
  const mk = (s: string) => prisma.course.create({ data: { name: s, slug: `${TAG}-${s}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', cancellationHours: 24, lateCancellationFeeCents: 1000 } });
  const c = await mk('a'), other = await mk('b');
  // Tomorrow morning: inside the 24-hour late-fee window.
  const day = addDaysStr(todayIn('UTC'), 1);
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2 } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Two Ball', golferEmail: `${TAG}@t.local`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, cancellationFeeTotal: 1000, status: 'confirmed', paymentStatus: 'card_on_file', checkInToken: 'tok' } });

  ok('another course can\'t change it', (await code(changePartySize(b.id, 3, { by: 'staff', courseId: other.id, actor: STAFF }))) === 'INVALID');
  ok('the golfer can\'t change it inside the late-fee window', (await code(changePartySize(b.id, 3, { by: 'golfer', token: 'tok' }))) === 'CUTOFF');
  const r = await changePartySize(b.id, 3, { by: 'staff', courseId: c.id, actor: STAFF });
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  const slot = await prisma.teeTime.findUniqueOrThrow({ where: { id: tt.id } });
  ok('staff at the counter can: a 2-ball becomes 3 at the same per-player price', r.players === 3 && after.players === 3 && after.greenFeeTotal === 15000 && after.accessFeeTotal === 450, after);
  ok('…the seat is taken on the tee time', slot.playersBooked === 3);
  const ev = await prisma.bookingEvent.findFirst({ where: { bookingId: b.id, type: 'price_changed' } });
  ok('…and it is on the Timeline as a party-size change', !!ev && JSON.stringify(ev.metadata).includes('party_size'));
  ok('…without re-stamping the golfer\'s terms', after.termsAcceptedAt === null);
  const big = await code(changePartySize(b.id, 5, { by: 'staff', courseId: c.id, actor: STAFF }));
  ok('more than the time (or the round\'s group size) holds is refused', big === 'FULL' || big === 'SIZE', big);

  await prisma.booking.update({ where: { id: b.id }, data: { noShowAt: new Date() } });
  ok('a no-show can\'t change', (await code(changePartySize(b.id, 2, { by: 'staff', courseId: c.id, actor: STAFF }))) === 'STARTED');
  await prisma.booking.update({ where: { id: b.id }, data: { noShowAt: null, paymentStatus: 'paid', roundPaymentIntentId: 'pi_x' } });
  ok('nor a paid round', (await code(changePartySize(b.id, 2, { by: 'staff', courseId: c.id, actor: STAFF }))) === 'PAID');

  // The tee sheet: a Players picker, and the card form asks how many showed.
  const sheet = readFileSync('src/app/dashboard/page.tsx', 'utf8');
  ok('the time card has a Players picker for groups not yet paid', sheet.includes("action: 'change_players', newPlayers: n"));
  ok('a no-card or declined check-in asks how many showed, and charges them only', sheet.includes('function openCardModal(b: Booking, reason: string, showed?: number)') && sheet.includes('...(cardModalShowed ? { checkedInPlayers: cardModalShowed } : {})') && sheet.includes('partRound(booking, showed, true)'));
  ok('the route gates it like residents (a counter price change)', readFileSync('src/app/api/operator/bookings/route.ts', 'utf8').includes("change_players: 'sheet.counter_payment'"));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('change-party-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });

// Audit 2026-11-24 M1 (review): the races the reviewer reproduced, pinned.
//  - Two card-reader status checks finalizing one tap at once: recorded once, nothing refunded (a miss on
//    check-in's conditional write is not proof of a cancel; the reader settles its own twins).
//  - A paid, still-confirmed round: a check-in during the cancel's refund is refused (both claim the round).
//  - A paid round cancels right after paying (its own charge's lock doesn't count); a failed cancel lets go.
//  - L5: a refund the Stripe webhook recorded first is adopted by the admin refund (its reason, its email).
// Real database; Stripe is stubbed. Run: npx tsx scripts/money-locks-race-db-test.ts
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function readerTwin() {

  const { prisma } = await import('../src/lib/prisma');
  const { stripe } = await import('../src/lib/stripe');
  const { startRoundOnReader, roundReaderStatus } = await import('../src/lib/reader-rounds');
  const { todayIn } = await import('../src/lib/course-time');
  const TAG = 'rvwtwin';
  process.env.RESEND_API_KEY = '';
  const STAFF = { type: 'staff' as const, id: null };
  type PI = { id: string; amount: number; status: string; account: string; fee?: number; key: string; metadata: Record<string, string>; created: number; application_fee_amount?: number };
  const intents = new Map<string, PI>();
  const refunds: { pi: string; key: string }[] = [];
  const readers = new Map<string, any>();
  const s = stripe as any;
  s.paymentIntents.create = async (p: any, o: any) => { const pi: PI = { id: `pi_${TAG}_${intents.size + 1}`, amount: p.amount, status: 'requires_payment_method', account: o.stripeAccount, fee: p.application_fee_amount, key: o.idempotencyKey, metadata: p.metadata, created: Math.floor(Date.now() / 1000) }; intents.set(pi.id, pi); return { ...pi }; };
  s.paymentIntents.retrieve = async (id: string) => { await new Promise(r => setTimeout(r, 20)); return { ...intents.get(id)! }; };
  s.paymentIntents.search = async () => ({ data: [] });
  s.refunds.create = async (p: any, o: any) => { refunds.push({ pi: p.payment_intent, key: o.idempotencyKey }); return { id: `re_${TAG}_${refunds.length}`, amount: p.amount ?? intents.get(p.payment_intent)?.amount ?? 0 }; };
  s.refunds.list = async () => ({ data: [] });
  s.terminal.readers.retrieve = async (id: string) => ({ ...readers.get(id) });
  s.terminal.readers.processPaymentIntent = async (id: string, p: any) => { const r = readers.get(id); r.action = { type: 'process_payment_intent', status: 'in_progress', process_payment_intent: { payment_intent: p.payment_intent } }; return { ...r }; };
  const cleanup = async () => {
    const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map((c: any) => c.id);
    await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
    await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.course.deleteMany({ where: { id: { in: ids } } });
    await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  };
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Twin', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_tw', stripeAccountActive: true, terminalLocationId: 'tml_tw' } });
  readers.set('tmr_tw', { id: 'tmr_tw', location: 'tml_tw', account: 'acct_tw', status: 'online', device_type: 'simulated_wisepos_e', action: null });
  const today = todayIn('UTC');
  const t = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: '23:50', holes: 18, greenFeeCents: 5000, playersAvailable: 4, playersBooked: 2 } });
  const b = await prisma.booking.create({ data: { teeTimeId: t.id, courseId: c.id, golferName: 'Twin Group', golferEmail: `${TAG}+g@t.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const st = await startRoundOnReader(c.id, b.id, 'tmr_tw', STAFF);
  const cur = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  const pi = intents.get(cur.readerIntentId)!;
  pi.status = 'succeeded'; readers.get('tmr_tw').action.status = 'succeeded';
  // Two status checks land together (setInterval poll overlapping a slow one, or a poll and the Cancel button).
  const both = await Promise.all([roundReaderStatus(c.id, b.id, STAFF), roundReaderStatus(c.id, b.id, STAFF)]);
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  const moves = await prisma.moneyMove.findMany({ where: { bookingId: b.id }, select: { direction: true, amountCents: true, note: true } });
  ok('reader: two status checks finalizing one tap at once record it once and refund nothing', st.ok && both.every((r: any) => r.ok && r.value.status === 'paid') && after.status === 'completed' && after.paymentStatus === 'paid' && refunds.length === 0 && moves.filter((m: any) => m.direction === 'out').length === 0, { both, refunds, moves });
  await cleanup();
}

async function paidCancel() {

  const { prisma } = await import('../src/lib/prisma');
  const { stripe } = await import('../src/lib/stripe');
  const { performCancellation } = await import('../src/lib/cancel-booking');
  const { performCheckIn } = await import('../src/lib/checkin-booking');
  const TAG = 'rvwpaid';
  process.env.RESEND_API_KEY = '';
  const refunds: { pi: string; key: string }[] = [];
  let during: null | (() => Promise<void>) = null;
  const s = stripe as any;
  s.refunds.create = async (p: any, o: any) => { refunds.push({ pi: p.payment_intent, key: o.idempotencyKey }); if (during) { const f = during; during = null; await f(); } return { id: `re_${TAG}_${refunds.length}`, amount: p.amount ?? 4000 }; };
  s.refunds.list = async () => ({ data: [] });
  s.paymentIntents.search = async () => ({ data: [] });
  const cleanup = async () => {
    const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map((c: any) => c.id);
    await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
    await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.course.deleteMany({ where: { id: { in: ids } } });
    await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  };
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Paid', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_pd', stripeAccountActive: true } });
  const mk = async (time: string, data: Record<string, unknown>) => {
    const t = await prisma.teeTime.create({ data: { courseId: c.id, date: '2030-06-01', time, holes: 18, greenFeeCents: 4000, playersAvailable: 4, playersBooked: 1 } });
    return prisma.booking.create({ data: { teeTimeId: t.id, courseId: c.id, golferName: 'Pat', golferEmail: `${TAG}+g@t.local`, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'confirmed', paymentStatus: 'paid', roundPaymentIntentId: `pi_${TAG}_round`, roundChargedCents: 4000, paidAt: new Date(), ...data } });
  };
  // A: the round was paid a while ago (its charge's lock is long stale). Staff check the group in while the golfer's cancel is refunding.
  const a = await mk('08:00', { shopLockedAt: new Date(Date.now() - 20 * 60_000) });
  let checkin: unknown = null;
  during = async () => { checkin = await performCheckIn(a.id, { type: 'staff', id: null }); };
  const cancel = await performCancellation(a.id, { type: 'golfer', id: null });
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: a.id } });
  ok('paid round: a check-in arriving while the cancel refunds it is refused; the round ends cancelled and refunded', 'success' in cancel && !!checkin && (checkin as { status?: number }).status === 409 && after.status === 'cancelled' && after.paymentStatus === 'refunded', { cancel, checkin, after: { s: after.status, p: after.paymentStatus } });
  // B: the round was paid two minutes ago (the charge leaves shopLockedAt set). The golfer cancels.
  const b = await mk('08:10', { roundPaymentIntentId: `pi_${TAG}_round2`, shopLockedAt: new Date(Date.now() - 2 * 60_000) });
  const cancelB = await performCancellation(b.id, { type: 'system' }, { waiveFee: true, courseCalledOff: 'closure' });
  ok('paid round: cancelled two minutes after paying (its own charge\'s lock doesn\'t block it)', 'success' in cancelB && (await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status === 'cancelled', cancelB);
  // C: a paid round whose cancel fails (refund refused) — what is left of the items freeze?
  const cc = await mk('08:20', { roundPaymentIntentId: `pi_${TAG}_round3`, shopLockedAt: new Date(Date.now() - 20 * 60_000) });
  s.refunds.create = async () => { throw new Error('stripe is down'); };
  const cancelC = await performCancellation(cc.id, { type: 'golfer', id: null });
  const afterC = await prisma.booking.findUniqueOrThrow({ where: { id: cc.id } });
  ok('paid round: a cancel whose refund fails leaves it confirmed and paid, and lets go of its claim', 'error' in cancelC && afterC.status === 'confirmed' && afterC.paymentStatus === 'paid' && afterC.shopLockedAt === null, { cancelC, afterC: { s: afterC.status, l: afterC.shopLockedAt } });
  await cleanup();
}

async function cardChargeLosesToCancel() {
  const { prisma } = await import('../src/lib/prisma');
  const { stripe } = await import('../src/lib/stripe');
  const { performCheckIn } = await import('../src/lib/checkin-booking');
  const TAG = 'mlrcardmiss';
  let bookingId = '';
  const refunds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = stripe as any;
  s.paymentIntents.search = async () => ({ data: [] });
  s.paymentMethods.create = async () => ({ id: 'pm_clone' });
  // The charge goes through, and while it does the booking is cancelled from somewhere without a claim (simulated).
  s.paymentIntents.create = async (p: { amount: number }) => {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
    return { id: `pi_${TAG}`, amount: p.amount, status: 'succeeded', created: Math.floor(Date.now() / 1000), application_fee_amount: 0 };
  };
  s.refunds.create = async (p: { payment_intent: string; amount?: number }) => { refunds.push(p.payment_intent); return { id: `re_${TAG}`, amount: p.amount ?? 4000 }; };
  const cleanup = async () => {
    const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
    await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
    await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.course.deleteMany({ where: { id: { in: ids } } });
    await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  };
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Miss', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_ms', stripeAccountActive: true } });
  const t = await prisma.teeTime.create({ data: { courseId: c.id, date: '2030-06-01', time: '07:30', holes: 18, greenFeeCents: 4000, playersAvailable: 4, playersBooked: 1 } });
  const b = await prisma.booking.create({ data: { teeTimeId: t.id, courseId: c.id, golferName: 'Pat', golferEmail: `${TAG}+g@t.local`, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'confirmed', paymentStatus: 'card_on_file', stripeCustomerId: 'cus_x', stripePaymentMethodId: 'pm_x' } });
  bookingId = b.id;
  const r = await performCheckIn(b.id, { type: 'staff', id: null });
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  const moves = await prisma.moneyMove.findMany({ where: { bookingId: b.id }, select: { direction: true, stripeId: true } });
  ok('M1 a card charge that loses to a cancel is given back, on the ledger both ways, and the booking stays cancelled', 'error' in r && refunds[0] === `pi_${TAG}` && after.status === 'cancelled' && after.paymentStatus !== 'paid' && moves.some(m => m.direction === 'in' && m.stripeId === `pi_${TAG}`) && moves.some(m => m.direction === 'out'), { r, refunds, ps: after.paymentStatus, moves });
  await cleanup();
}

async function webhookFirst() {
  const { prisma } = await import('../src/lib/prisma');
  const { stripe } = await import('../src/lib/stripe');
  const { refundBooking } = await import('../src/lib/refund-booking');
  const TAG = 'mlrwebhook';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = stripe as any;
  s.refunds.list = async () => ({ data: [] });
  s.refunds.create = async (p: { amount: number }) => ({ id: `re_${TAG}_1`, amount: p.amount });
  const cleanup = async () => {
    const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
    await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
    await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.course.deleteMany({ where: { id: { in: ids } } });
    await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  };
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Hook', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_hk' } });
  const t = await prisma.teeTime.create({ data: { courseId: c.id, date: '2030-06-01', time: '07:00', holes: 18, greenFeeCents: 4000, playersAvailable: 4, playersBooked: 1 } });
  const b = await prisma.booking.create({ data: { teeTimeId: t.id, courseId: c.id, golferName: 'Pat', golferEmail: `${TAG}+g@t.local`, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: `pi_${TAG}`, roundChargedCents: 4000 } });
  // The webhook recorded the refund before the route got to it.
  await prisma.paymentEvent.create({ data: { bookingId: b.id, kind: 'refund', amountCents: 4000, stripeId: `re_${TAG}_1`, actor: 'stripe', detail: 'Refund recorded from Stripe (no reason given)' } });
  const r = await refundBooking(b.id, { reason: 'rained out', actor: 'admin', actorName: 'Tester' });
  const rows = await prisma.paymentEvent.findMany({ where: { bookingId: b.id, kind: 'refund' } });
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  ok('L5 a refund the webhook recorded first is adopted: one row, with who and why, and the round marked refunded', r.ok && rows.length === 1 && rows[0].actor === 'admin' && rows[0].detail === 'rained out' && after.paymentStatus === 'refunded', { r, rows, ps: after.paymentStatus });
  await cleanup();
}

(async () => {
  await readerTwin();
  await paidCancel();
  await cardChargeLosesToCancel();
  await webhookFirst();
  const { prisma } = await import('../src/lib/prisma');
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

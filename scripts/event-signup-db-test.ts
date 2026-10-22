// W2-9d — the public event sign-up against a database, with the Stripe
// client's methods swapped for fakes (as event-payments-db-test.ts does):
// questions, groups, the waiting list when full, the capacity lock under
// concurrent sign-ups, paying now (one charge for the group, a 30-minute hold
// that lapses), staff moving people onto the list, and tenant isolation.
// Needs a database, no Stripe. Run: npx tsx scripts/event-signup-db-test.ts
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { submitSignup, signupPage, cleanQuestions, signupSettings, spotsTaken, lapseHolds, moveOntoList } from '../src/lib/event-signup';
import { chargeEventPayment, createPayLink, recordCoursePayment, settleOpenPayment, playerPayState, playerPaymentsWhere, holdProblem } from '../src/lib/event-payments';
import { autoPairings } from '../src/lib/course-events';

const TAG = 'evsignupdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ── Fake Stripe (every charge succeeds) ──────────────────────────────────────
const intents = new Map<string, { id: string; status: string; amount: number }>();
let charges = 0;
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.customers.create = async () => ({ id: 'cus_fake' });
s.paymentMethods.attach = async () => ({ id: 'pm_fake' });
s.paymentMethods.create = async () => ({ id: 'pm_clone_fake' });
s.paymentIntents.create = async (p: { amount: number }, o: { idempotencyKey: string }) => {
  const id = `pi_${o.idempotencyKey}`;
  if (!intents.has(id)) intents.set(id, { id, status: 'requires_payment_method', amount: p.amount });
  return { ...intents.get(id)! };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { intents.get(id)!.status = 'canceled'; return { ...intents.get(id)! }; };
s.paymentIntents.confirm = async (id: string) => { charges++; const pi = intents.get(id)!; pi.status = 'succeeded'; return { ...pi }; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: courses.map(c => c.id) } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

const one = (name: string, email = `${name.toLowerCase()}@example.com`, answers: Record<string, string> = {}) => ({ name, email, phone: '', answers });

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Ev', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Ev ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const course = await mk('a'); const other = await mk('b');
  const mkEvent = (data: Record<string, unknown> = {}) => prisma.courseEvent.create({ data: { courseId: course.id, name: 'Member-guest', date: '2031-05-14', startTime: '08:00', holdFrom: '07:00', holdTo: '12:30', signupOpen: true, ...data } });

  // ── Pure ──
  const qs = cleanQuestions([{ id: 'abc123def456', label: ' Handicap ', required: true }, { label: '' }, { id: 'bad id!', label: 'Shirt size' }]);
  check('questions: blanks dropped, a good id kept, a bad one replaced', qs.length === 2 && qs[0].id === 'abc123def456' && qs[0].label === 'Handicap' && qs[0].required && /^[a-f0-9]{12}$/.test(qs[1].id) && !qs[1].required, qs);
  check('questions: at most 10', cleanQuestions(Array.from({ length: 14 }, (_, i) => ({ label: `Q${i}` }))).length === 10);
  check('settings: group size 1–4', !signupSettings({ signupMaxGroup: 5 }).ok && !signupSettings({ signupMaxGroup: 0 }).ok && signupSettings({ signupMaxGroup: 2 }).ok);
  const later = new Date(Date.now() + 60_000), earlier = new Date(Date.now() - 60_000);
  check('spots: on the list and live holds count; lapsed holds and the waiting list don’t',
    spotsTaken([{ status: 'in', holdUntil: null }, { status: 'held', holdUntil: later }, { status: 'held', holdUntil: earlier }, { status: 'waitlist', holdUntil: null }, { status: 'lapsed', holdUntil: null }]) === 2);
  const pairs = autoPairings([{ id: 'a' }, { id: 'b' }, { id: 'c', groupKey: 'g' }, { id: 'd', groupKey: 'g' }, { id: 'e', groupKey: 'g' }, { id: 'f' }], 4, false, 18);
  check('pairing keeps a sign-up together: a group of 3 that won’t fit starts the next group', pairs.map(p => p.groupNo).join('') === '112222', pairs);
  const big = autoPairings([{ id: 'a', groupKey: 'g' }, { id: 'b', groupKey: 'g' }, { id: 'c', groupKey: 'g' }], 2, false, 18);
  check('a sign-up bigger than a group is split', big.map(p => p.groupNo).join('') === '112', big);

  // ── Closed / cancelled ──
  const closed = await mkEvent({ signupOpen: false });
  check('a closed event has no page', (await signupPage(closed.id)) === null);
  const r0 = await submitSignup(closed.id, { players: [one('Al')] });
  check('signing up to a closed event is refused', !r0.ok && r0.status === 404);
  const gone = await mkEvent({ status: 'cancelled' });
  check('a cancelled event has no page', (await signupPage(gone.id)) === null);
  const past = await mkEvent({ date: '2020-01-01' });
  const rp = await submitSignup(past.id, { players: [one('Al')] });
  check('a past event refuses sign-ups', !rp.ok && rp.status === 409);

  // ── Pay later, groups, questions, capacity ──
  const ev = await mkEvent({ players: 4, signupMaxGroup: 3, signupQuestions: [{ id: 'hcp000000001', label: 'Handicap', required: true }, { id: 'shirt0000001', label: 'Shirt', required: false }] });
  const noHcp = await submitSignup(ev.id, { players: [one('Ann')] });
  check('a required question must be answered', !noHcp.ok && noHcp.status === 400 && /Handicap/.test(noHcp.error), noHcp);
  const noEmail = await submitSignup(ev.id, { players: [{ name: 'Ann', email: '', answers: { hcp000000001: '9' } }] });
  check('the person signing up must give an email', !noEmail.ok && noEmail.status === 400);
  const tooMany = await submitSignup(ev.id, { players: [1, 2, 3, 4].map(i => one(`P${i}`, '', { hcp000000001: '1' })) });
  check('more than the course allows together is refused', !tooMany.ok && tooMany.status === 400);
  const g1 = await submitSignup(ev.id, { players: [one('Ann', 'ann@example.com', { hcp000000001: '9', shirt0000001: 'L' }), { name: 'Bo', email: '', phone: '', answers: { hcp000000001: '14' } }] });
  check('pay later: the group goes straight on the list', g1.ok && g1.value.status === 'in', g1);
  const g1rows = await prisma.courseEventPlayer.findMany({ where: { eventId: ev.id }, orderBy: { sortOrder: 'asc' } });
  check('they share a sign-up key, came from the page, and their answers are kept',
    g1rows.length === 2 && g1rows.every(p => p.groupKey && p.groupKey === g1rows[0].groupKey && p.source === 'signup' && p.status === 'in') && (g1rows[0].answers as Record<string, string>).shirt0000001 === 'L' && (g1rows[1].answers as Record<string, string>).hcp000000001 === '14', g1rows);
  check('pay later: no payment is made', (await prisma.courseEventPayment.count({ where: { eventId: ev.id } })) === 0);
  const g2 = await submitSignup(ev.id, { players: [one('Cy', 'cy@example.com', { hcp000000001: '3' }), one('Di', '', { hcp000000001: '3' }), one('Ed', '', { hcp000000001: '3' })] });
  check('a group that won’t fit in the spots left goes on the waiting list whole', g2.ok && g2.value.status === 'waitlist', g2);
  const g3 = await submitSignup(ev.id, { players: [one('Fay', 'fay@example.com', { hcp000000001: '20' }), one('Gus', '', { hcp000000001: '20' })] });
  check('a group that fits still gets on', g3.ok && g3.value.status === 'in', g3);
  check('the page says it’s full', (await signupPage(ev.id))?.spotsLeft === 0);
  const g4 = await submitSignup(ev.id, { players: [one('Hal', 'hal@example.com', { hcp000000001: '1' })] });
  check('full: the next sign-up waits', g4.ok && g4.value.status === 'waitlist');

  // Staff move a group off the waiting list (the course decides, even over the number).
  const iso = await moveOntoList(other.id, ev.id, g2.ok ? g2.value.groupKey : '', 'staff@x');
  check('another course can’t move this event’s sign-ups', !iso.ok && iso.status === 404, iso);
  const moved = await moveOntoList(course.id, ev.id, g2.ok ? g2.value.groupKey : '', 'staff@x');
  check('staff move a waiting group onto the list (the email can\u2019t send here, and says so)', moved.ok && moved.value.moved === 3 && moved.value.emailed === 'failed', moved);
  check('moved players are on the list', (await prisma.courseEventPlayer.count({ where: { eventId: ev.id, status: 'in' } })) === 7);
  const again = await moveOntoList(course.id, ev.id, g2.ok ? g2.value.groupKey : '', 'staff@x');
  check('moving them twice is refused', !again.ok && again.status === 404);

  // ── The capacity lock: 8 people at once for 4 spots ──
  const race = await mkEvent({ players: 4 });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => submitSignup(race.id, { players: [one(`R${i}`)] })));
  const inCount = await prisma.courseEventPlayer.count({ where: { eventId: race.id, status: 'in' } });
  const waitCount = await prisma.courseEventPlayer.count({ where: { eventId: race.id, status: 'waitlist' } });
  check('8 at once for 4 spots: exactly 4 get on, 4 wait', results.every(r => r.ok) && inCount === 4 && waitCount === 4, { inCount, waitCount });

  // ── Pay now ──
  const paid = await mkEvent({ players: 6, signupPay: 'now', pricePerPlayerCents: 5000 });
  const pg = await submitSignup(paid.id, { players: [one('Ivy', 'ivy@example.com'), one('Jo', 'jo@example.com')] });
  check('pay now: they are sent to pay', pg.ok && pg.value.status === 'pay' && !!pg.value.payUrl, pg);
  const held = await prisma.courseEventPlayer.findMany({ where: { eventId: paid.id }, orderBy: { sortOrder: 'asc' } });
  const holdMs = held[0].holdUntil ? held[0].holdUntil.getTime() - Date.now() : 0;
  check('their spots are held about 30 minutes', held.every(p => p.status === 'held') && holdMs > 29 * 60_000 && holdMs <= 30 * 60_000, holdMs);
  check('held spots count against the event', (await signupPage(paid.id))?.spotsLeft === 4);
  const gp = await prisma.courseEventPayment.findFirstOrThrow({ where: { eventId: paid.id } });
  check('one payment for the group: price × players, on the lead, no GreenReserve fee while the flag is off',
    gp.amountCents === 10000 && gp.feeCents === 0 && gp.playerId === held[0].id && gp.groupKey === held[0].groupKey && gp.kind === 'player' && gp.status === 'open', gp);
  check('a held group can pay', (await holdProblem(gp.groupKey)) === null);
  // A group member can't be sent a second link, or marked paid at the counter, while the group's link is out.
  const dupLink = await createPayLink(course.id, paid.id, { playerId: held[1].id, amount: '50' }, 'staff');
  check('no separate link for someone in a group that already has one', !dupLink.ok && dupLink.status === 409, dupLink);
  const dupCash = await recordCoursePayment(course.id, paid.id, { playerId: held[1].id, amount: '50', method: 'cash' }, 'staff');
  check('no cash for someone in a group whose link is out', !dupCash.ok && dupCash.status === 409, dupCash);
  const ch = await chargeEventPayment(gp.id, gp.payToken, 'pm_card', 10000);
  check('the group pays', ch.ok && ch.value.status === 'paid' && charges === 1, ch);
  const after = await prisma.courseEventPlayer.findMany({ where: { eventId: paid.id } });
  check('paid: everyone in the group is on the list', after.every(p => p.status === 'in' && p.holdUntil === null), after.map(p => p.status));
  const joPays = await prisma.courseEventPayment.findMany({ where: playerPaymentsWhere(paid.id, held[1]) });
  check('the group’s payment counts as each player’s', playerPayState(joPays) === 'paid');

  // A hold that runs out.
  const lp = await submitSignup(paid.id, { players: [one('Kit', 'kit@example.com')] });
  const lpPay = await prisma.courseEventPayment.findFirstOrThrow({ where: { eventId: paid.id, status: 'open' } });
  await prisma.courseEventPlayer.updateMany({ where: { groupKey: lpPay.groupKey }, data: { holdUntil: new Date(Date.now() - 1000) } });
  const lateBeforeSweep = await chargeEventPayment(lpPay.id, lpPay.payToken, 'pm_card', 5000);
  check('a hold that ran out can’t be paid, even before it is swept', !lateBeforeSweep.ok && lateBeforeSweep.status === 409 && /hold ran out/.test(lateBeforeSweep.error), lateBeforeSweep);
  check('…and nothing was charged', charges === 1);
  check('a lapsed hold frees its spot', lp.ok && (await signupPage(paid.id))?.spotsLeft === 4);
  const swept = await lapseHolds(course.id, paid.id);
  const lpAfter = await prisma.courseEventPayment.findUniqueOrThrow({ where: { id: lpPay.id } });
  const kit = await prisma.courseEventPlayer.findFirstOrThrow({ where: { groupKey: lpPay.groupKey } });
  check('the sweep marks it lapsed and cancels its link', swept === 1 && kit.status === 'lapsed' && lpAfter.status === 'void', { swept, kit: kit.status, pay: lpAfter.status });
  const lateAfter = await chargeEventPayment(lpPay.id, lpPay.payToken, 'pm_card', 5000);
  check('the pay page still says why (not just "cancelled")', !lateAfter.ok && /hold ran out/.test(lateAfter.error), lateAfter);

  // Paid at the course instead: the group's link is closed and they go on the list.
  const pc = await submitSignup(paid.id, { players: [one('Lu', 'lu@example.com')] });
  const pcPay = await prisma.courseEventPayment.findFirstOrThrow({ where: { eventId: paid.id, status: 'open' } });
  const pcDone = await settleOpenPayment(course.id, pcPay.id, { method: 'cash' });
  const lu = await prisma.courseEventPlayer.findFirstOrThrow({ where: { groupKey: pcPay.groupKey } });
  check('paid at the course: the sign-up goes on the list', pc.ok && pcDone.ok && lu.status === 'in', { pcDone, lu: lu.status });

  // A waiting-list sign-up with pay-now makes no payment.
  const tiny = await mkEvent({ players: 1, signupPay: 'now', pricePerPlayerCents: 5000 });
  await submitSignup(tiny.id, { players: [one('Mo', 'mo@example.com')] });
  const wl = await submitSignup(tiny.id, { players: [one('Ned', 'ned@example.com')] });
  check('pay now but full: waiting list, nothing to pay', wl.ok && wl.value.status === 'waitlist' && (await prisma.courseEventPayment.count({ where: { eventId: tiny.id } })) === 1, wl);

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async err => { console.error(err); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });

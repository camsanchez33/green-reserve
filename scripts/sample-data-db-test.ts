// Cam 2026-10-28: "Fill with sample data" on a test course (src/lib/sample-data.ts).
// The rows must read like real ones everywhere: the tee sheet's counts, Analytics,
// Home. And nothing about them may ever email, text or charge anyone. Real database.
// Run: npx tsx scripts/sample-data-db-test.ts
import { prisma } from '../src/lib/prisma';
import { fillTestCourse, hasSampleData } from '../src/lib/sample-data';
import { readFileSync } from 'fs';
import { resetTestCourse } from '../src/lib/data-reset';
import { computeAnalytics } from '../src/lib/analytics';
import { operatorHome } from '../src/lib/operator-home';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { isFictionalNumber } from '../src/lib/twilio';
import { PLACEHOLDER_EMAIL_DOMAIN, sendBookingConfirmation } from '../src/lib/email';

const TAG = 'sampledatatest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  if (ids.length) {
    for (const id of ids) await resetTestCourse(id).catch(() => null);
    await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
    await prisma.course.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Sample Test', email: `${TAG}@t.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: 'Sample Test GC', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'Saratoga Springs', state: 'NY', zipCode: '12866',
    timezone: 'America/New_York', cancellationHours: 24, lateCancellationFeeCents: 1500, isTest: false,
  } });
  await prisma.teeTimeSchedule.create({ data: { courseId: course.id, daysOfWeek: [], startTime: '07:00', endTime: '16:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 4500, greenFeeWeekendCents: 5500, cartFeeCents: 2000 } });

  ok('a course that is not marked as a test is refused', !(await fillTestCourse(course.id)).ok);
  await prisma.course.update({ where: { id: course.id }, data: { isTest: true } });
  const t0 = Date.now();
  const res = await fillTestCourse(course.id);
  console.log(`      filled in ${Math.round((Date.now() - t0) / 1000)}s`, res.ok ? res.made : res);
  ok('a test course is filled', res.ok && res.made.bookings > 800 && res.made.members >= 20 && res.made.shopSales > 50, res);
  ok('…with an outing two weeks out', res.ok && res.made.event === 'Charity Scramble' && (await prisma.courseEventPlayer.count({ where: { event: { courseId: course.id } } })) === 72, res.ok ? res.made.eventNote : res);
  ok('a second fill is refused until the course is reset', !(await fillTestCourse(course.id)).ok);

  const bookings = await prisma.booking.findMany({ where: { courseId: course.id }, include: { teeTime: { select: { id: true } } } });
  ok('every golfer address is a placeholder, every phone fictional', bookings.every(b => b.golferEmail.endsWith(PLACEHOLDER_EMAIL_DOMAIN) && isFictionalNumber(b.golferPhone)));
  ok('no booking has a saved card, so no cron can charge one', bookings.every(b => !b.stripePaymentMethodId && !b.stripeCustomerId));
  const statuses = new Set(bookings.map(b => `${b.status}/${b.paymentStatus}`));
  ok('every state a real day produces is there', ['completed/paid', 'completed/paid_offline', 'cancelled/cancellation_fee_charged', 'confirmed/no_payment_method', 'confirmed/manual'].every(s => statuses.has(s)), [...statuses]);
  ok('paid means checked in, with a paid time', bookings.filter(b => b.status === 'completed').every(b => b.checkedInAt && b.paidAt && (b.paymentStatus === 'paid' || b.paymentStatus === 'paid_offline' || b.paymentStatus === 'on_account')));
  // Busy season (Cam 2026-11-01): volume, and every money table a real course fills.
  ok('busy season: thousands of bookings over six months, 150 members, 60 residents', res.ok && res.made.bookings > 8000 && res.made.members === 150 && res.made.residents === 60, res.ok ? res.made : res);
  const cid = course.id;
  const [cardRounds, cardMoves, onAcct, charges, statements, stmtMoves, dues, notes, closes, promoUsed, sw] = await Promise.all([
    prisma.booking.count({ where: { courseId: cid, status: 'completed', paymentStatus: 'paid' } }),
    prisma.moneyMove.count({ where: { courseId: cid, what: 'round', method: 'card', direction: 'in' } }),
    prisma.booking.count({ where: { courseId: cid, paymentStatus: 'on_account' } }),
    prisma.memberCharge.count({ where: { courseId: cid } }),
    prisma.memberStatement.findMany({ where: { courseId: cid }, select: { status: true, totalCents: true, lines: { select: { amountCents: true } } } }),
    prisma.moneyMove.count({ where: { courseId: cid, what: 'account' } }),
    prisma.moneyMove.count({ where: { courseId: cid, what: 'dues' } }),
    prisma.golferNote.count({ where: { courseId: cid } }),
    prisma.registerClose.count({ where: { courseId: cid } }),
    prisma.booking.count({ where: { courseId: cid, promoCodeId: { not: null } } }),
    prisma.course.findUniqueOrThrow({ where: { id: cid }, select: { hasMemberPricing: true, hasResidentPricing: true } }),
  ]);
  ok('the ledger has a card row for every card-paid round', cardRounds > 0 && cardMoves === cardRounds, { cardRounds, cardMoves });
  ok('full members put rounds on their account, one charge each', onAcct > 0 && charges === onAcct, { onAcct, charges });
  ok('finished months close into statements whose lines add up; paid ones are in the ledger', statements.length > 0 && statements.every(st => st.totalCents === st.lines.reduce((t, l) => t + l.amountCents, 0)) && stmtMoves === statements.filter(st => st.status === 'paid').length && statements.some(st => st.status === 'open'));
  ok('dues, notes, promo uses and 60 close-outs are there', dues > 0 && notes > 0 && promoUsed > 0 && closes === 60, { dues, notes, promoUsed, closes });
  ok('the member and resident price switches are on', sw.hasMemberPricing && sw.hasResidentPricing);
  const future = new Date(Date.now() + 60_000);
  const [fMoves, fStmts, fSales] = await Promise.all([
    prisma.moneyMove.count({ where: { courseId: cid, at: { gt: future } } }),
    prisma.memberStatement.count({ where: { courseId: cid, paidAt: { gt: future } } }),
    prisma.shopSale.count({ where: { courseId: cid, paidAt: { gt: future } } }),
  ]);
  ok('no money moved, statement paid or sale made in the future', fMoves + fStmts + fSales === 0, { fMoves, fStmts, fSales });
  const promoRows = await prisma.booking.findMany({ where: { courseId: cid, promoCodeId: { not: null } }, select: { golferEmail: true, promoCodeId: true, teeTime: { select: { time: true } } } });
  const codes = await prisma.promoCode.findMany({ where: { courseId: cid }, select: { id: true, fromTime: true, onePerGolfer: true } });
  const seen = new Set<string>();
  const badPromo = promoRows.filter(b => { const c = codes.find(x => x.id === b.promoCodeId)!; const k = `${c.id}|${b.golferEmail}`; const bad = (c.fromTime && b.teeTime.time < c.fromTime) || (c.onePerGolfer && seen.has(k)); seen.add(k); return bad; });
  ok('promo codes were only used where they fit (times, once per golfer)', badPromo.length === 0, badPromo.length);
  ok('totals add up (green + cart + booking fee)', bookings.every(b => b.totalAmount === b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal + b.accessFeeTotal));
  ok('counter bookings carry no booking fee', bookings.filter(b => b.source !== 'online').every(b => b.accessFeeTotal === 0));
  ok('nothing was booked before it was made, or in the future', bookings.every(b => b.createdAt.getTime() <= Date.now()));

  const tts = await prisma.teeTime.findMany({ where: { courseId: course.id, eventId: null }, select: { id: true, playersBooked: true, playersAvailable: true, status: true } });
  const live = new Map<string, number>();
  for (const b of bookings) if (b.status !== 'cancelled') live.set(b.teeTimeId, (live.get(b.teeTimeId) ?? 0) + b.players);
  ok('every tee time counts exactly its live players', tts.every(t => t.playersBooked === (live.get(t.id) ?? 0)));
  ok('…and is full exactly when it is', tts.filter(t => t.status !== 'blocked').every(t => (t.status === 'full') === (t.playersBooked >= t.playersAvailable)));
  ok('the outing holds its morning', (await prisma.teeTime.count({ where: { courseId: course.id, eventId: { not: null }, status: 'blocked' } })) > 0);

  const cash = await prisma.shopSale.findMany({ where: { courseId: course.id, roundsCents: { gt: 0 } }, include: { lines: true } });
  const offline = bookings.filter(b => b.paymentStatus === 'paid_offline');
  ok('every round paid at the counter has a register sale for it', offline.length > 0 && offline.every(b => cash.some(s => s.lines.some(l => l.bookingId === b.id))));

  const today = todayIn('America/New_York');
  const a = await computeAnalytics(course.id, { from: addDaysStr(today, -28), to: addDaysStr(today, -1) });
  ok('Analytics reads money collected and its gap', a.revenue.collectedCents > 0 && a.revenue.expectedCents >= a.revenue.collectedCents, a.revenue);
  ok('…no-shows', a.noShows.count > 0);
  const home = await operatorHome(course.id, { money: true, messages: true, setup: true });
  ok('Home shows declined cards to chase', home.declinedTotal > 0, home.declinedTotal);

  // Never emailed: a placeholder address is skipped before Resend is called.
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_never_used';
  const before = await prisma.sentMessage.count({ where: { status: 'skipped' } });
  await sendBookingConfirmation({ golferName: 'Sample', golferEmail: `x${PLACEHOLDER_EMAIL_DOMAIN}` } as never).catch(e => console.log('      send threw:', e.message));
  ok('an email to a placeholder address is skipped and logged, never sent', (await prisma.sentMessage.count({ where: { status: 'skipped' } })) === before + 1);
  ok('a 555-01xx number is fictional; a real one is not', isFictionalNumber('(518) 555-0142') && isFictionalNumber('+15185550199') && !isFictionalNumber('(518) 555-0200') && !isFictionalNumber('(518) 584-0142'));

  ok('the course knows it has sample data, so its test mark cannot come off', await hasSampleData(course.id) && readFileSync('src/app/api/admin/test-course/route.ts', 'utf8').includes('!body.isTest && prior.isTest && await hasSampleData(courseId)'));
  const lateNoCharge = bookings.filter(b => b.cancellationFeeChargedAt && !b.cancellationFeeChargeId).length;
  ok('sample late fees have no Stripe charge, and the accountant\'s export only lists traceable fees', lateNoCharge > 0 && readFileSync('src/app/api/admin/transactions/export/route.ts', 'utf8').includes("cancellationFeeChargedAt: win, cancellationFeeChargeId: { not: '' }"));

  const reset = await resetTestCourse(course.id);
  ok('Reset activity clears it all', reset.ok && !(await hasSampleData(course.id)) && (await prisma.booking.count({ where: { courseId: course.id } })) === 0 && (await prisma.courseMembership.count({ where: { courseId: course.id } })) === 0);
  ok('…and the course can be filled again', (await fillTestCourse(course.id)).ok);

  await prisma.sentMessage.deleteMany({ where: { status: 'skipped', to: { contains: PLACEHOLDER_EMAIL_DOMAIN.slice(1) } } });
  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`sample-data: ${failed} failed`); process.exit(1); }
  console.log('sample-data: all passed');
})();

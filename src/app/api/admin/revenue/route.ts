import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, requireOwner, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { computeNetPnL, periodDelta } from '@/lib/course-metrics';
import { sumExpensesForPeriodCents } from '@/lib/expenses';
import { fetchStripeFeeWindow } from '@/lib/platform-stripe';
import { friendlyStripeError } from '@/lib/stripe-errors';
import { FAILED_CHARGE_WHERE as FAILED_ANY, missedCheckInWhere as missedAny, openDisputes } from '@/lib/money-problems';
import { REAL_COURSE, ON_REAL_COURSE, ON_REAL_BOOKING } from '@/lib/real-courses';

// TEST-2: GreenReserve's money is real courses only; a test course is left out
// of every figure here. Disputes stay whole — they answer to Stripe.
const FAILED_CHARGE_WHERE = { ...FAILED_ANY, ...ON_REAL_COURSE };
const missedCheckInWhere = (today: string) => ({ ...missedAny(today), ...ON_REAL_COURSE });
import { counterFeesUncollected } from '@/lib/access-fee';
import { roundChargeCents, roundApplicationFeeCents } from '@/lib/shop';
import { feesByDay } from '@/lib/fees-by-day';
import { stripe } from '@/lib/stripe';
import { terminalTestMode } from '@/lib/card-reader';
import { csvCell } from '@/lib/ledger-view';
import { dayKey, PLATFORM_TZ } from '@/lib/admin-day';
import {
  REVENUE_PERIODS, resolveRevenuePeriod, daysBetween, platformMoveLabel, platformSigned,
  stripePaymentUrl, stripePayoutUrl, payoutArrivalRange, summarisePayouts, daySeries, type RevenuePeriodKind, type RevenuePeriod,
} from '@/lib/revenue-period';

// REVISE_QUEUE A-06 — /admin/revenue rebuilt as a real P&L. ONE period picker
// (day / week / month-to-date / custom) drives the ENTIRE page. Support+ sees
// fees, the per-course table, money-in-motion, and the problems queue; OWNER
// additionally sees the private-books lines (Stripe processing, expenses, net)
// + the reconciliation gap. Every number cents→dollars at the edge only.
//
// MP-6a — the P&L is on a COLLECTED basis now. The old headline summed
// accessFeeTotal over every confirmed booking by createdAt: accrual at booking.
// A no-show that never checks in counted as earned forever, and because Stripe
// only ever sees fees at the check-in charge, the reconciliation banner fired
// STRUCTURALLY whenever a booking was created in one window and checked in
// during another — a false-alarm generator. "Collected" here means the round
// charge succeeded (paymentStatus 'paid' with a roundPaymentIntentId), placed
// in time by paidAt (MP-6c schema half — stamped when the charge succeeds;
// older rows were backfilled from checkedInAt in the migration).

// ADMIN-REDO Revenue (Cam 2026-11-11): the page picks month / last_month / 30d /
// year (lib/revenue-period, platform clock). The older day / week / mtd / custom
// still answer for the page being replaced; 'mtd' is now 'month'.
type LegacyKind = 'day' | 'week' | 'custom';
type PeriodKind = LegacyKind | RevenuePeriodKind;
/** GreenReserve's side of the ledger shown on the page; the CSV is the whole window. */
const LEDGER_CAP = 500;
const CSV_MAX_ROWS = 20_000;
interface Win { start: Date; end: Date; }

function startOfDayUTC(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function startOfWeekUTC(d: Date) {
  const x = startOfDayUTC(d);
  const day = x.getUTCDay(); // 0=Sun..6=Sat → week starts Monday
  x.setUTCDate(x.getUTCDate() + ((day === 0 ? -6 : 1) - day));
  return x;
}
function startOfMonthUTC(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function dayStr(d: Date) { return d.toISOString().split('T')[0]; }

// Current window + the prior window UP TO THE SAME ELAPSED POINT (A0 honesty:
// an in-progress period never compares against a finished one).
function resolveWindows(kind: PeriodKind, now: Date, from: string | null, to: string | null): { current: Win; prior: Win; label: string } {
  if (kind === 'custom' && from && to) {
    const start = new Date(from + 'T00:00:00.000Z');
    const end = new Date(to + 'T23:59:59.999Z');
    const len = end.getTime() - start.getTime();
    return { current: { start, end }, prior: { start: new Date(start.getTime() - len), end: start }, label: `${from} – ${to}` };
  }
  if (kind === 'day') {
    const start = startOfDayUTC(now);
    const priorStart = new Date(start.getTime() - 86400000);
    return { current: { start, end: now }, prior: { start: priorStart, end: new Date(priorStart.getTime() + (now.getTime() - start.getTime())) }, label: 'Today' };
  }
  if (kind === 'week') {
    const start = startOfWeekUTC(now);
    const priorStart = new Date(start.getTime() - 7 * 86400000);
    return { current: { start, end: now }, prior: { start: priorStart, end: new Date(priorStart.getTime() + (now.getTime() - start.getTime())) }, label: 'This week' };
  }
  const start = startOfMonthUTC(now);
  const priorStart = startOfMonthUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  return { current: { start, end: now }, prior: { start: priorStart, end: new Date(priorStart.getTime() + (now.getTime() - start.getTime())) }, label: 'Month to date' };
}

/** A round whose charge went through — the only moment GR's fee exists. */
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' }, ...ON_REAL_COURSE } as const;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const noArea = areaGate(session, 'money');
  if (noArea) return noArea;

  const sp = req.nextUrl.searchParams;
  const todayStr = dayStr(new Date());

  // Owner sections need a 2FA-backed session, same as every other owner-only
  // surface. This one hides rather than 403s, so flag the mfa-less owner case
  // explicitly — otherwise the P&L just silently vanishes for the one person
  // it belongs to.
  const isOwner = requireOwner(session);
  const ownerMfaRequired = session.role === 'owner' && !isOwner;

  const kindParam = sp.get('period');
  const now = new Date();
  const kind: PeriodKind = kindParam === 'day' || kindParam === 'week' || kindParam === 'custom'
    ? kindParam
    : (REVENUE_PERIODS as string[]).includes(kindParam ?? '') ? (kindParam as RevenuePeriodKind) : 'month';
  let rp: RevenuePeriod;
  // What `period.from/to` says. The older page's periods are UTC days (its exports and CSVs
  // read them that way); the series below is always on platform (Eastern) days.
  let shownFrom: string, shownTo: string;
  if (kind === 'day' || kind === 'week' || kind === 'custom') {
    const w = resolveWindows(kind, now, sp.get('from'), sp.get('to'));
    const from = dayKey(w.current.start), to = dayKey(new Date(w.current.end.getTime() - 1));
    const days = Math.max(1, daysBetween(from, to) + 1);
    const priorFrom = dayKey(w.prior.start);
    rp = { kind: 'month', label: w.label, priorLabel: 'The period before', from, to, elapsedDays: days, totalDays: days,
      current: w.current, prior: w.prior, priorWhole: w.prior, priorFrom, priorDays: Math.max(1, daysBetween(priorFrom, dayKey(new Date(w.prior.end.getTime() - 1))) + 1) };
    shownFrom = dayStr(w.current.start); shownTo = dayStr(w.current.end);
  } else {
    rp = resolveRevenuePeriod(kind, now);
    shownFrom = rp.from; shownTo = rp.to;
  }
  const { current, prior } = rp;
  const label = rp.label;

  // ---- GreenReserve's money, from the ledger (LEDGER-1): Σ platform fee, in − out ----
  // TEST-2: real courses only. A row with no GreenReserve part is not ours.
  const OURS = { platformFeeCents: { gt: 0 }, course: { isTest: false } } as const;
  if (sp.get('format') === 'csv') {
    const rows = await prisma.moneyMove.findMany({
      where: { ...OURS, at: { gte: current.start, lt: current.end } },
      select: { id: true, at: true, what: true, direction: true, account: true, platformFeeCents: true, stripeId: true, bookingId: true, course: { select: { name: true } } },
      orderBy: { at: 'desc' }, take: CSV_MAX_ROWS + 1,
    });
    if (rows.length > CSV_MAX_ROWS) {
      return NextResponse.json({ error: `More than ${CSV_MAX_ROWS.toLocaleString()} rows in this period — pick a shorter one.` }, { status: 413 });
    }
    const lines = ['Date,Time (ET),Course,What,Booking,Amount,Stripe id'];
    for (const r of rows) {
      const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(r.at);
      lines.push([dayKey(r.at), time, r.course.name, platformMoveLabel(r.what, r.direction), r.bookingId ? r.bookingId.slice(0, 8).toUpperCase() : '',
        (platformSigned(r) / 100).toFixed(2), r.stripeId ?? ''].map(csvCell).join(','));
    }
    return new NextResponse(lines.join('\n') + '\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="greenreserve-revenue-${rp.from}-to-${rp.to}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const inCurrent = { gte: current.start, lt: current.end };
  const inPrior = { gte: prior.start, lt: prior.end };
  const tomorrowStr = dayStr(new Date(Date.now() + 86400000));

  const [
    collectedCurrentAgg, collectedPriorAgg,
    bookedPendingAgg,
    perCourseCollectedRaw, perCourseBookedRaw, allCourses, failedByCourseRaw,
    failedCheckIns,
    missedRaw, missedAgg,
    upcomingRaw, lateFeesRaw,
    disputesRaw,
  ] = await Promise.all([
    // Collected: fee exists, placed by the check-in that produced it.
    prisma.booking.aggregate({ where: { ...PAID, paidAt: inCurrent }, _sum: { accessFeeTotal: true }, _count: { id: true } }),
    prisma.booking.aggregate({ where: { ...PAID, paidAt: inPrior }, _sum: { accessFeeTotal: true } }),
    // Booked in the period and still ahead of us — pipeline, not revenue.
    prisma.booking.aggregate({
      where: { status: 'confirmed', paymentStatus: { not: 'paid' }, createdAt: inCurrent, teeTime: { date: { gte: todayStr } }, ...ON_REAL_COURSE },
      _sum: { accessFeeTotal: true }, _count: { id: true },
    }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...PAID, paidAt: inCurrent }, _count: { id: true }, _sum: { accessFeeTotal: true, greenFeeTotal: true, cartFeeTotal: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { status: { in: ['confirmed', 'completed'] }, createdAt: inCurrent, ...ON_REAL_COURSE }, _count: { id: true } }),
    prisma.course.findMany({ where: REAL_COURSE, select: { id: true, name: true, active: true, archivedAt: true, stripeAccountActive: true }, orderBy: { name: 'asc' } }),
    // ALL-TIME, to agree with the problems list. It was period-filtered while
    // the list below it was not, so the two disagreed on the same screen.
    prisma.booking.groupBy({ by: ['courseId'], where: FAILED_CHARGE_WHERE, _count: { id: true } }),
    prisma.booking.findMany({
      where: FAILED_CHARGE_WHERE,
      select: { id: true, golferName: true, golferEmail: true, checkInFailReason: true, totalAmount: true, accessFeeTotal: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, roundChargedCents: true, createdAt: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.booking.findMany({
      where: missedCheckInWhere(todayStr),
      select: { id: true, golferName: true, golferEmail: true, players: true, accessFeeTotal: true, totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, roundChargedCents: true, paymentStatus: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { teeTime: { date: 'desc' } }, take: 100,
    }),
    prisma.booking.aggregate({ where: missedCheckInWhere(todayStr), _sum: { accessFeeTotal: true }, _count: { id: true } }),
    prisma.booking.findMany({
      where: { status: 'confirmed', checkedInAt: null, teeTime: { date: { in: [todayStr, tomorrowStr] } }, ...ON_REAL_COURSE },
      select: { id: true, golferName: true, players: true, accessFeeTotal: true, totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, roundChargedCents: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { teeTime: { time: 'asc' } }, take: 200,
    }),
    // Charged fees only. The old list also showed "pending" for any cancelled
    // booking with a fee still stamped — but since MP-1 #6 a free cancel
    // clears the stamp, so the only rows matching that were pre-fix phantoms
    // from July that will never be charged (verified against production).
    // A fee the cron has not reached yet is a matter of minutes, not a state
    // worth a row.
    prisma.booking.findMany({
      where: { cancellationFeeChargedAt: { not: null }, ...ON_REAL_COURSE },
      select: { id: true, golferName: true, cancellationFeeTotal: true, cancellationFeeChargedAt: true, paymentStatus: true, checkedInAt: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { cancellationFeeChargedAt: 'desc' }, take: 100,
    }),
    // MP-6b: chargebacks the bank opened and Stripe has not closed.
    openDisputes(),
  ]);

  // GreenReserve's part per platform day, summed in the database (a year and the year
  // before is too many rows to read). TEST-2: real courses only — the same rule as OURS.
  const perDay = (from: Date, to: Date) => prisma.$queryRaw<{ day: string; cents: bigint }[]>`
    SELECT to_char((m."at" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TZ}, 'YYYY-MM-DD') AS day,
           SUM(CASE WHEN m."direction" = 'out' THEN -m."platformFeeCents" ELSE m."platformFeeCents" END)::bigint AS cents
    FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId"
    WHERE c."isTest" = false AND m."platformFeeCents" > 0 AND m."at" >= ${from} AND m."at" < ${to}
    GROUP BY 1`;
  const [curDays, priorDays, ledgerPriorAgg, ledgerByCourseCur, ledgerByCoursePrior, ledgerRows, liveNow] = await Promise.all([
    perDay(current.start, current.end),
    perDay(rp.priorWhole.start, rp.priorWhole.end),
    prisma.moneyMove.groupBy({ by: ['direction'], where: { ...OURS, at: { gte: prior.start, lt: prior.end } }, _sum: { platformFeeCents: true } }),
    prisma.moneyMove.groupBy({ by: ['courseId', 'direction'], where: { ...OURS, at: { gte: current.start, lt: current.end } }, _sum: { platformFeeCents: true } }),
    prisma.moneyMove.groupBy({ by: ['courseId', 'direction'], where: { ...OURS, at: { gte: prior.start, lt: prior.end } }, _sum: { platformFeeCents: true } }),
    prisma.moneyMove.findMany({
      where: { ...OURS, at: { gte: current.start, lt: current.end } },
      select: { id: true, at: true, what: true, direction: true, account: true, platformFeeCents: true, stripeId: true, bookingId: true, courseId: true, course: { select: { name: true, stripeAccountId: true } } },
      orderBy: { at: 'desc' }, take: LEDGER_CAP + 1,
    }),
    // Live courses: the Overview's own count. Only "now" can be counted — nothing records
    // when a course was switched off and on, so a past window's count is not given.
    prisma.course.count({ where: { active: true, archivedAt: null, ...REAL_COURSE } }),
  ]);
  const signedSum = (rows: { direction: string; _sum: { platformFeeCents: number | null } }[]) =>
    rows.reduce((t, r) => t + (r.direction === 'out' ? -1 : 1) * (r._sum.platformFeeCents ?? 0), 0);
  const revenueSeries = {
    current: daySeries(curDays.map(d => ({ day: d.day, cents: Number(d.cents) })), rp.from, rp.elapsedDays),
    prior: daySeries(priorDays.map(d => ({ day: d.day, cents: Number(d.cents) })), rp.priorFrom, rp.priorDays),
  };
  const revenueCents = curDays.reduce((t, d) => t + Number(d.cents), 0);
  const revenuePriorCents = signedSum(ledgerPriorAgg);
  const byCourseLedger = (rows: { courseId: string; direction: string; _sum: { platformFeeCents: number | null } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.courseId, (m.get(r.courseId) ?? 0) + (r.direction === 'out' ? -1 : 1) * (r._sum.platformFeeCents ?? 0));
    return m;
  };
  const revByCourse = byCourseLedger(ledgerByCourseCur);
  const revPriorByCourse = byCourseLedger(ledgerByCoursePrior);
  const testMode = terminalTestMode();
  const ledger = {
    rows: ledgerRows.slice(0, LEDGER_CAP).map(r => ({
      id: r.id, at: r.at.toISOString(),
      bookingId: r.bookingId, bookingRef: r.bookingId ? r.bookingId.slice(0, 8).toUpperCase() : null,
      courseId: r.courseId, courseName: r.course.name,
      what: platformMoveLabel(r.what, r.direction),
      amountCents: platformSigned(r),
      stripeUrl: stripePaymentUrl(r.stripeId, r.account, r.course.stripeAccountId || null, testMode),
    })),
    truncated: ledgerRows.length > LEDGER_CAP,
  };
  const endsNow = now.getTime() - current.end.getTime() < 60_000;
  const liveCourses = { count: endsNow ? liveNow : null, priorCount: null as number | null };

  const failedCountByCourse = new Map(failedByCourseRaw.map(r => [r.courseId, r._count.id]));
  const collectedByCourse = new Map(perCourseCollectedRaw.map(r => [r.courseId, r]));
  const bookedByCourse = new Map(perCourseBookedRaw.map(r => [r.courseId, r._count.id]));

  // Per-course table — every course, joined to its period aggregates. Two
  // bases, each named: "booked" is rounds made in the period, "collected" is
  // fees GR actually received in it. Failed is all-time.
  const byCourse = allCourses.map(c => {
    const agg = collectedByCourse.get(c.id);
    return {
      courseId: c.id, name: c.name,
      active: c.active, archived: !!c.archivedAt, stripeActive: c.stripeAccountActive,
      booked: bookedByCourse.get(c.id) ?? 0,
      collectedRounds: agg?._count.id ?? 0,
      serviceFees: (agg?._sum.accessFeeTotal ?? 0) / 100,
      greenFeeVolume: ((agg?._sum.greenFeeTotal ?? 0) + (agg?._sum.cartFeeTotal ?? 0)) / 100,
      failedCharges: failedCountByCourse.get(c.id) ?? 0,
      counterRounds: 0, counterFeesUncollected: 0,
      revenueCents: revByCourse.get(c.id) ?? 0,
      priorRevenueCents: revPriorByCourse.get(c.id) ?? 0,
    };
  });

  const collectedCents = collectedCurrentAgg._sum.accessFeeTotal ?? 0;
  const collectedPriorCents = collectedPriorAgg._sum.accessFeeTotal ?? 0;

  // FB-3: booking fees charged on their own (no-shows, rounds paid at the
  // counter) on the PLATFORM account. Not application fees, so they stay out
  // of the Stripe reconciliation below; they do count toward net.
  const [sepCharged, sepRefunded] = await Promise.all([
    prisma.paymentEvent.aggregate({ where: { kind: 'fee_charged', createdAt: inCurrent, ...ON_REAL_BOOKING }, _sum: { amountCents: true }, _count: { id: true } }),
    prisma.paymentEvent.aggregate({ where: { kind: 'fee_refunded', createdAt: inCurrent, ...ON_REAL_BOOKING }, _sum: { amountCents: true } }),
  ]);
  const separateFeesCents = (sepCharged._sum.amountCents ?? 0) - (sepRefunded._sum.amountCents ?? 0);

  // PAY-2 (Cam 2026-10-06: "if a customer pays cash they log it and it just
  // goes to analytics and we are just going to have to eat it"): an online
  // booking paid at the counter (cash or the course's own terminal) carries no
  // GR fee unless a saved card let us charge it separately. Not a problem to
  // chase — a cost to watch, per course. Counter/phone bookings never carry a
  // fee (accessFeeTotal 0), so they are not counted.
  const [counter, counterAll, paidRows, closedDisputesRaw] = await Promise.all([
    counterFeesUncollected(inCurrent),
    // ADMIN-C Money → Not collected: the all-time figure beside the period's.
    counterFeesUncollected({ gte: new Date(0), lt: new Date() }),
    // ADMIN-C Money → Overview chart: the headline's own rows (round fees on
    // paid rounds, by paidAt), this period and the prior one to the same point.
    prisma.booking.findMany({ where: { ...PAID, paidAt: { gte: prior.start, lt: current.end } }, select: { paidAt: true, accessFeeTotal: true } }),
    // Money → Disputes: the last 20 that closed, with how they ended (the webhook writes "Dispute won" / "Dispute lost").
    prisma.paymentEvent.findMany({
      where: { kind: 'dispute_closed' },
      select: { id: true, bookingId: true, amountCents: true, detail: true, createdAt: true,
        booking: { select: { golferName: true, course: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
  ]);
  const counterUncollectedByCourse = counter.byCourse;
  const counterUncollectedCents = counter.cents;
  const counterUncollectedRounds = counter.rounds;
  for (const row of byCourse) {
    const c = counterUncollectedByCourse.get(row.courseId);
    if (c) { row.counterRounds = c.rounds; row.counterFeesUncollected = c.cents / 100; }
  }

  // Fees by day for the chart (lib/fees-by-day.ts): the headline's own rows.
  const daily = feesByDay(paidRows.map(r => ({ paidAt: r.paidAt, cents: r.accessFeeTotal })), current, prior);

  // ---- Problems (ALL-TIME): money that should exist and does not ----
  const failedCheckIn = failedCheckIns.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, golferEmail: b.golferEmail,
    reason: friendlyStripeError(b.checkInFailReason),
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    // POS-1a: what the round's charge comes to — the round plus any shop items (shown, never charged here).
    amount: roundChargeCents(b) / 100, ourTake: roundApplicationFeeCents(b) / 100,
  }));
  const missedCheckIn = missedRaw.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, golferEmail: b.golferEmail, players: b.players,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    amount: roundChargeCents(b) / 100, ourTake: roundApplicationFeeCents(b) / 100,
    // The cutoff cron already took the course's no-show fee — so this one is
    // a no-show the course was paid for, not a forgotten check-in.
    noShowFeeCharged: b.paymentStatus === 'cancellation_fee_charged',
  }));

  // ---- Money in motion (forward ledger — expected, not booked) ----
  const upcomingCheckIns = upcomingRaw.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, players: b.players,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    ourTake: roundApplicationFeeCents(b) / 100, total: roundChargeCents(b) / 100,
  }));
  // Late-cancellation fees are 100% COURSE revenue — the cron charges them
  // with applicationFeeCents: 0 — and a charged fee is refunded in full if the
  // golfer turns up and checks in. Two honest states, neither of them GR money.
  const lateCancelFees = lateFeesRaw.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, fee: b.cancellationFeeTotal / 100,
    status: (b.paymentStatus === 'paid' && b.checkedInAt ? 'refunded' : 'charged') as 'charged' | 'refunded',
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
  }));

  const base = {
    period: { kind, label, from: shownFrom, to: shownTo, priorLabel: rp.priorLabel, elapsedDays: rp.elapsedDays, totalDays: rp.totalDays },
    revenue: { cents: revenueCents, priorCents: revenuePriorCents },
    revenueSeries,
    liveCourses,
    ledger,
    isOwner,
    ownerMfaRequired,
    pnl: {
      feesCollected: collectedCents / 100,
      collectedRounds: collectedCurrentAgg._count.id,
      feesCollectedDelta: periodDelta(collectedCents, collectedPriorCents),
      bookedPending: (bookedPendingAgg._sum.accessFeeTotal ?? 0) / 100,
      bookedPendingRounds: bookedPendingAgg._count.id,
      separateFees: separateFeesCents / 100,
      separateFeeCharges: sepCharged._count.id,
      counterFeesUncollected: counterUncollectedCents / 100,
      counterRoundsUncollected: counterUncollectedRounds,
      counterFeesUncollectedAllTime: counterAll.cents / 100,
      counterRoundsUncollectedAllTime: counterAll.rounds,
    },
    daily: { current: daily.current.map(c => c / 100), prior: daily.prior.map(c => c / 100) },
    byCourse,
    moneyInMotion: {
      upcomingCheckIns,
      lateCancelFees,
      todayStr, tomorrowStr,
    },
    problems: {
      failedCheckIn,
      missedCheckIn,
      missedTotal: missedAgg._count.id,
      missedFees: (missedAgg._sum.accessFeeTotal ?? 0) / 100,
      disputes: disputesRaw.map(d => ({
        eventId: d.id, bookingId: d.bookingId, courseId: d.booking.course.id, courseName: d.booking.course.name,
        golferName: d.booking.golferName, golferEmail: d.booking.golferEmail,
        teeDate: d.booking.teeTime.date, teeTime: d.booking.teeTime.time,
        amount: d.amountCents / 100, detail: d.detail, openedAt: d.createdAt,
      })),
      closedDisputes: closedDisputesRaw.map(d => ({
        eventId: d.id, bookingId: d.bookingId, courseId: d.booking.course.id, courseName: d.booking.course.name,
        golferName: d.booking.golferName, amount: d.amountCents / 100, closedAt: d.createdAt,
        outcome: d.detail.replace(/^Dispute\s+/i, ''),
      })),
    },
  };

  if (!isOwner) return NextResponse.json(base);

  // ---- Owner-only: the private-books P&L lines + reconciliation ----
  const expenses = await prisma.expense.findMany();
  const expensesCents = sumExpensesForPeriodCents(expenses, current.start, current.end);
  const expensesPriorCents = sumExpensesForPeriodCents(expenses, prior.start, prior.end);

  let stripeProcessingCents = 0;
  let stripeGrossCents = 0;
  let stripeUnavailable = false;
  try {
    const feeWin = await fetchStripeFeeWindow(Math.floor(current.start.getTime() / 1000), Math.floor(current.end.getTime() / 1000));
    stripeProcessingCents = feeWin.processingCostCents;
    stripeGrossCents = feeWin.grossCents;
  } catch (e) {
    console.error('Revenue P&L Stripe fetch failed:', e);
    stripeUnavailable = true;
  }

  const pnlCurrent = computeNetPnL({ feesEarnedCents: collectedCents + separateFeesCents, stripeProcessingCents, expensesCents });
  // The prior delta compares NET excluding Stripe (collected − expenses) so a
  // missing Stripe fetch never fabricates a prior processing number. MP-6a:
  // it is an absolute dollar move now — a percentage across a sign flip
  // ("−340% vs prior") is not information.
  const priorNetExStripe = collectedPriorCents - expensesPriorCents;
  const currentNetExStripe = collectedCents - expensesCents;

  // Reconciliation: fees we collected vs what Stripe shows as application-fee
  // revenue in the same window — same event, same clock, so a gap now means
  // money is actually missing. Tri-state: unreachable Stripe is "unknown",
  // never a pass.
  const gapCents = collectedCents - stripeGrossCents;
  const reconciles: boolean | null = stripeUnavailable ? null : Math.abs(gapCents) < 100;

  // ---- Owner-only: payouts to the courses' banks in the window, read from each
  // course's own Stripe account the way /api/admin/course-payouts does (same courses:
  // not archived, with an account). Kept whole (test courses included) like that route —
  // it answers to Stripe (TEST-2). Placed by arrival DAY (lib/revenue-period). Only for the
  // Revenue page's four periods — the older page never reads it. One course Stripe can't
  // answer for, or one with more payouts than we read, makes the answer "unavailable":
  // a partial total would read as a real one.
  const payoutsWanted = kind !== 'day' && kind !== 'week' && kind !== 'custom';
  let payoutsUnavailable = false;
  const payoutRows: { courseId: string; name: string; kind: 'failed' | 'reversed' | 'canceled'; amountCents: number; at: string; reason: string; stripeUrl: string | null }[] = [];
  let paidOutCents = 0;
  const paidCourses = new Set<string>();
  const PAYOUT_READ_CAP = 1000;
  if (payoutsWanted) {
    const payoutCourses = await prisma.course.findMany({ where: { archivedAt: null, stripeAccountId: { not: '' } }, select: { id: true, name: true, stripeAccountId: true } });
    const range = payoutArrivalRange(rp.from, rp.to);
    await Promise.all(payoutCourses.map(async c => {
      try {
        const list = await stripe.payouts.list({ limit: 100, arrival_date: range }, { stripeAccount: c.stripeAccountId }).autoPagingToArray({ limit: PAYOUT_READ_CAP + 1 });
        if (list.length > PAYOUT_READ_CAP) { payoutsUnavailable = true; return; }
        const sum = summarisePayouts(list);
        if (sum.paidCount > 0) { paidOutCents += sum.paidCents; paidCourses.add(c.id); }
        for (const p of sum.problems) {
          payoutRows.push({ courseId: c.id, name: c.name, kind: p.kind, amountCents: p.amountCents, at: p.date, reason: p.reason, stripeUrl: stripePayoutUrl(p.payoutId, c.stripeAccountId, testMode) });
        }
      } catch (e) {
        console.error('[revenue] Stripe payouts read failed for', c.id, e);
        payoutsUnavailable = true;
      }
    }));
    payoutRows.sort((a, b) => b.at.localeCompare(a.at));
  }

  return NextResponse.json({
    ...base,
    ...(payoutsWanted ? {
      coursePayoutProblems: { rows: payoutRows, unavailable: payoutsUnavailable },
      payouts: { toCourses: payoutsUnavailable ? null : { cents: paidOutCents, courses: paidCourses.size }, unavailable: payoutsUnavailable },
    } : {}),
    pnl: {
      ...base.pnl,
      stripeProcessing: pnlCurrent.stripeProcessing,
      stripeUnavailable,
      expenses: pnlCurrent.expenses,
      expensesDelta: periodDelta(expensesCents, expensesPriorCents),
      net: pnlCurrent.net,
      netDeltaAbs: (currentNetExStripe - priorNetExStripe) / 100,
    },
    reconciliation: {
      expected: collectedCents / 100,
      actual: stripeGrossCents / 100,
      gap: gapCents / 100,
      reconciles,
      unavailable: stripeUnavailable,
    },
  });
}

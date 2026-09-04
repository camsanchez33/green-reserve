import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, requireOwner, SUPPORT_PLUS } from '@/lib/admin-session';
import { computeNetPnL, periodDelta } from '@/lib/course-metrics';
import { sumExpensesForPeriodCents } from '@/lib/expenses';
import { fetchStripeFeeWindow } from '@/lib/platform-stripe';
import { friendlyStripeError } from '@/lib/stripe-errors';
import { FAILED_CHARGE_WHERE, missedCheckInWhere } from '@/lib/money-problems';

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
// in time by checkedInAt. There is no paidAt column; the only path where the
// two differ is a retry-charge followed by a later check-in, by hours. A real
// paidAt is a schema slice.

type PeriodKind = 'day' | 'week' | 'mtd' | 'custom';
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
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' } } as const;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const todayStr = dayStr(new Date());

  // MP-6a: the sidebar's red badge. Cheap counts only, no period, no owner
  // lines — the same two ALL-TIME queries the Problems block is built from,
  // so the badge and the block can never disagree.
  if (sp.get('problemsCount') === '1') {
    const [failed, missed] = await Promise.all([
      prisma.booking.count({ where: FAILED_CHARGE_WHERE }),
      prisma.booking.count({ where: missedCheckInWhere(todayStr) }),
    ]);
    return NextResponse.json({ failed, missed });
  }

  // Owner sections need a 2FA-backed session, same as every other owner-only
  // surface. This one hides rather than 403s, so flag the mfa-less owner case
  // explicitly — otherwise the P&L just silently vanishes for the one person
  // it belongs to.
  const isOwner = requireOwner(session);
  const ownerMfaRequired = session.role === 'owner' && !isOwner;

  const kindParam = sp.get('period');
  const kind: PeriodKind = kindParam === 'day' || kindParam === 'week' || kindParam === 'custom' ? kindParam : 'mtd';
  const { current, prior, label } = resolveWindows(kind, new Date(), sp.get('from'), sp.get('to'));

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
  ] = await Promise.all([
    // Collected: fee exists, placed by the check-in that produced it.
    prisma.booking.aggregate({ where: { ...PAID, checkedInAt: inCurrent }, _sum: { accessFeeTotal: true }, _count: { id: true } }),
    prisma.booking.aggregate({ where: { ...PAID, checkedInAt: inPrior }, _sum: { accessFeeTotal: true } }),
    // Booked in the period and still ahead of us — pipeline, not revenue.
    prisma.booking.aggregate({
      where: { status: 'confirmed', paymentStatus: { not: 'paid' }, createdAt: inCurrent, teeTime: { date: { gte: todayStr } } },
      _sum: { accessFeeTotal: true }, _count: { id: true },
    }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...PAID, checkedInAt: inCurrent }, _count: { id: true }, _sum: { accessFeeTotal: true, greenFeeTotal: true, cartFeeTotal: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { status: { in: ['confirmed', 'completed'] }, createdAt: inCurrent }, _count: { id: true } }),
    prisma.course.findMany({ select: { id: true, name: true, active: true, archivedAt: true, stripeAccountActive: true }, orderBy: { name: 'asc' } }),
    // ALL-TIME, to agree with the problems list. It was period-filtered while
    // the list below it was not, so the two disagreed on the same screen.
    prisma.booking.groupBy({ by: ['courseId'], where: FAILED_CHARGE_WHERE, _count: { id: true } }),
    prisma.booking.findMany({
      where: FAILED_CHARGE_WHERE,
      select: { id: true, golferName: true, golferEmail: true, checkInFailReason: true, totalAmount: true, accessFeeTotal: true, createdAt: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.booking.findMany({
      where: missedCheckInWhere(todayStr),
      select: { id: true, golferName: true, golferEmail: true, players: true, accessFeeTotal: true, totalAmount: true, paymentStatus: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { teeTime: { date: 'desc' } }, take: 100,
    }),
    prisma.booking.aggregate({ where: missedCheckInWhere(todayStr), _sum: { accessFeeTotal: true }, _count: { id: true } }),
    prisma.booking.findMany({
      where: { status: 'confirmed', checkedInAt: null, teeTime: { date: { in: [todayStr, tomorrowStr] } } },
      select: { id: true, golferName: true, players: true, accessFeeTotal: true, totalAmount: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { teeTime: { time: 'asc' } }, take: 200,
    }),
    // Charged fees only. The old list also showed "pending" for any cancelled
    // booking with a fee still stamped — but since MP-1 #6 a free cancel
    // clears the stamp, so the only rows matching that were pre-fix phantoms
    // from July that will never be charged (verified against production).
    // A fee the cron has not reached yet is a matter of minutes, not a state
    // worth a row.
    prisma.booking.findMany({
      where: { cancellationFeeChargedAt: { not: null } },
      select: { id: true, golferName: true, cancellationFeeTotal: true, cancellationFeeChargedAt: true, paymentStatus: true, checkedInAt: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { cancellationFeeChargedAt: 'desc' }, take: 100,
    }),
  ]);

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
    };
  });

  const collectedCents = collectedCurrentAgg._sum.accessFeeTotal ?? 0;
  const collectedPriorCents = collectedPriorAgg._sum.accessFeeTotal ?? 0;

  // ---- Problems (ALL-TIME): money that should exist and does not ----
  const failedCheckIn = failedCheckIns.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, golferEmail: b.golferEmail,
    reason: friendlyStripeError(b.checkInFailReason),
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    amount: b.totalAmount / 100, ourTake: b.accessFeeTotal / 100,
  }));
  const missedCheckIn = missedRaw.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, golferEmail: b.golferEmail, players: b.players,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    amount: b.totalAmount / 100, ourTake: b.accessFeeTotal / 100,
    // The cutoff cron already took the course's no-show fee — so this one is
    // a no-show the course was paid for, not a forgotten check-in.
    noShowFeeCharged: b.paymentStatus === 'cancellation_fee_charged',
  }));

  // ---- Money in motion (forward ledger — expected, not booked) ----
  const upcomingCheckIns = upcomingRaw.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, players: b.players,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    ourTake: b.accessFeeTotal / 100, total: b.totalAmount / 100,
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
    period: { kind, label, from: dayStr(current.start), to: dayStr(current.end) },
    isOwner,
    ownerMfaRequired,
    pnl: {
      feesCollected: collectedCents / 100,
      collectedRounds: collectedCurrentAgg._count.id,
      feesCollectedDelta: periodDelta(collectedCents, collectedPriorCents),
      bookedPending: (bookedPendingAgg._sum.accessFeeTotal ?? 0) / 100,
      bookedPendingRounds: bookedPendingAgg._count.id,
    },
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

  const pnlCurrent = computeNetPnL({ feesEarnedCents: collectedCents, stripeProcessingCents, expensesCents });
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

  return NextResponse.json({
    ...base,
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

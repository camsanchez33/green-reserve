import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, OWNER_ONLY } from '@/lib/admin-session';
import { COMPLETED_BOOKING_STATUSES, computeNetPnL, periodDelta } from '@/lib/course-metrics';
import { sumExpensesForPeriodCents } from '@/lib/expenses';
import { fetchStripeFeeWindow } from '@/lib/platform-stripe';
import { friendlyStripeError } from '@/lib/stripe-errors';

// REVISE_QUEUE A-06 — /admin/revenue rebuilt as a real P&L. ONE period picker
// (day / week / month-to-date / custom) drives the ENTIRE page. Support+ sees
// fees earned, the per-course table, money-in-motion, and failed charges;
// OWNER additionally sees the private-books lines (Stripe processing, expenses,
// net) + the reconciliation gap. Every number cents→dollars at the edge only.

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

const COMPLETED = COMPLETED_BOOKING_STATUSES;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const isOwner = requireRole(session, OWNER_ONLY);

  const sp = req.nextUrl.searchParams;
  const kindParam = sp.get('period');
  const kind: PeriodKind = kindParam === 'day' || kindParam === 'week' || kindParam === 'custom' ? kindParam : 'mtd';
  const { current, prior, label } = resolveWindows(kind, new Date(), sp.get('from'), sp.get('to'));

  const inCurrent = { gte: current.start, lt: current.end };
  const inPrior = { gte: prior.start, lt: prior.end };
  const todayStr = dayStr(new Date());
  const tomorrowStr = dayStr(new Date(Date.now() + 86400000));

  const [
    feesCurrentAgg, feesPriorAgg,
    perCourseRaw, allCourses, failedByCourseRaw,
    failedCheckIns,
    upcomingRaw, pendingFeesRaw,
  ] = await Promise.all([
    prisma.booking.aggregate({ where: { status: { in: COMPLETED }, createdAt: inCurrent }, _sum: { accessFeeTotal: true }, _count: { id: true } }),
    prisma.booking.aggregate({ where: { status: { in: COMPLETED }, createdAt: inPrior }, _sum: { accessFeeTotal: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { status: { in: COMPLETED }, createdAt: inCurrent }, _count: { id: true }, _sum: { accessFeeTotal: true, greenFeeTotal: true, cartFeeTotal: true } }),
    prisma.course.findMany({ select: { id: true, name: true, active: true, archivedAt: true, stripeAccountActive: true }, orderBy: { name: 'asc' } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { checkInFailReason: { not: '' }, checkedInAt: null, createdAt: inCurrent }, _count: { id: true } }),
    prisma.booking.findMany({
      where: { checkInFailReason: { not: '' }, checkedInAt: null },
      select: { id: true, golferName: true, golferEmail: true, checkInFailReason: true, totalAmount: true, accessFeeTotal: true, createdAt: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.booking.findMany({
      where: { status: 'confirmed', checkedInAt: null, teeTime: { date: { in: [todayStr, tomorrowStr] } } },
      select: { id: true, golferName: true, players: true, accessFeeTotal: true, totalAmount: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { teeTime: { time: 'asc' } }, take: 200,
    }),
    prisma.booking.findMany({
      where: { cancellationFeeTotal: { gt: 0 } },
      select: { id: true, golferName: true, cancellationFeeTotal: true, cancellationFeeChargedAt: true, cancelledAt: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } },
      orderBy: { cancelledAt: 'desc' }, take: 100,
    }),
  ]);

  const courseById = new Map(allCourses.map(c => [c.id, c]));
  const failedCountByCourse = new Map(failedByCourseRaw.map(r => [r.courseId, r._count.id]));
  const perCourseByCourse = new Map(perCourseRaw.map(r => [r.courseId, r]));

  // Per-course table (metrics brain shape) — every course, joined to its period aggregates.
  const byCourse = allCourses.map(c => {
    const agg = perCourseByCourse.get(c.id);
    return {
      courseId: c.id, name: c.name,
      active: c.active, archived: !!c.archivedAt, stripeActive: c.stripeAccountActive,
      bookings: agg?._count.id ?? 0,
      serviceFees: (agg?._sum.accessFeeTotal ?? 0) / 100,
      greenFeeVolume: ((agg?._sum.greenFeeTotal ?? 0) + (agg?._sum.cartFeeTotal ?? 0)) / 100,
      failedCharges: failedCountByCourse.get(c.id) ?? 0,
    };
  });

  const feesEarnedCents = feesCurrentAgg._sum.accessFeeTotal ?? 0;
  const feesPriorCents = feesPriorAgg._sum.accessFeeTotal ?? 0;

  // ---- Problems: failed charges, friendly-mapped, each linkable ----
  const failedCheckIn = failedCheckIns.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, golferEmail: b.golferEmail,
    reason: friendlyStripeError(b.checkInFailReason),
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    amount: b.totalAmount / 100, ourTake: b.accessFeeTotal / 100,
  }));

  // ---- Money in motion (forward ledger — expected, not booked) ----
  const upcomingCheckIns = upcomingRaw.map(b => ({
    bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
    golferName: b.golferName, players: b.players,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    ourTake: b.accessFeeTotal / 100, total: b.totalAmount / 100,
  }));
  const pendingLateCancelFees = pendingFeesRaw
    .filter(b => b.cancellationFeeChargedAt || b.cancelledAt) // only real cancels with a fee in play
    .map(b => ({
      bookingId: b.id, courseId: b.course.id, courseName: b.course.name,
      golferName: b.golferName, fee: b.cancellationFeeTotal / 100,
      status: b.cancellationFeeChargedAt ? 'charged' as const : 'pending' as const,
      teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    }));

  const base = {
    period: { kind, label, from: dayStr(current.start), to: dayStr(current.end) },
    isOwner,
    pnl: {
      feesEarned: feesEarnedCents / 100,
      feesEarnedDelta: periodDelta(feesEarnedCents, feesPriorCents),
    },
    byCourse,
    moneyInMotion: {
      upcomingCheckIns,
      pendingLateCancelFees,
      todayStr, tomorrowStr,
    },
    problems: { failedCheckIn },
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

  const pnlCurrent = computeNetPnL({ feesEarnedCents, stripeProcessingCents, expensesCents });
  // Prior net reuses current Stripe rate is not honest; for the prior delta we
  // compare NET excluding Stripe (fees − expenses) so a missing Stripe fetch
  // never fabricates a prior processing number. Stripe processing shows its
  // own current figure without a fabricated prior delta.
  const priorNetExStripe = feesPriorCents - expensesPriorCents;
  const currentNetExStripe = feesEarnedCents - expensesCents;

  // Reconciliation gap: what we expected to collect (fees earned) vs what
  // Stripe actually shows as application-fee revenue. The failed charges in
  // this period are the actionable composition of any shortfall.
  const gapCents = feesEarnedCents - stripeGrossCents;
  const reconciles = stripeUnavailable ? true : Math.abs(gapCents) < 100;

  return NextResponse.json({
    ...base,
    pnl: {
      ...base.pnl,
      stripeProcessing: pnlCurrent.stripeProcessing,
      stripeUnavailable,
      expenses: pnlCurrent.expenses,
      expensesDelta: periodDelta(expensesCents, expensesPriorCents),
      net: pnlCurrent.net,
      netDelta: periodDelta(currentNetExStripe, priorNetExStripe),
    },
    reconciliation: {
      expected: feesEarnedCents / 100,
      actual: stripeGrossCents / 100,
      gap: gapCents / 100,
      reconciles,
      unavailable: stripeUnavailable,
      // The failed charges above are the clickable homework behind a gap.
      composingBookingIds: failedCheckIn.map(f => f.bookingId),
    },
  });
}

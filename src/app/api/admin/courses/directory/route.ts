import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, VIEWER_PLUS, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { hasArea } from '@/lib/admin-areas';
import { COMPLETED_BOOKING_STATUSES } from '@/lib/course-metrics';
import { FAILED_CHARGE_WHERE } from '@/lib/money-problems';
import { courseMoney } from '@/lib/admin-course-page';
import { setupProgress } from '@/lib/course-setup';
import { getApprovalState } from '@/lib/approval-state';
import { agreementDueByCourse } from '@/lib/agreement-required';
import { startOfPlatformMonth, startOfPlatformMonthsAgo } from '@/lib/admin-day';
import { courseStatus, RISK_DAYS } from './status';

// ADMIN-REDO page 2 — Golf Courses (Cam approved the mockup 2026-11-12). READ-ONLY.
// The directory (?archived=1 for archived courses) and one course's profile (?id=).
// Everything is counted here, never estimated. Test courses are listed and marked
// (isTest) — they never reach a platform number, and this page has none.
//
// Who sees what (AW-11): the route needs Courses (viewer+, as /api/admin/courses).
//   money    our fees, fees missed, failed charges, the Payments tab  support+ with Money, else null
//   contact  emails, phones, the agreement signer, admin notes        support+ (the course-detail route's rule), else null
//
// Status: courseStatus() in ./status.ts (pinned by scripts/admin-courses-status-test.ts). Bookings are booking rows made
// (confirmed or completed) this platform month, against last month to the same point.

// paidWindow's rule (admin-today.ts): a round's fee counts when the round is paid by card.
// The isolation test checks these per-course sums against paidWindow(…, courseId).
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' } } as const;
const MADE = { status: { in: COMPLETED_BOOKING_STATUSES } };

/** Our service fees per course in a window — paidWindow's rule, grouped. */
async function feesByCourse(ids: string[], from: Date, to: Date): Promise<Map<string, number>> {
  const range = { gte: from, lt: to };
  const [rounds, events] = await Promise.all([
    prisma.booking.groupBy({ by: ['courseId'], where: { ...PAID, courseId: { in: ids }, paidAt: range }, _sum: { accessFeeTotal: true } }),
    prisma.paymentEvent.findMany({ where: { kind: { in: ['fee_charged', 'fee_refunded'] }, createdAt: range, booking: { courseId: { in: ids } } }, select: { kind: true, amountCents: true, booking: { select: { courseId: true } } } }),
  ]);
  const out = new Map<string, number>();
  for (const r of rounds) out.set(r.courseId, r._sum.accessFeeTotal ?? 0);
  for (const e of events) {
    const id = e.booking?.courseId;
    if (id) out.set(id, (out.get(id) ?? 0) + (e.kind === 'fee_charged' ? e.amountCents : -e.amountCents));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'courses');
  if (noArea) return noArea;
  if (!requireRole(session, VIEWER_PLUS)) return NextResponse.json({ error: "Your login can't open courses." }, { status: 403 });
  const support = requireRole(session, SUPPORT_PLUS);
  const seesMoney = support && hasArea(session, 'money');
  const seesContact = support;

  const now = new Date();
  const start = startOfPlatformMonth(now);
  const priorStart = startOfPlatformMonthsAgo(now, 1);
  const priorEnd = new Date(Math.min(priorStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const c = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, city: true, state: true, address: true, zipCode: true, phone: true, website: true, logoUrl: true,
        isTest: true, archivedAt: true, active: true, liveStatus: true, firstWentLiveAt: true, welcomeEmailSentAt: true, createdAt: true,
        stripeAccountActive: true, stripeAccountId: true, adminNotes: true, pageDecision: true,
        operator: { select: { name: true, email: true, phone: true, emailVerified: true, lastLoginAt: true } },
      },
    });
    if (!c) return NextResponse.json({ error: 'That course no longer exists — go back to the list.' }, { status: 404 });
    const [cur, prior, last, approval, agreement, due, m, failedCount] = await Promise.all([
      prisma.booking.count({ where: { courseId: id, ...MADE, createdAt: { gte: start, lt: now } } }),
      prisma.booking.count({ where: { courseId: id, ...MADE, createdAt: { gte: priorStart, lt: priorEnd } } }),
      prisma.booking.aggregate({ where: { courseId: id, ...MADE }, _max: { createdAt: true } }),
      getApprovalState(id),
      prisma.agreementAcceptance.findFirst({ where: { courseId: id, document: 'operator_agreement' }, orderBy: { acceptedAt: 'desc' }, select: { version: true, acceptedAt: true, signerName: true, signerTitle: true, signerEmail: true } }),
      agreementDueByCourse([id]),
      // The full profile's Money tab, unchanged: fees by paidWindow, fees missed, failed charges at roundChargeCents (POS-1a).
      seesMoney ? courseMoney(id, now) : null,
      seesMoney ? prisma.booking.count({ where: { courseId: id, ...FAILED_CHARGE_WHERE } }) : null,
    ]);
    const lastAt = last._max.createdAt;
    const setup = setupProgress({ ...c, operator: c.operator, approvalStatus: approval.status });
    return NextResponse.json({
      id: c.id, name: c.name, slug: c.slug, town: [c.city, c.state].filter(Boolean).join(', '), isTest: c.isTest, logoUrl: c.logoUrl || null,
      status: courseStatus(c, lastAt, now),
      bookings: { cur, prior }, lastBookingAt: lastAt?.toISOString() ?? null, joinedAt: c.createdAt.toISOString(),
      liveSince: (c.firstWentLiveAt ?? c.welcomeEmailSentAt)?.toISOString() ?? null,
      setup: { done: setup.done, total: setup.total, steps: setup.steps.map(s => ({ label: s.label, done: s.done })) },
      agreement: agreement ? { version: agreement.version, signedAt: agreement.acceptedAt.toISOString(), signer: seesContact ? [agreement.signerName, agreement.signerTitle].filter(Boolean).join(', ') : null, signerEmail: seesContact ? agreement.signerEmail : null } : null,
      agreementDue: due.get(id) ?? null,
      contact: seesContact ? {
        operatorName: c.operator?.name ?? null, operatorEmail: c.operator?.email ?? null, operatorPhone: c.operator?.phone || null,
        emailVerified: c.operator?.emailVerified ?? false, lastLoginAt: c.operator?.lastLoginAt?.toISOString() ?? null,
        coursePhone: c.phone || null, website: c.website || null,
        address: [c.address, [c.city, c.state].filter(Boolean).join(', '), c.zipCode].filter(Boolean).join(' · ') || null,
      } : null,
      notes: seesContact ? c.adminNotes : null,
      money: m ? {
        stripeConnected: !!c.stripeAccountId, stripeActive: c.stripeAccountActive,
        feesCents: Math.round(m.feesThisMonth * 100), feesPriorCents: Math.round(m.feesSamePointLastMonth * 100),
        missedCents: Math.round(m.counterThisMonth.fees * 100), missedRounds: m.counterThisMonth.rounds,
        failedCount: failedCount ?? 0,
        failed: m.failedCharges.map(f => ({ id: f.bookingId, golferName: f.golferName, cents: Math.round(f.amount * 100), teeDate: f.teeDate, reason: f.reason })),
      } : null,
    });
  }

  const archived = req.nextUrl.searchParams.get('archived') === '1';
  const courses = await prisma.course.findMany({
    where: archived ? { archivedAt: { not: null } } : { archivedAt: null },
    select: { id: true, name: true, slug: true, city: true, state: true, isTest: true, archivedAt: true, active: true, liveStatus: true, firstWentLiveAt: true, welcomeEmailSentAt: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
  const ids = courses.map(c => c.id);
  const inIds = { courseId: { in: ids } };
  const [cur, prior, last, fees, archivedCount] = await Promise.all([
    prisma.booking.groupBy({ by: ['courseId'], where: { ...inIds, ...MADE, createdAt: { gte: start, lt: now } }, _count: { id: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...inIds, ...MADE, createdAt: { gte: priorStart, lt: priorEnd } }, _count: { id: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...inIds, ...MADE }, _max: { createdAt: true } }),
    seesMoney ? feesByCourse(ids, start, now) : null,
    archived ? null : prisma.course.count({ where: { archivedAt: { not: null } } }),
  ]);
  const curMap = new Map(cur.map(r => [r.courseId, r._count.id]));
  const priorMap = new Map(prior.map(r => [r.courseId, r._count.id]));
  const lastMap = new Map(last.map(r => [r.courseId, r._max.createdAt]));
  return NextResponse.json({
    at: now.toISOString(),
    riskDays: RISK_DAYS,
    archivedCount,
    seesMoney,
    support,
    rows: courses.map(c => {
      const lastAt = lastMap.get(c.id) ?? null;
      return {
        id: c.id, name: c.name, slug: c.slug, town: [c.city, c.state].filter(Boolean).join(', '), isTest: c.isTest,
        status: courseStatus(c, lastAt, now),
        bookings: curMap.get(c.id) ?? 0, bookingsPrior: priorMap.get(c.id) ?? 0,
        feesCents: fees ? fees.get(c.id) ?? 0 : null,
        lastBookingAt: lastAt?.toISOString() ?? null,
      };
    }),
  });
}

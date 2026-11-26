import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { auditAdmin, auditGolferView } from '@/lib/admin-audit';
import { sendBookingConfirmation, sendCheckInReceiptEmail } from '@/lib/email';
import { roundChargedTotal, roundApplicationFeeCents } from '@/lib/shop';
import { confirmationPartsOf, CONFIRMATION_PART_SELECT } from '@/lib/confirmation-parts';
import { ON_REAL_COURSE } from '@/lib/real-courses';
import { bookingRefLabel } from '@/lib/booking-ref';
import { ciContains, ciEquals } from '@/lib/like-exact';
import { golferLines, isListFilter, matchesFilter, matchesQuery, canResendReceipt, withoutFailedCharges } from './list';
import { hasArea } from '@/lib/admin-areas';
import { MONEY_ONLY_PAYMENT_KINDS } from '@/lib/money-problems';

// MP-6d: the Golfers record page. Search finds accounts AND guest bookings by
// name / email / phone; the record is identity + a trust strip (rounds,
// no-shows, late cancels, failed charges, lifetime collected) + every booking
// with its money events + the support actions a real call needs.
// Golfers page (Cam approved the mockup 2026-11-17): ?list=1 is every golfer on one line (./list), 50 at a time,
// with search and one filter. Read only, like the record; the only actions stay the two resends below.

const LIST_PAGE = 50;


const BOOKING_SELECT = {
  id: true, status: true, paymentStatus: true,
  players: true, totalAmount: true, accessFeeTotal: true,
  shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, roundChargedCents: true,
  greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, cancellationFeeTotal: true,
  checkedInAt: true, cancelledAt: true, checkInFailReason: true, cancellationFeeChargedAt: true,
  roundPaymentIntentId: true, stripePaymentMethodId: true, golferAccountId: true,
  golferName: true, golferEmail: true, golferPhone: true,
  createdAt: true, ref: true, termsAcceptedAt: true, termsVersion: true,
  course: { select: { id: true, name: true, slug: true, number: true } },
  teeTime: { select: { date: true, time: true, holes: true } },
  paymentEvents: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, kind: true, amountCents: true, actor: true, actorName: true, detail: true, stripeId: true, createdAt: true },
  },
} as const;

type BookingRow = {
  id: string; status: string; paymentStatus: string; players: number; totalAmount: number; accessFeeTotal: number; shopTotalCents: number; shopFeeCents: number; shopTaxCents: number; roundChargedCents: number | null;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; cancellationFeeTotal: number;
  checkedInAt: Date | null; cancelledAt: Date | null; checkInFailReason: string; cancellationFeeChargedAt: Date | null;
  roundPaymentIntentId: string; stripePaymentMethodId: string; golferAccountId: string | null;
  golferName: string; golferEmail: string; golferPhone: string; createdAt: Date;
  ref: number | null; termsAcceptedAt: Date | null; termsVersion: string | null;
  course: { id: string; name: string; slug: string; number: number | null }; teeTime: { date: string; time: string; holes: number };
  paymentEvents: { id: string; kind: string; amountCents: number; actor: string; actorName: string | null; detail: string; stripeId: string; createdAt: Date }[];
};

function todayStr() { return new Date().toISOString().split('T')[0]; }

function shapeBooking(b: BookingRow, today: string, seesMoney: boolean) {
  const refunded = b.paymentEvents.filter(e => e.kind === 'refund').reduce((s, e) => s + e.amountCents, 0);
  const isPast = b.teeTime.date < today;
  const noShow = b.status === 'confirmed' && isPast && !b.checkedInAt && b.paymentStatus !== 'paid' && !b.checkInFailReason;
  return {
    id: b.id, status: b.status, paymentStatus: b.paymentStatus,
    players: b.players,
    // POS-1a: what the card is (or was) charged — the round plus any shop items —
    // so the refund dialog's "charged" and "left to refund" match Stripe.
    totalAmount: roundChargedTotal(b) / 100, accessFeeTotal: roundApplicationFeeCents(b) / 100,
    greenFeeTotal: b.greenFeeTotal / 100, cartFeeTotal: b.cartFeeTotal / 100,
    cancellationFeeTotal: b.cancellationFeeTotal / 100,
    refundedTotal: refunded / 100,
    checkedInAt: b.checkedInAt?.toISOString() ?? null,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    cancellationFeeChargedAt: b.cancellationFeeChargedAt?.toISOString() ?? null,
    // M10 / MONEY-VIEW-1: a declined card, its reason and our fee events are the Money area's.
    checkInFailReason: seesMoney ? b.checkInFailReason : '',
    hasCard: !!b.stripePaymentMethodId,
    isGuest: !b.golferAccountId,
    noShow,
    createdAt: b.createdAt.toISOString(),
    number: bookingRefLabel(b),
    termsAcceptedAt: b.termsAcceptedAt?.toISOString() ?? null, termsVersion: b.termsVersion,
    courseId: b.course.id, courseName: b.course.name, courseSlug: b.course.slug,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time, holes: b.teeTime.holes,
    events: b.paymentEvents.filter(e => seesMoney || !MONEY_ONLY_PAYMENT_KINDS.includes(e.kind)).map(e => ({
      id: e.id, kind: e.kind, amount: e.amountCents / 100, actor: e.actor, actorName: e.actorName, detail: e.detail, at: e.createdAt.toISOString(),
    })),
  };
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const noArea = areaGate(session, 'golfers');
  if (noArea) return noArea;
  // M10 / MONEY-VIEW-1 (Cam 2026-11-26): failed charges only with the Money area.
  const seesMoney = hasArea(session, 'money');

  const { searchParams } = req.nextUrl;
  const golferId = searchParams.get('id');
  const guestEmail = (searchParams.get('guest') ?? '').trim().toLowerCase();
  const q = (searchParams.get('q') ?? '').trim();
  const today = todayStr();

  // Record view: an account, or a guest identified by email.
  if (golferId || guestEmail) {
    let identity: { id: string | null; email: string; firstName: string; lastName: string; phone: string; createdAt: string | null; isGuest: boolean };
    let rows: BookingRow[];
    if (golferId) {
      const golfer = await prisma.golferAccount.findUnique({
        where: { id: golferId },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true, bookings: { orderBy: { createdAt: 'desc' }, select: BOOKING_SELECT } },
      });
      if (!golfer) return NextResponse.json({ error: 'Golfer not found' }, { status: 404 });
      // Guest bookings made with the same email before (or without) signing up belong on the same record.
      const guests = await prisma.booking.findMany({ where: { golferAccountId: null, golferEmail: ciEquals(golfer.email) }, orderBy: { createdAt: 'desc' }, select: BOOKING_SELECT });
      identity = { id: golfer.id, email: golfer.email, firstName: golfer.firstName, lastName: golfer.lastName, phone: golfer.phone ?? '', createdAt: golfer.createdAt.toISOString(), isGuest: false };
      rows = [...golfer.bookings, ...guests] as unknown as BookingRow[];
    } else {
      const guests = await prisma.booking.findMany({ where: { golferAccountId: null, golferEmail: ciEquals(guestEmail) }, orderBy: { createdAt: 'desc' }, select: BOOKING_SELECT });
      if (guests.length === 0) return NextResponse.json({ error: 'No guest bookings for that email' }, { status: 404 });
      const g = guests[0];
      const [first, ...rest] = g.golferName.split(' ');
      identity = { id: null, email: g.golferEmail, firstName: first, lastName: rest.join(' '), phone: g.golferPhone, createdAt: null, isGuest: true };
      rows = guests as unknown as BookingRow[];
    }
    rows.sort((a, b) => (b.teeTime.date + b.teeTime.time).localeCompare(a.teeTime.date + a.teeTime.time));
    const bookings = rows.map(b => shapeBooking(b, today, seesMoney));

    // Trust strip — the difference between waiving a fee gladly and spotting a serial no-show.
    const trust = {
      rounds: bookings.filter(b => b.status === 'completed').length,
      noShows: bookings.filter(b => b.noShow).length,
      // A late cancel KEPT its fee: a waived fee leaves the timestamp but the booking reads 'refunded' (analytics.ts's rule).
      lateCancels: bookings.filter(b => b.status === 'cancelled' && b.cancellationFeeChargedAt && b.paymentStatus === 'cancellation_fee_charged').length,
      failedCharges: seesMoney ? bookings.filter(b => b.checkInFailReason && !b.checkedInAt).length : null,
      upcoming: bookings.filter(b => b.status === 'confirmed' && b.teeDate >= today).length,
      lifetimeCollected: bookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'refunded').reduce((s, b) => s + b.totalAmount - b.refundedTotal, 0),
      refunded: bookings.reduce((s, b) => s + b.refundedTotal, 0),
    };

    // GOLFER-VIEW (Cam 2026-11-18): every opened record is recorded (who, which golfer, when), at most once per
    // admin per golfer per 10 minutes. The search and the list are not. No record, no view.
    const viewName = `${identity.firstName} ${identity.lastName}`.trim() || identity.email;
    try {
      await auditGolferView(session, identity.id ? { kind: 'account', id: identity.id, name: viewName } : { kind: 'guest', id: identity.email.toLowerCase(), name: viewName });
    } catch (err) {
      console.error(JSON.stringify({ ev: 'golfer_view.audit_failed', error: err instanceof Error ? err.message : String(err) }));
      Sentry.captureException(err, { tags: { area: 'admin_audit', action: 'golfer_view' } });
      return NextResponse.json({ error: 'Couldn’t record that you opened this golfer, so it isn’t shown. Try again.' }, { status: 503 });
    }
    return NextResponse.json({ golfer: { ...identity, bookings, trust } });
  }

  // The record above keeps test-course bookings on purpose (search sends them here), so for a tester with both kinds
  // the list's numbers and the record's can differ. Real golfers only book on real courses.
  // List mode: every golfer, one line each. Test courses stay out (TEST-2); an account shows if it has booked on a
  // real course, or never booked at all.
  if (searchParams.get('list')) {
    const f = searchParams.get('filter') ?? 'all';
    const filter = isListFilter(f) ? f : 'all';
    if (filter === 'failed' && !seesMoney) return areaGate(session, 'money')!;
    const offset = Math.max(0, Math.min(1_000_000, Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0));
    const lq = q.slice(0, 100);
    const [accounts, rows] = await Promise.all([
      prisma.golferAccount.findMany({
        where: { OR: [{ bookings: { none: {} } }, { bookings: { some: ON_REAL_COURSE } }] },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true },
      }),
      prisma.booking.findMany({
        where: ON_REAL_COURSE,
        select: {
          golferAccountId: true, golferEmail: true, golferName: true, golferPhone: true, status: true, paymentStatus: true,
          checkedInAt: true, checkInFailReason: true, cancellationFeeChargedAt: true, createdAt: true,
          course: { select: { id: true, name: true } }, teeTime: { select: { date: true } },
        },
      }),
    ]);
    const lines = golferLines(accounts, rows.map(r => ({ ...r, courseId: r.course.id, courseName: r.course.name, teeDate: r.teeTime.date })), today)
      .map(l => (seesMoney ? l : withoutFailedCharges(l)))
      .filter(l => matchesFilter(l, filter) && matchesQuery(l, lq));
    const page = lines.slice(offset, offset + LIST_PAGE);
    return NextResponse.json({
      filter, q: lq, total: lines.length, seesMoney,
      nextOffset: offset + LIST_PAGE < lines.length ? offset + LIST_PAGE : null,
      golfers: page.map(l => ({
        key: l.key, id: l.id, guestEmail: l.guestEmail, name: l.name, homeCourse: l.homeCourse, rounds: l.rounds, lastPlayed: l.lastPlayed, tone: l.tone,
      })),
    });
  }

  // Search mode
  if (!q || q.length < 2) {
    return NextResponse.json({ golfers: [], guestBookings: [] });
  }

  const lq = q.toLowerCase();
  const digits = q.replace(/\D/g, '');
  const [golfers, guestBookings] = await Promise.all([
    prisma.golferAccount.findMany({
      where: {
        OR: [
          { email: ciContains(lq) },
          { firstName: ciContains(lq) },
          { lastName: ciContains(lq) },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true, _count: { select: { bookings: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // Guest bookings (no GolferAccount link) by email, name or phone
    prisma.booking.findMany({
      where: {
        golferAccountId: null,
        OR: [
          { golferEmail: ciContains(lq) },
          { golferName: ciContains(lq) },
          ...(digits.length >= 4 ? [{ golferPhone: { contains: digits } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, golferName: true, golferEmail: true, golferPhone: true,
        players: true, totalAmount: true, status: true, createdAt: true,
        course: { select: { id: true, name: true } },
        teeTime: { select: { date: true, time: true } },
      },
    }),
  ]);

  return NextResponse.json({
    golfers: golfers.map(g => ({
      id: g.id, email: g.email, name: `${g.firstName} ${g.lastName}`, phone: g.phone,
      bookingCount: g._count.bookings, createdAt: g.createdAt.toISOString(),
    })),
    guestBookings: guestBookings.map(b => ({
      id: b.id, golferName: b.golferName, golferEmail: b.golferEmail, golferPhone: b.golferPhone,
      players: b.players, totalAmount: Number(b.totalAmount) / 100, status: b.status, createdAt: b.createdAt.toISOString(),
      courseName: b.course.name, courseId: b.course.id, teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    })),
  });
}

// POST { bookingId, action: 'resend_confirmation' | 'resend_receipt' }
// Cam 2026-11-12: no 'cancel' — GreenReserve never cancels (or charges) a golfer's booking.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const noArea = areaGate(session, 'golfers');
  if (noArea) return noArea;

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || '');
  const action = String(body.action || '');
  if (!bookingId || !['resend_confirmation', 'resend_receipt'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      course: { select: { name: true, slug: true, address: true, cancellationHours: true, ...CONFIRMATION_PART_SELECT } },
      teeTime: { select: { date: true, time: true, holes: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  if (action === 'resend_confirmation') {
    if (booking.status === 'cancelled') return NextResponse.json({ error: 'This booking is cancelled — there is no confirmation to resend.' }, { status: 409 });
    // MP-6d: this used to fire-and-forget and answer { ok: true } before the
    // send happened — "Sent" was a guess. Awaited; a bounce is a 502.
    try {
      await sendBookingConfirmation({
        golferName: booking.golferName, golferEmail: booking.golferEmail,
        courseName: booking.course.name, courseAddress: booking.course.address, courseSlug: booking.course.slug,
        date: booking.teeTime.date, time: booking.teeTime.time, players: booking.players, holes: booking.teeTime.holes,
        greenFeeTotal: booking.greenFeeTotal, cartFeeTotal: booking.cartFeeTotal, accessFeeTotal: booking.accessFeeTotal, totalAmount: booking.totalAmount,
        bookingId: booking.id, appliedRate: booking.appliedRate, rangeBallsTotal: booking.rangeBallsTotal,
        cancellationFeeTotal: booking.cancellationFeeTotal, cancellationHours: booking.cancellationHoursAtBooking ?? booking.course.cancellationHours ?? 24, confirmationNote: booking.course.confirmationNote, parts: confirmationPartsOf(booking.course),
        checkInToken: booking.checkInToken ?? undefined, noCard: !booking.stripePaymentMethodId,
      });
    } catch (err) {
      return NextResponse.json({ error: `The email did not send: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 502 });
    }
    await auditAdmin(session, { action: 'resend_confirmation', targetType: 'booking', targetId: bookingId, courseId: booking.courseId, after: { sentTo: booking.golferEmail } });
    return NextResponse.json({ ok: true, sentTo: booking.golferEmail });
  }

  if (action === 'resend_receipt') {
    if (!canResendReceipt(booking)) {
      return NextResponse.json({ error: 'This round has not been charged, so there is no receipt yet.' }, { status: 409 });
    }
    try {
      await sendCheckInReceiptEmail({
        golferName: booking.golferName, golferEmail: booking.golferEmail, courseName: booking.course.name, courseSlug: booking.course.slug,
        date: booking.teeTime.date, time: booking.teeTime.time, players: booking.players,
        greenFeeTotal: booking.greenFeeTotal, cartFeeTotal: booking.cartFeeTotal, rangeBallsTotal: booking.rangeBallsTotal,
        accessFeeTotal: booking.accessFeeTotal, totalAmount: booking.totalAmount,
        feeRefunded: false, feeRefundAmount: 0,
        bookingId: booking.id, checkInToken: booking.checkInToken,
      });
    } catch (err) {
      return NextResponse.json({ error: `The receipt did not send: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 502 });
    }
    await auditAdmin(session, { action: 'resend_receipt', targetType: 'booking', targetId: bookingId, courseId: booking.courseId, after: { sentTo: booking.golferEmail } });
    return NextResponse.json({ ok: true, sentTo: booking.golferEmail });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

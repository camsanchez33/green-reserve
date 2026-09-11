import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-session';
import { sendBookingConfirmation, sendCheckInReceiptEmail } from '@/lib/email';
import { performCancellation } from '@/lib/cancel-booking';

// MP-6d: the Golfers record page. Search finds accounts AND guest bookings by
// name / email / phone; the record is identity + a trust strip (rounds,
// no-shows, late cancels, failed charges, lifetime collected) + every booking
// with its money events + the support actions a real call needs.

const BOOKING_SELECT = {
  id: true, status: true, paymentStatus: true,
  players: true, totalAmount: true, accessFeeTotal: true,
  greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, cancellationFeeTotal: true,
  checkedInAt: true, cancelledAt: true, checkInFailReason: true, cancellationFeeChargedAt: true,
  roundPaymentIntentId: true, stripePaymentMethodId: true, golferAccountId: true,
  golferName: true, golferEmail: true, golferPhone: true,
  createdAt: true,
  course: { select: { id: true, name: true, slug: true } },
  teeTime: { select: { date: true, time: true, holes: true } },
  paymentEvents: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, kind: true, amountCents: true, actor: true, actorName: true, detail: true, stripeId: true, createdAt: true },
  },
} as const;

type BookingRow = {
  id: string; status: string; paymentStatus: string; players: number; totalAmount: number; accessFeeTotal: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; cancellationFeeTotal: number;
  checkedInAt: Date | null; cancelledAt: Date | null; checkInFailReason: string; cancellationFeeChargedAt: Date | null;
  roundPaymentIntentId: string; stripePaymentMethodId: string; golferAccountId: string | null;
  golferName: string; golferEmail: string; golferPhone: string; createdAt: Date;
  course: { id: string; name: string; slug: string }; teeTime: { date: string; time: string; holes: number };
  paymentEvents: { id: string; kind: string; amountCents: number; actor: string; actorName: string | null; detail: string; stripeId: string; createdAt: Date }[];
};

function todayStr() { return new Date().toISOString().split('T')[0]; }

function shapeBooking(b: BookingRow, today: string) {
  const refunded = b.paymentEvents.filter(e => e.kind === 'refund').reduce((s, e) => s + e.amountCents, 0);
  const isPast = b.teeTime.date < today;
  const noShow = b.status === 'confirmed' && isPast && !b.checkedInAt && b.paymentStatus !== 'paid' && !b.checkInFailReason;
  return {
    id: b.id, status: b.status, paymentStatus: b.paymentStatus,
    players: b.players,
    totalAmount: b.totalAmount / 100, accessFeeTotal: b.accessFeeTotal / 100,
    greenFeeTotal: b.greenFeeTotal / 100, cartFeeTotal: b.cartFeeTotal / 100,
    cancellationFeeTotal: b.cancellationFeeTotal / 100,
    refundedTotal: refunded / 100,
    checkedInAt: b.checkedInAt?.toISOString() ?? null,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    cancellationFeeChargedAt: b.cancellationFeeChargedAt?.toISOString() ?? null,
    checkInFailReason: b.checkInFailReason,
    hasCard: !!b.stripePaymentMethodId,
    isGuest: !b.golferAccountId,
    noShow,
    createdAt: b.createdAt.toISOString(),
    courseId: b.course.id, courseName: b.course.name, courseSlug: b.course.slug,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time, holes: b.teeTime.holes,
    events: b.paymentEvents.map(e => ({
      id: e.id, kind: e.kind, amount: e.amountCents / 100, actor: e.actor, actorName: e.actorName, detail: e.detail, at: e.createdAt.toISOString(),
    })),
  };
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
      const guests = await prisma.booking.findMany({ where: { golferAccountId: null, golferEmail: { equals: golfer.email, mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, select: BOOKING_SELECT });
      identity = { id: golfer.id, email: golfer.email, firstName: golfer.firstName, lastName: golfer.lastName, phone: golfer.phone ?? '', createdAt: golfer.createdAt.toISOString(), isGuest: false };
      rows = [...golfer.bookings, ...guests] as unknown as BookingRow[];
    } else {
      const guests = await prisma.booking.findMany({ where: { golferAccountId: null, golferEmail: { equals: guestEmail, mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, select: BOOKING_SELECT });
      if (guests.length === 0) return NextResponse.json({ error: 'No guest bookings for that email' }, { status: 404 });
      const g = guests[0];
      const [first, ...rest] = g.golferName.split(' ');
      identity = { id: null, email: g.golferEmail, firstName: first, lastName: rest.join(' '), phone: g.golferPhone, createdAt: null, isGuest: true };
      rows = guests as unknown as BookingRow[];
    }
    rows.sort((a, b) => (b.teeTime.date + b.teeTime.time).localeCompare(a.teeTime.date + a.teeTime.time));
    const bookings = rows.map(b => shapeBooking(b, today));

    // Trust strip — the difference between waiving a fee gladly and spotting a serial no-show.
    const trust = {
      rounds: bookings.filter(b => b.status === 'completed').length,
      noShows: bookings.filter(b => b.noShow).length,
      lateCancels: bookings.filter(b => b.status === 'cancelled' && b.cancellationFeeChargedAt).length,
      failedCharges: bookings.filter(b => b.checkInFailReason && !b.checkedInAt).length,
      upcoming: bookings.filter(b => b.status === 'confirmed' && b.teeDate >= today).length,
      lifetimeCollected: bookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'refunded').reduce((s, b) => s + b.totalAmount - b.refundedTotal, 0),
      refunded: bookings.reduce((s, b) => s + b.refundedTotal, 0),
    };

    return NextResponse.json({ golfer: { ...identity, bookings, trust } });
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
          { email: { contains: lq, mode: 'insensitive' } },
          { firstName: { contains: lq, mode: 'insensitive' } },
          { lastName: { contains: lq, mode: 'insensitive' } },
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
          { golferEmail: { contains: lq, mode: 'insensitive' } },
          { golferName: { contains: lq, mode: 'insensitive' } },
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

// POST { bookingId, action: 'resend_confirmation' | 'resend_receipt' | 'cancel', reason? }
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || '');
  const action = String(body.action || '');
  if (!bookingId || !['resend_confirmation', 'resend_receipt', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      course: { select: { name: true, slug: true, address: true, cancellationHours: true } },
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
        cancellationFeeTotal: booking.cancellationFeeTotal, cancellationHours: booking.course.cancellationHours ?? 24,
        checkInToken: booking.checkInToken ?? undefined, noCard: !booking.stripePaymentMethodId,
      });
    } catch (err) {
      return NextResponse.json({ error: `The email did not send: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 502 });
    }
    console.log(`[support] ${session.name} (${session.email}) resent confirmation for booking ${bookingId}`);
    return NextResponse.json({ ok: true, sentTo: booking.golferEmail });
  }

  if (action === 'resend_receipt') {
    if (booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'refunded') {
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
    console.log(`[support] ${session.name} (${session.email}) resent receipt for booking ${bookingId}`);
    return NextResponse.json({ ok: true, sentTo: booking.golferEmail });
  }

  // cancel — moves money (a paid round is refunded by the service), manager+
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Cancelling on a golfer\'s behalf needs manager access.' }, { status: 403 });
  const reason = String(body.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'A reason is required — the golfer reads it.' }, { status: 400 });
  const result = await performCancellation(bookingId, { reason: `${reason} (cancelled by GreenReserve support on your behalf)` });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  console.log(`[support] ${session.name} (${session.email}) cancelled booking ${bookingId}: ${reason}`);
  return NextResponse.json({ ok: true, feeCharged: result.feeCharged });
}

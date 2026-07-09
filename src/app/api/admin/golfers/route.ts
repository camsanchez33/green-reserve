import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { sendBookingConfirmation } from '@/lib/email';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const golferId = searchParams.get('id');
  const q = (searchParams.get('q') ?? '').trim();

  // Detail view: load single golfer + all bookings
  if (golferId) {
    const golfer = await prisma.golferAccount.findUnique({
      where: { id: golferId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, createdAt: true,
        bookings: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, status: true, paymentStatus: true,
            players: true, totalAmount: true, accessFeeTotal: true,
            greenFeeTotal: true, cancellationFeeTotal: true,
            checkedInAt: true, cancelledAt: true, checkInFailReason: true,
            checkInToken: true, createdAt: true,
            course: { select: { id: true, name: true, address: true } },
            teeTime: { select: { date: true, time: true, holes: true } },
          },
        },
      },
    });

    if (!golfer) return NextResponse.json({ error: 'Golfer not found' }, { status: 404 });

    return NextResponse.json({
      golfer: {
        id: golfer.id,
        email: golfer.email,
        firstName: golfer.firstName,
        lastName: golfer.lastName,
        phone: golfer.phone,
        createdAt: golfer.createdAt.toISOString(),
        bookings: golfer.bookings.map(b => ({
          id: b.id,
          status: b.status,
          paymentStatus: b.paymentStatus,
          players: b.players,
          totalAmount: Number(b.totalAmount) / 100,
          accessFeeTotal: Number(b.accessFeeTotal) / 100,
          greenFeeTotal: Number(b.greenFeeTotal) / 100,
          cancellationFeeTotal: Number(b.cancellationFeeTotal) / 100,
          checkedInAt: b.checkedInAt?.toISOString() ?? null,
          cancelledAt: b.cancelledAt?.toISOString() ?? null,
          checkInFailReason: b.checkInFailReason,
          checkInToken: b.checkInToken ?? null,
          createdAt: b.createdAt.toISOString(),
          courseName: b.course.name,
          courseId: b.course.id,
          teeDate: b.teeTime.date,
          teeTime: b.teeTime.time,
          holes: b.teeTime.holes,
        })),
      },
    });
  }

  // Search mode
  if (!q || q.length < 2) {
    return NextResponse.json({ golfers: [], guestBookings: [] });
  }

  const lq = q.toLowerCase();
  const [golfers, guestBookings] = await Promise.all([
    prisma.golferAccount.findMany({
      where: {
        OR: [
          { email: { contains: lq, mode: 'insensitive' } },
          { firstName: { contains: lq, mode: 'insensitive' } },
          { lastName: { contains: lq, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, createdAt: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // Guest bookings (no GolferAccount link) matching the email exactly
    prisma.booking.findMany({
      where: {
        golferAccountId: null,
        golferEmail: { contains: lq, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
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
      id: g.id,
      email: g.email,
      name: `${g.firstName} ${g.lastName}`,
      phone: g.phone,
      bookingCount: g._count.bookings,
      createdAt: g.createdAt.toISOString(),
    })),
    guestBookings: guestBookings.map(b => ({
      id: b.id,
      golferName: b.golferName,
      golferEmail: b.golferEmail,
      golferPhone: b.golferPhone,
      players: b.players,
      totalAmount: Number(b.totalAmount) / 100,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      courseName: b.course.name,
      courseId: b.course.id,
      teeDate: b.teeTime.date,
      teeTime: b.teeTime.time,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { bookingId, action } = await req.json();
  if (!bookingId || action !== 'resend_confirmation') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      course: { select: { name: true, address: true, cancellationHours: true } },
      teeTime: { select: { date: true, time: true, holes: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  sendBookingConfirmation({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    courseAddress: booking.course.address,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    players: booking.players,
    holes: booking.teeTime.holes,
    greenFeeTotal: Math.round(booking.greenFeeTotal * 100),
    cartFeeTotal: Math.round(booking.cartFeeTotal * 100),
    accessFeeTotal: Math.round(booking.accessFeeTotal * 100),
    totalAmount: Math.round(booking.totalAmount * 100),
    bookingId: booking.id,
    appliedRate: booking.appliedRate,
    rangeBallsTotal: Math.round(booking.rangeBallsTotal * 100),
    cancellationFeeTotal: Math.round(booking.cancellationFeeTotal * 100),
    cancellationHours: booking.course.cancellationHours ?? 24,
    checkInToken: booking.checkInToken ?? undefined,
    noCard: !booking.stripePaymentMethodId,
  }).catch(err => console.error('Resend confirmation failed:', err));
  console.log(`[support] ${session.name} (${session.email}) resent confirmation for booking ${bookingId}`);
  return NextResponse.json({ ok: true });
}

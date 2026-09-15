import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { performCancellation } from '@/lib/cancel-booking';
import { performCheckIn } from '@/lib/checkin-booking';
import { claimTeeTime, TeeTimeClaimError } from '@/lib/claim-tee-time';
import { sendBookingConfirmation } from '@/lib/email';
import { todayIn } from '@/lib/course-time';
import { randomUUID } from 'crypto';

// Used by both the Payments tab (all bookings, transaction ledger) and the
// Cancellations tab (status=cancelled) — one endpoint, filtered by query param.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') || undefined;
  const date = req.nextUrl.searchParams.get('date') || undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      courseId: session.courseId,
      ...(status ? { status } : {}),
      ...(date ? { teeTime: { date } } : {}),
    },
    include: { teeTime: { select: { date: true, time: true, holes: true } } },
    orderBy: { createdAt: 'desc' },
    take: date ? undefined : 200,
  });

  return NextResponse.json(bookings);
}

// Lets the operator cancel a booking on a golfer's behalf (e.g. a phone-call
// cancellation), or check a golfer in and charge them for their round —
// staff-side counterpart to the golfer's self-checkin link.
export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action, paymentMethodId, checkedInPlayers: cipRaw } = await req.json();
  // SD-5: partial party — how many actually showed (1 .. players-1); absent = all.
  const cip = cipRaw == null ? undefined : Number(cipRaw);
  if (cip !== undefined && (!Number.isInteger(cip) || cip < 1)) return NextResponse.json({ error: 'Invalid headcount.' }, { status: 400 });
  const ACTIONS = ['cancel', 'checkin', 'no_show', 'still_coming', 'paid_offline'];
  if (!id || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Missing id or unsupported action' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id }, select: { courseId: true, status: true, paymentStatus: true, noShowAt: true } });
  if (!booking || booking.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // SD-5 lifecycle — recorded, never inferred:
  //   no_show      the counter says the group never arrived; the booking stays
  //                confirmed so the fee cron treats it exactly as before.
  //   still_coming clears a no-show marked in error.
  //   paid_offline the group paid at the counter (walk-ins, phone bookings, a
  //                declined card settled in cash) — checked in, no Stripe
  //                charge, and never counted as platform-collected.
  if (action === 'no_show') {
    if (booking.status !== 'confirmed') return NextResponse.json({ error: 'Only a confirmed booking can be marked a no-show.' }, { status: 409 });
    await prisma.booking.update({ where: { id }, data: { noShowAt: new Date() } });
    return NextResponse.json({ success: true, noShowAt: new Date().toISOString() });
  }
  if (action === 'still_coming') {
    await prisma.booking.update({ where: { id }, data: { noShowAt: null } });
    return NextResponse.json({ success: true });
  }
  if (action === 'paid_offline') {
    if (booking.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 409 });
    if (booking.status === 'completed') return NextResponse.json({ error: 'Already checked in.' }, { status: 409 });
    await prisma.booking.update({
      where: { id },
      data: { status: 'completed', checkedInAt: new Date(), paidAt: new Date(), paidOffline: true, paymentStatus: 'paid_offline', noShowAt: null, checkInFailReason: '', ...(cip !== undefined ? { checkedInPlayers: cip } : {}) },
    });
    return NextResponse.json({ success: true });
  }

  const result = action === 'cancel'
    ? await performCancellation(id)
    : await performCheckIn(id, { ...(paymentMethodId ? { externalPaymentMethodId: paymentMethodId } : {}), ...(cip !== undefined ? { checkedInPlayers: cip } : {}) });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

// SD-5: a walk-in or phone booking entered at the counter — the biggest
// functional gap the site already promised. Staff can do this (they run the
// sheet). Standard rates from the tee time; pays at the counter
// (paymentStatus 'manual'); optional confirmation email; "check in now" marks
// the group arrived and paid offline in the same step.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const teeTimeId = String(body.teeTimeId ?? '');
  const golferName = String(body.golferName ?? '').trim().slice(0, 120);
  const golferEmail = String(body.golferEmail ?? '').trim().toLowerCase().slice(0, 200);
  const golferPhone = String(body.golferPhone ?? '').trim().slice(0, 40);
  const players = Number(body.players);
  const source = body.source === 'phone' ? 'phone' : 'walk_in';
  const cartSelected = body.cartSelected === true;
  const checkInNow = body.checkInNow === true;
  if (!teeTimeId || golferName.length < 2) return NextResponse.json({ error: 'Enter the golfer’s name.' }, { status: 400 });
  if (!Number.isInteger(players) || players < 1 || players > 8) return NextResponse.json({ error: 'Players must be between 1 and 8.' }, { status: 400 });
  if (golferEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(golferEmail)) return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 });

  const teeTime = await prisma.teeTime.findUnique({ where: { id: teeTimeId }, include: { course: true } });
  if (!teeTime || teeTime.courseId !== session.courseId) return NextResponse.json({ error: 'Tee time not found' }, { status: 404 });
  if (teeTime.date < todayIn(teeTime.course.timezone)) return NextResponse.json({ error: 'That date has passed.' }, { status: 409 });

  const cart = cartSelected || teeTime.course.cartRequired;
  const greenFeeTotal = teeTime.greenFeeCents * players;
  const cartFeeTotal = cart ? teeTime.cartFeeCents * players : 0;
  // No platform fee on a counter booking — nothing is collected online.
  const accessFeeTotal = 0;
  const totalAmount = greenFeeTotal + cartFeeTotal;

  let claimed: { id: string; checkInToken: string | null };
  try {
    claimed = await claimTeeTime({
      teeTimeId, courseId: teeTime.courseId,
      golferName, golferEmail: golferEmail || `${source}+${Date.now()}@noemail.greenreserve.app`, golferPhone,
      players, appliedRate: 'standard',
      greenFeeTotal, cartFeeTotal, cartSelected: cart, accessFeeTotal, totalAmount,
      checkInToken: golferEmail ? randomUUID() : null,
      paymentStatus: checkInNow ? 'paid_offline' : 'manual',
      status: checkInNow ? 'completed' : 'confirmed',
      checkedInAt: checkInNow ? new Date() : null,
      paidAt: checkInNow ? new Date() : null,
      paidOffline: checkInNow,
      source,
      cancellationHoursAtBooking: teeTime.course.cancellationHours,
    });
  } catch (err) {
    if (err instanceof TeeTimeClaimError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json({ error: 'Tee time not found' }, { status: 404 });
      if (err.code === 'BLOCKED') return NextResponse.json({ error: 'This tee time is blocked.' }, { status: 409 });
      if (err.code === 'FULL' || err.code === 'CONFLICT') return NextResponse.json({ error: 'That time just filled up.' }, { status: 409 });
      if (err.code === 'SPOTS') return NextResponse.json({ error: `Only ${err.spotsLeft} spot${err.spotsLeft === 1 ? '' : 's'} left.` }, { status: 409 });
    }
    throw err;
  }

  let emailSent: boolean | null = null;
  if (golferEmail && !checkInNow) {
    try {
      await sendBookingConfirmation({
        golferName, golferEmail, courseName: teeTime.course.name,
        courseAddress: [teeTime.course.address, teeTime.course.city, teeTime.course.state].filter(Boolean).join(', '),
        courseSlug: teeTime.course.slug,
        date: teeTime.date, time: teeTime.time, players, holes: teeTime.holes,
        greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount,
        bookingId: claimed.id, appliedRate: 'standard',
        cancellationHours: teeTime.course.cancellationHours,
        checkInToken: claimed.checkInToken ?? undefined,
        noCard: true,
      });
      emailSent = true;
    } catch (e) { console.error('walk-in confirmation email failed:', e); emailSent = false; }
  }
  return NextResponse.json({ success: true, bookingId: claimed.id, emailSent });
}

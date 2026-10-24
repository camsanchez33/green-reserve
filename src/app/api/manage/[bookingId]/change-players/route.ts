import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';
import { getGolferSession } from '@/lib/auth';
import { canManageBooking } from '@/lib/manage-access';
import { bookingWindowHours, rescalePartyFees } from '@/lib/cancel-policy';
import { teeTimeInstant } from '@/lib/booking-events';
import { groupGreenFee, otherPerPlayerCents } from '@/lib/residents';
import { rulesFor, groupSizeError } from '@/lib/booking-rules';
import { refundBookingFee } from '@/lib/booking-fee';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const golferSession = await getGolferSession();
  const ip = clientIp(req);
  const ok = await rateLimit('manage:players:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json() as { token?: string; newPlayers?: number; termsAccepted?: boolean };
  const { token, newPlayers, termsAccepted } = body;

  if (!newPlayers || !Number.isInteger(newPlayers) || newPlayers < 1 || newPlayers > 4 || (!golferSession && !token)) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }
  if (termsAccepted !== true) {
    return NextResponse.json({ error: 'You must agree to the Terms of Service to change this booking.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, checkInToken: true, golferAccountId: true, teeTimeId: true, players: true,
          status: true, cartSelected: true, rangeBallsTotal: true,
          greenFeeTotal: true, cartFeeTotal: true, accessFeeTotal: true, residentPlayers: true, residentRateCents: true,
          cancellationFeeTotal: true, noShowFeeTotal: true, cancellationHoursAtBooking: true,
          paymentStatus: true, roundPaymentIntentId: true, shopLockedAt: true, feePaidCents: true,
          teeTime: { select: { date: true, time: true, greenFeeCents: true, product: { select: { minPlayers: true, maxPlayers: true } } } },
          course: { select: { timezone: true, cancellationHours: true, lateFeeBasis: true, noShowFeeBasis: true, noShowFeeCents: true, minPlayers: true, maxPlayers: true } },
        },
      });

      if (!booking) throw Object.assign(new Error(), { code: 'INVALID' });
      const authorized = canManageBooking(booking, golferSession?.golferId, token);
      if (!authorized) throw Object.assign(new Error(), { code: 'INVALID' });
      if (booking.status !== 'confirmed') throw Object.assign(new Error(), { code: 'NOT_CONFIRMED' });
      if (booking.players === newPlayers) throw Object.assign(new Error(), { code: 'SAME' });
      // W2-6 slice 3: the course's (or the round's) group size holds on a change too.
      const sizeError = groupSizeError(rulesFor(booking.course, booking.teeTime.product), newPlayers);
      if (sizeError) throw Object.assign(new Error(), { code: 'SIZE', msg: sizeError });
      // A payment taken or started (or a hold already charged) carries the old party's price.
      if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'cancellation_fee_charged' || booking.roundPaymentIntentId || booking.shopLockedAt) throw Object.assign(new Error(), { code: 'PAID' });
      // Launch security review 2026-10-18: once the cutoff has passed at a course
      // with a late fee (a no-show-only course has no window), the party is what the fee was set on — dropping
      // players late would give seats back free, and a hold may already be taken.
      if (booking.cancellationFeeTotal > 0) {
        const teeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
        if (!teeAt || teeAt.getTime() - bookingWindowHours(booking, booking.course) * 3600_000 <= Date.now()) throw Object.assign(new Error(), { code: 'CUTOFF' });
      }

      const slot = await tx.teeTime.findUnique({
        where: { id: booking.teeTimeId },
        select: { playersBooked: true, playersAvailable: true },
      });
      if (!slot) throw Object.assign(new Error(), { code: 'NOT_FOUND' });

      // Effective capacity: total - already booked (excluding this booking's own seats)
      const otherBooked = slot.playersBooked - booking.players;
      const maxPlayers = slot.playersAvailable - otherBooked;
      if (newPlayers > maxPlayers) {
        throw Object.assign(new Error(), { code: 'FULL', max: maxPlayers });
      }

      // Recompute fees at the same per-player rate as the original booking
      const perPlayerGreen = booking.players > 0 ? booking.greenFeeTotal / booking.players : 0;
      const perPlayerCart = (booking.cartSelected && booking.players > 0) ? booking.cartFeeTotal / booking.players : 0;
      // The booking fee keeps its per-player amount: a counter booking that
      // carries none (0) never gains one (PAY-2).
      const perPlayerAccess = booking.players > 0 ? Math.round(booking.accessFeeTotal / booking.players) : 0;
      const { cancellationFeeTotal, noShowFeeTotal } = rescalePartyFees(booking, booking.course, booking.players, newPlayers);

      // RES-1: residents keep the resident rate (never more of them than players);
      // everyone else pays what the booking's non-residents pay.
      const others = otherPerPlayerCents(booking);
      const res = booking.residentPlayers > 0
        ? groupGreenFee(newPlayers, others ?? booking.teeTime.greenFeeCents, booking.residentPlayers, booking.residentRateCents)
        : null;
      const greenFeeTotal = res ? res.greenFeeTotal : Math.round(perPlayerGreen * newPlayers);
      const cartFeeTotal = Math.round(perPlayerCart * newPlayers);
      const accessFeeTotal = perPlayerAccess * newPlayers;
      const totalAmount = greenFeeTotal + cartFeeTotal + Math.round(booking.rangeBallsTotal) + accessFeeTotal;

      // Re-stamp terms consent — the price just changed, so it's a fresh agreement.
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          players: newPlayers, greenFeeTotal, cartFeeTotal,
          ...(res ? { residentPlayers: res.residentPlayers, residentRateCents: res.residentRateCents } : {}), accessFeeTotal, totalAmount, cancellationFeeTotal, noShowFeeTotal,
          termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION,
        },
      });

      const playersDelta = newPlayers - booking.players;
      const newPlayersBooked = slot.playersBooked + playersDelta;
      await tx.teeTime.update({
        where: { id: booking.teeTimeId },
        data: {
          playersBooked: newPlayersBooked,
          status: newPlayersBooked >= slot.playersAvailable ? 'full' : 'available',
        },
      });

      // FEE-AT-BOOKING (Cam 2026-10-24): players taken off before the cutoff get their part of the booking fee back.
      const teeAtNow = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
      const beforeCutoff = !!teeAtNow && teeAtNow.getTime() - bookingWindowHours(booking, booking.course) * 3600_000 > Date.now();
      const feeBack = beforeCutoff ? Math.max(0, booking.feePaidCents - accessFeeTotal) : 0;
      return { players: newPlayers, greenFeeTotal, cartFeeTotal, accessFeeTotal, rangeBallsTotal: Math.round(booking.rangeBallsTotal), totalAmount, feeBack };
    }, { isolationLevel: 'Serializable' });

    const { feeBack, ...view } = result;
    if (feeBack > 0) {
      const r = await refundBookingFee(bookingId, feeBack, `party lowered to ${result.players} before the cutoff`, 'golfer');
      if (!r.ok) return NextResponse.json({ ...view, feeRefundError: 'The party was changed, but the booking fee for the players taken off couldn’t be refunded yet — GreenReserve will follow up.' });
    }
    return NextResponse.json(view);
  } catch (err) {
    const e = err as { code?: string; max?: number; msg?: string };
    if (e.code === 'INVALID') return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    if (e.code === 'NOT_CONFIRMED') return NextResponse.json({ error: 'This booking cannot be modified' }, { status: 409 });
    if (e.code === 'PAID') return NextResponse.json({ error: 'This round has already been paid. Ask the course to change the party size.' }, { status: 409 });
    if (e.code === 'CUTOFF') return NextResponse.json({ error: 'The free-change window for this booking has closed. Call the course to change the party size.' }, { status: 409 });
    if (e.code === 'SIZE') return NextResponse.json({ error: e.msg }, { status: 400 });
    if (e.code === 'SAME') return NextResponse.json({ error: 'Party size is already set to that' }, { status: 409 });
    if (e.code === 'FULL') return NextResponse.json({ error: `Only ${e.max} spot${e.max === 1 ? '' : 's'} available for this tee time` }, { status: 409 });
    if ((err as { code?: string }).code === 'P2034') {
      return NextResponse.json({ error: 'Conflict — please try again' }, { status: 409 });
    }
    console.error(JSON.stringify({ ev: 'manage.players.fail', bookingId, error: (err as Error).message }));
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

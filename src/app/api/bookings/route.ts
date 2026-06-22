import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { stripe, ACCESS_FEE_CENTS } from '@/lib/stripe';
import { sendBookingConfirmation, sendOperatorBookingNotification } from '@/lib/email';

/** Returns true for Sat/Sun given a date string like "2026-06-21" */
function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

/**
 * Resolves the green fee and cart fee for a golfer based on their membership tier.
 * Falls back to the tee time's standard rates if no membership or no override.
 */
function applyTierRates(
  teeTime: { greenFee: number; cartFee: number; memberRate: number | null; date: string },
  tier: {
    greenFeeWeekday: number | null;
    greenFeeWeekend: number | null;
    cartFeeWeekday:  number | null;
    cartFeeWeekend:  number | null;
    discountPct:     number | null;
  } | null
): { greenFee: number; cartFee: number } {
  if (!tier) return { greenFee: teeTime.greenFee, cartFee: teeTime.cartFee };

  const weekend = isWeekend(teeTime.date);

  // Flat rate overrides
  if (tier.greenFeeWeekday != null || tier.greenFeeWeekend != null) {
    const greenFee = weekend
      ? (tier.greenFeeWeekend ?? tier.greenFeeWeekday ?? teeTime.greenFee)
      : (tier.greenFeeWeekday ?? teeTime.greenFee);
    const cartFee = weekend
      ? (tier.cartFeeWeekend ?? tier.cartFeeWeekday ?? teeTime.cartFee)
      : (tier.cartFeeWeekday ?? teeTime.cartFee);
    return { greenFee, cartFee };
  }

  // Percentage discount off standard
  if (tier.discountPct != null) {
    const mult = 1 - tier.discountPct / 100;
    return {
      greenFee: Math.round(teeTime.greenFee * mult * 100) / 100,
      cartFee:  Math.round(teeTime.cartFee  * mult * 100) / 100,
    };
  }

  // No override — fall back to legacy memberRate if set, else standard
  return {
    greenFee: teeTime.memberRate ?? teeTime.greenFee,
    cartFee:  teeTime.cartFee,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teeTimeId, players, golferName, golferEmail, golferPhone, paymentMethodId, customerId, cartSelected, rangeBallsSize } = body;

  if (!teeTimeId || !players || !golferName || !golferEmail)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const golferSession = await getGolferSession();
  let appliedRate = 'standard';
  let appliedTierName = 'standard';

  // Look up membership tier BEFORE entering the transaction (read-only, safe)
  let resolvedGreenFeeOverride: number | null = null;
  let resolvedCartFeeOverride:  number | null = null;

  if (golferSession) {
    const membership = await prisma.courseMembership.findFirst({
      where: {
        courseId: (await prisma.teeTime.findUnique({ where: { id: teeTimeId }, select: { courseId: true } }))?.courseId,
        golferId: golferSession.golferId,
        status: 'active',
      },
      include: { tier: true },
    });

    if (membership?.tier) {
      const teeTimePreview = await prisma.teeTime.findUnique({
        where: { id: teeTimeId },
        select: { greenFee: true, cartFee: true, memberRate: true, date: true },
      });
      if (teeTimePreview) {
        const rates = applyTierRates(teeTimePreview, membership.tier);
        resolvedGreenFeeOverride = rates.greenFee;
        resolvedCartFeeOverride  = rates.cartFee;
        appliedTierName = membership.tier.name;
        appliedRate     = membership.tier.name;
      }
    }
  }

  // Atomic transaction
  let result;
  try {
  result = await prisma.$transaction(async (tx) => {
    const teeTime = await tx.teeTime.findUnique({
      where: { id: teeTimeId },
      include: {
        course: { include: { operator: { select: { email: true } } } },
      },
    });
    if (!teeTime) throw new Error('NOT_FOUND');
    if (teeTime.status === 'blocked') throw new Error('BLOCKED');
    if (teeTime.status === 'full')    throw new Error('FULL');

    // Reject bookings for tee times that have already started
    const nowUtc = new Date();
    const todayUtc = nowUtc.toISOString().split('T')[0];
    const currentTimeStr = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`;
    if (teeTime.date < todayUtc || (teeTime.date === todayUtc && teeTime.time <= currentTimeStr)) {
      throw new Error('PAST');
    }

    const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
    if (players > spotsLeft) throw new Error(`SPOTS:${spotsLeft}`);

    // Apply resolved rates (or standard if no membership)
    const greenFeePerPlayer = resolvedGreenFeeOverride ?? teeTime.greenFee;
    const cartFeePerPlayer  = resolvedCartFeeOverride  ?? teeTime.cartFee;
    const wantsCart = teeTime.course.cartRequired ? true : !!cartSelected;

    const greenFeeTotal  = Math.round(greenFeePerPlayer * players * 100); // cents
    const cartFeeTotal   = wantsCart ? Math.round(cartFeePerPlayer * players * 100) : 0;

    // Range balls — flat per-booking add-on, size priced by the course. Free
    // if the course includes them; otherwise only a size they've actually priced is purchasable.
    let rangeBallsTotal = 0;
    const ballsSize = String(rangeBallsSize || '');
    if (teeTime.course.hasDrivingRange && !teeTime.course.rangeBallsFree && ballsSize) {
      const priceMap: Record<string, number> = {
        small: teeTime.course.rangeBallsSmallPrice,
        medium: teeTime.course.rangeBallsMediumPrice,
        large: teeTime.course.rangeBallsLargePrice,
      };
      rangeBallsTotal = Math.round((priceMap[ballsSize] || 0) * 100);
    }

    const accessFeeTotal = ACCESS_FEE_CENTS * players;
    const totalCents     = greenFeeTotal + cartFeeTotal + rangeBallsTotal + accessFeeTotal;
    const cancellationFeeTotal = Math.round((teeTime.course.lateCancellationFee || 0) * 100);

    // Card-on-file flow — save the card, charge NOTHING right now. The
    // cancellation-fee cron charges cancellationFeeTotal if they don't cancel
    // by the course's cancellationHours cutoff; the actual round total gets
    // charged later at check-in (separate flow).
    let savedCustomerId = '';
    let savedPaymentMethodId = '';
    if (teeTime.course.stripeAccountActive && paymentMethodId && customerId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
        savedCustomerId = customerId;
        savedPaymentMethodId = paymentMethodId;
      } catch (attachErr) {
        console.error('Could not attach payment method to customer:', attachErr);
        throw new Error('CARD_SAVE_FAILED');
      }
    }

    const booking = await tx.booking.create({
      data: {
        teeTimeId,
        courseId:         teeTime.courseId,
        golferAccountId:  golferSession?.golferId || null,
        golferName,
        golferEmail,
        golferPhone:      golferPhone || '',
        players,
        appliedRate,
        greenFeeTotal,
        cartFeeTotal,
        cartSelected:     wantsCart,
        rangeBallsSize:   rangeBallsTotal > 0 ? ballsSize : '',
        rangeBallsTotal,
        accessFeeTotal,
        totalAmount:      totalCents,
        stripeCustomerId:      savedCustomerId,
        stripePaymentMethodId: savedPaymentMethodId,
        cancellationFeeTotal,
        checkInToken:     randomUUID(),
        paymentStatus:    savedPaymentMethodId ? 'card_on_file' : 'no_payment_method',
        status:           'confirmed',
      },
    });

    const newBooked = teeTime.playersBooked + players;
    await tx.teeTime.update({
      where: { id: teeTimeId },
      data: {
        playersBooked: newBooked,
        status: newBooked >= teeTime.playersAvailable ? 'full' : 'available',
      },
    });

    return { booking, teeTime, totalCents, greenFeeTotal, cartFeeTotal, rangeBallsTotal, accessFeeTotal, cancellationFeeTotal };
  });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      return NextResponse.json({ error: err.message || 'Your card was declined.' }, { status: 402 });
    }
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });
      if (err.message === 'BLOCKED')   return NextResponse.json({ error: 'This tee time is no longer available.' }, { status: 409 });
      if (err.message === 'FULL')      return NextResponse.json({ error: 'This tee time is fully booked.' }, { status: 409 });
      if (err.message === 'PAST')      return NextResponse.json({ error: 'This tee time has already passed.' }, { status: 409 });
      if (err.message === 'CARD_SAVE_FAILED') return NextResponse.json({ error: 'Your card could not be saved. Please check your details and try again.' }, { status: 402 });
      if (err.message.startsWith('SPOTS:')) {
        const left = err.message.split(':')[1];
        return NextResponse.json({ error: `Only ${left} spot${left === '1' ? '' : 's'} left for this tee time.` }, { status: 409 });
      }
    }
    console.error('Booking transaction error:', err);
    return NextResponse.json({ error: 'Something went wrong processing your booking. Please try again.' }, { status: 500 });
  }

  // Send confirmation emails (fire-and-forget)
  try {
    const emailData = {
      golferName,
      golferEmail,
      courseName:    result.teeTime.course.name,
      courseAddress: `${result.teeTime.course.address || ''}, ${result.teeTime.course.city}, ${result.teeTime.course.state}`,
      date:          result.teeTime.date,
      time:          result.teeTime.time,
      holes:         result.teeTime.holes,
      players,
      appliedRate,
      // Pass cents — email templates divide by 100 themselves
      greenFeeTotal:  result.greenFeeTotal,
      cartFeeTotal:   result.cartFeeTotal,
      rangeBallsTotal: result.rangeBallsTotal,
      accessFeeTotal: result.accessFeeTotal,
      totalAmount:    result.totalCents,
      cancellationFeeTotal: result.cancellationFeeTotal,
      cancellationHours: result.teeTime.course.cancellationHours,
      bookingId: result.booking.id,
      checkInToken: result.booking.checkInToken || undefined,
      noCard: !result.booking.stripePaymentMethodId,
    };
    await sendBookingConfirmation(emailData);
    const courseId = result.teeTime.courseId;
    const operator = await prisma.courseOperator.findFirst({ where: { course: { id: courseId } } });
    if (operator?.email) {
      await sendOperatorBookingNotification({ ...emailData, operatorEmail: operator.email });
    }
  } catch (err) {
    console.error('Email error:', err);
  }

  return NextResponse.json({
    bookingId:      result.booking.id,
    appliedRate,
    memberRate:     appliedTierName !== 'standard',
    greenFeeTotal:  result.greenFeeTotal  / 100,
    cartFeeTotal:   result.cartFeeTotal   / 100,
    rangeBallsTotal: result.rangeBallsTotal / 100,
    accessFeeTotal: result.accessFeeTotal / 100,
    totalAmount:    result.totalCents     / 100,
    cancellationFeeTotal: result.cancellationFeeTotal / 100,
    cancellationHours: result.teeTime.course.cancellationHours,
    courseName:     result.teeTime.course.name,
    date:           result.teeTime.date,
    time:           result.teeTime.time,
    players,
  });
}

export async function GET() {
  const golferSession = await getGolferSession();
  if (!golferSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bookings = await prisma.booking.findMany({
    where: { golferAccountId: golferSession.golferId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course:  { select: { name: true, city: true, state: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(bookings);
}

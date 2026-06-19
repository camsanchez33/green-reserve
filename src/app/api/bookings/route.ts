import { NextRequest, NextResponse } from 'next/server';
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
  const { teeTimeId, players, golferName, golferEmail, golferPhone, paymentMethodId } = body;

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
  const result = await prisma.$transaction(async (tx) => {
    const teeTime = await tx.teeTime.findUnique({
      where: { id: teeTimeId },
      include: {
        course: { include: { operator: { select: { email: true } } } },
      },
    });
    if (!teeTime) throw new Error('NOT_FOUND');
    if (teeTime.status === 'blocked') throw new Error('BLOCKED');
    if (teeTime.status === 'full')    throw new Error('FULL');

    const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
    if (players > spotsLeft) throw new Error(`SPOTS:${spotsLeft}`);

    // Apply resolved rates (or standard if no membership)
    const greenFeePerPlayer = resolvedGreenFeeOverride ?? teeTime.greenFee;
    const cartFeePerPlayer  = resolvedCartFeeOverride  ?? teeTime.cartFee;

    const greenFeeTotal  = Math.round(greenFeePerPlayer * players * 100); // cents
    const cartFeeTotal   = Math.round(cartFeePerPlayer  * players * 100);
    const accessFeeTotal = ACCESS_FEE_CENTS * players;
    const totalCents     = greenFeeTotal + cartFeeTotal + accessFeeTotal;

    // Stripe payment
    let stripePaymentIntentId = '';
    let clientSecret = '';
    if (teeTime.course.stripeAccountActive && teeTime.course.stripeAccountId && paymentMethodId) {
      const intent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        return_url: `${process.env.NEXT_PUBLIC_URL}/book/confirm`,
        application_fee_amount: accessFeeTotal,
        transfer_data: { destination: teeTime.course.stripeAccountId },
        metadata: { teeTimeId, players: String(players), golferEmail, appliedRate },
      });
      stripePaymentIntentId = intent.id;
      if (intent.status !== 'succeeded') clientSecret = intent.client_secret || '';
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
        accessFeeTotal,
        totalAmount:      totalCents,
        stripePaymentIntentId,
        paymentStatus:    stripePaymentIntentId ? 'paid' : 'pending',
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

    return { booking, teeTime, totalCents, greenFeeTotal, cartFeeTotal, accessFeeTotal, clientSecret };
  });

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
      greenFeeTotal:  result.greenFeeTotal  / 100,
      cartFeeTotal:   result.cartFeeTotal   / 100,
      accessFeeTotal: result.accessFeeTotal / 100,
      totalAmount:    result.totalCents     / 100,
      memberRate:     appliedTierName !== 'standard' ? appliedTierName : undefined,
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
    clientSecret: result.clientSecret,
    bookingId:    result.booking.id,
    appliedRate,
    memberRate:   appliedTierName !== 'standard',
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

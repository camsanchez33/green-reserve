import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { stripe, ACCESS_FEE_CENTS } from '@/lib/stripe';
import { sendBookingConfirmation, sendOperatorBookingNotification } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teeTimeId, players, golferName, golferEmail, golferPhone, paymentMethodId } = body;

  if (!teeTimeId || !players || !golferName || !golferEmail)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  // Determine rate — check membership before transaction
  const golferSession = await getGolferSession();
  let appliedRate = 'standard';
  let membershipType = 'standard';

  // Atomic transaction: check availability + create booking + decrement in one shot
  const result = await prisma.$transaction(async (tx) => {
    const teeTime = await tx.teeTime.findUnique({
      where: { id: teeTimeId },
      include: {
        course: {
          include: { operator: { select: { email: true } } },
        },
      },
    });
    if (!teeTime) throw new Error('NOT_FOUND');
    if (teeTime.status === 'blocked') throw new Error('BLOCKED');
    if (teeTime.status === 'full') throw new Error('FULL');

    const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
    if (players > spotsLeft) throw new Error(`SPOTS:${spotsLeft}`);

    // Check membership
    let greenFeePerPlayer = teeTime.greenFee;
    if (golferSession && teeTime.memberRate) {
      const membership = await tx.courseMembership.findUnique({
        where: { golferId_courseId: { golferId: golferSession.golferId, courseId: teeTime.courseId } },
      });
      if (membership?.status === 'active') {
        greenFeePerPlayer = teeTime.memberRate;
        membershipType = membership.membershipType;
        appliedRate = membershipType;
      }
    }

    const greenFeeTotal = Math.round(greenFeePerPlayer * players * 100); // in cents
    const cartFeeTotal = Math.round(teeTime.cartFee * players * 100);
    const accessFeeTotal = ACCESS_FEE_CENTS * players;
    const totalCents = greenFeeTotal + cartFeeTotal + accessFeeTotal;

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
        metadata: { teeTimeId, players: String(players), golferEmail },
      });
      stripePaymentIntentId = intent.id;
      if (intent.status !== 'succeeded') clientSecret = intent.client_secret || '';
    }

    // Create booking
    const booking = await tx.booking.create({
      data: {
        teeTimeId,
        courseId: teeTime.courseId,
        golferAccountId: golferSession?.golferId || null,
        golferName,
        golferEmail,
        golferPhone: golferPhone || '',
        players,
        appliedRate,
        greenFeeTotal,
        cartFeeTotal,
        accessFeeTotal,
        totalAmount: totalCents,
        stripePaymentIntentId,
        paymentStatus: stripePaymentIntentId ? 'paid' : 'pending',
        status: 'confirmed',
      },
    });

    // Atomically decrement players
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

  // Send emails (outside transaction, non-blocking)
  try {
    const emailData = {
      golferName,
      golferEmail,
      courseName: result.teeTime.course.name,
      courseAddress: `${result.teeTime.course.address || ''}, ${result.teeTime.course.city}, ${result.teeTime.course.state}`,
      date: result.teeTime.date,
      time: result.teeTime.time,
      holes: result.teeTime.holes,
      players,
      greenFeeTotal: result.greenFeeTotal / 100,
      cartFeeTotal: result.cartFeeTotal / 100,
      accessFeeTotal: result.accessFeeTotal / 100,
      totalAmount: result.totalCents / 100,
    };
    await sendBookingConfirmation(emailData);
    const operator = await prisma.courseOperator.findFirst({ where: { course: { id: courseId } } });
    if (operator?.email) {
      await sendOperatorBookingNotification({ ...emailData, operatorEmail: operator.email });
    }
  } catch (err) {
    console.error('Email error:', err);
  }

  return NextResponse.json({ clientSecret: result.clientSecret, bookingId: result.booking.id });
}
alCents / 100,
    clientSecret: result.clientSecret || null,
  });
}

export async function GET() {
  const golferSession = await getGolferSession();
  if (!golferSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bookings = await prisma.booking.findMany({
    where: { golferAccountId: golferSession.golferId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course: { select: { name: true, city: true, state: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(bookings);
}

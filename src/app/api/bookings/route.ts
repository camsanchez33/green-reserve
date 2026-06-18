import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { stripe, ACCESS_FEE_CENTS } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teeTimeId, players, golferName, golferEmail, golferPhone, paymentMethodId } = body;

  if (!teeTimeId || !players || !golferName || !golferEmail)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const teeTime = await prisma.teeTime.findUnique({
    where: { id: teeTimeId },
    include: { course: true },
  });
  if (!teeTime) return NextResponse.json({ error: 'Tee time not found' }, { status: 404 });
  if (teeTime.status !== 'available')
    return NextResponse.json({ error: 'This tee time is no longer available' }, { status: 409 });

  const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
  if (players > spotsLeft)
    return NextResponse.json({ error: `Only ${spotsLeft} spots remaining` }, { status: 409 });

  // Determine rate — check if golfer is a member
  const golferSession = await getGolferSession();
  let appliedRate = 'standard';
  let greenFeePerPlayer = teeTime.greenFee;

  if (golferSession && teeTime.memberRate) {
    const membership = await prisma.courseMembership.findUnique({
      where: { golferId_courseId: { golferId: golferSession.golferId, courseId: teeTime.courseId } },
    });
    if (membership?.status === 'active') {
      greenFeePerPlayer = teeTime.memberRate;
      appliedRate = membership.membershipType;
    }
  }

  const greenFeeTotal = greenFeePerPlayer * players;
  const cartFeeTotal = teeTime.cartFee * players;
  const accessFeeTotal = 1.50 * players;
  const totalAmount = greenFeeTotal + cartFeeTotal + accessFeeTotal;
  const totalCents = Math.round(totalAmount * 100);
  const accessFeeCents = ACCESS_FEE_CENTS * players;

  // Create Stripe PaymentIntent if course has Stripe Connect
  let stripePaymentIntentId = '';
  let clientSecret = '';

  if (teeTime.course.stripeAccountActive && teeTime.course.stripeAccountId && paymentMethodId) {
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      return_url: `${process.env.NEXT_PUBLIC_URL}/book/confirm`,
      application_fee_amount: accessFeeCents,
      transfer_data: { destination: teeTime.course.stripeAccountId },
      metadata: { teeTimeId, players: String(players), golferEmail },
    });
    stripePaymentIntentId = intent.id;
    if (intent.status !== 'succeeded') {
      clientSecret = intent.client_secret || '';
    }
  }

  // Create the booking
  const booking = await prisma.booking.create({
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
      totalAmount,
      stripePaymentIntentId,
      paymentStatus: stripePaymentIntentId ? 'paid' : 'pending',
      status: 'confirmed',
    },
  });

  // Decrement availability
  const newBooked = teeTime.playersBooked + players;
  const newStatus = newBooked >= teeTime.playersAvailable ? 'full' : 'available';
  await prisma.teeTime.update({
    where: { id: teeTimeId },
    data: { playersBooked: newBooked, status: newStatus },
  });

  return NextResponse.json({
    success: true,
    bookingId: booking.id,
    totalAmount,
    clientSecret: clientSecret || null,
  });
}

export async function GET(req: NextRequest) {
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

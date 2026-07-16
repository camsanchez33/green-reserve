import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { getMemberSession, getGolferMembership } from '@/lib/member-session';
import { stripe, ACCESS_FEE_CENTS } from '@/lib/stripe';
import { sendBookingConfirmation, sendOperatorBookingNotification, sendCancellationWarningEmail, sendCheckInAvailableEmail } from '@/lib/email';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { claimTeeTime, TeeTimeClaimError } from '@/lib/claim-tee-time';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';

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
  const { teeTimeId, players, golferName, golferEmail, golferPhone, paymentMethodId, customerId, cartSelected, rangeBallsSize, termsAccepted } = body;

  if (!teeTimeId || !players || !golferName || !golferEmail)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  if (termsAccepted !== true) {
    return NextResponse.json({ error: 'You must agree to the Terms of Service to book.' }, { status: 400 });
  }

  const golferSession = await getGolferSession();
  let appliedRate = 'standard';
  let appliedTierName = 'standard';

  // Prefetch the tee time + course data (outside the claim transaction — rates
  // are stable; the claim transaction re-reads capacity under serializable isolation)
  const teeTimeFull = await prisma.teeTime.findUnique({
    where: { id: teeTimeId },
    include: {
      course: { include: { operator: { select: { email: true } } } },
    },
  });
  if (!teeTimeFull) return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });

  // Private clubs: public online booking is blocked server-side
  if (teeTimeFull.course.type === 'private') {
    return NextResponse.json({ error: 'Online booking is not available for this private club.' }, { status: 403 });
  }

  // Demo courses: bookings are disabled
  if (DEMO_COURSE_SLUGS.includes(teeTimeFull.course.slug)) {
    return NextResponse.json({ error: 'Bookings are disabled on demo courses.' }, { status: 403 });
  }

  // Reject bookings for tee times that have already started
  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().split('T')[0];
  const currentTimeStr = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`;
  if (teeTimeFull.date < todayUtc || (teeTimeFull.date === todayUtc && teeTimeFull.time <= currentTimeStr)) {
    return NextResponse.json({ error: 'This tee time has already passed.' }, { status: 409 });
  }

  // Membership tier lookup — check golfer session first, then member session
  let resolvedGreenFeeOverride: number | null = null;
  let resolvedCartFeeOverride: number | null = null;
  if (golferSession) {
    // G5b: matches by direct golferId link OR the golfer's OTP-verified email
    // against an invite-only membership — same recognition as the course page.
    const golferMembership = await getGolferMembership(teeTimeFull.courseId);
    const membership = golferMembership
      ? await prisma.courseMembership.findUnique({ where: { id: golferMembership.membershipId }, include: { tier: true } })
      : null;
    if (membership?.tier) {
      const rates = applyTierRates(teeTimeFull, membership.tier);
      resolvedGreenFeeOverride = rates.greenFee;
      resolvedCartFeeOverride  = rates.cartFee;
      appliedTierName = membership.tier.name;
      appliedRate     = membership.tier.name;
    }
  }
  if (!resolvedGreenFeeOverride) {
    const memberSession = await getMemberSession();
    if (memberSession && memberSession.courseId === teeTimeFull.courseId) {
      const membership = await prisma.courseMembership.findUnique({
        where: { id: memberSession.membershipId },
        include: { tier: true },
      });
      if (membership?.tier && membership.status === 'active') {
        const rates = applyTierRates(teeTimeFull, membership.tier);
        resolvedGreenFeeOverride = rates.greenFee;
        resolvedCartFeeOverride  = rates.cartFee;
        appliedTierName = membership.tier.name;
        appliedRate     = membership.tier.name;
      }
    }
  }

  // Compute fees
  const greenFeePerPlayer = resolvedGreenFeeOverride ?? teeTimeFull.greenFee;
  const cartFeePerPlayer  = resolvedCartFeeOverride  ?? teeTimeFull.cartFee;
  const wantsCart = teeTimeFull.course.cartRequired ? true : !!cartSelected;

  const greenFeeTotal  = Math.round(greenFeePerPlayer * players * 100);
  const cartFeeTotal   = wantsCart ? Math.round(cartFeePerPlayer * players * 100) : 0;

  let rangeBallsTotal = 0;
  const ballsSize = String(rangeBallsSize || '');
  if (teeTimeFull.course.hasDrivingRange && !teeTimeFull.course.rangeBallsFree && ballsSize) {
    const priceMap: Record<string, number> = {
      small: teeTimeFull.course.rangeBallsSmallPrice,
      medium: teeTimeFull.course.rangeBallsMediumPrice,
      large: teeTimeFull.course.rangeBallsLargePrice,
    };
    rangeBallsTotal = Math.round((priceMap[ballsSize] || 0) * 100);
  }

  const accessFeeTotal = ACCESS_FEE_CENTS * players;
  const totalCents     = greenFeeTotal + cartFeeTotal + rangeBallsTotal + accessFeeTotal;
  const cancellationFeeTotal = Math.round((teeTimeFull.course.lateCancellationFee || 0) * 100);

  // Stripe card attachment — happens BEFORE the claim transaction so the DB
  // transaction stays pure (no network I/O). If the claim subsequently fails,
  // the card is attached to the customer but no booking exists — harmless.
  let savedCustomerId = '';
  let savedPaymentMethodId = '';
  if (teeTimeFull.course.stripeAccountActive && paymentMethodId && customerId) {
    try {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
      savedCustomerId = customerId;
      savedPaymentMethodId = paymentMethodId;
    } catch (attachErr) {
      if (attachErr instanceof Stripe.errors.StripeError) {
        return NextResponse.json({ error: attachErr.message || 'Your card could not be saved.' }, { status: 402 });
      }
      return NextResponse.json({ error: 'Your card could not be saved. Please check your details and try again.' }, { status: 402 });
    }
  }

  // Atomically claim the tee time (Serializable isolation prevents double-booking)
  let claimed: { id: string; checkInToken: string | null };
  try {
    claimed = await claimTeeTime({
      teeTimeId,
      courseId:         teeTimeFull.courseId,
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
      termsAcceptedAt:  new Date(),
      termsVersion:     CURRENT_TERMS_VERSION,
    });
  } catch (err) {
    if (err instanceof TeeTimeClaimError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });
      if (err.code === 'BLOCKED')   return NextResponse.json({ error: 'This tee time is no longer available.' }, { status: 409 });
      if (err.code === 'FULL' || err.code === 'CONFLICT') {
        return NextResponse.json({ error: 'That time just filled up. Please refresh and try again.' }, { status: 409 });
      }
      if (err.code === 'SPOTS') {
        const left = err.spotsLeft ?? 0;
        return NextResponse.json({ error: `Only ${left} spot${left === 1 ? '' : 's'} left for this tee time.` }, { status: 409 });
      }
    }
    console.error(JSON.stringify({ ev: 'booking.claim.fail', teeTimeId, players, error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: 'Something went wrong processing your booking. Please try again.' }, { status: 500 });
  }

  console.log(JSON.stringify({ ev: 'booking.created', bookingId: claimed.id, teeTimeId, players, totalCents, hasCard: !!savedPaymentMethodId }));

  // Send confirmation emails (fire-and-forget)
  try {
    const emailData = {
      golferName,
      golferEmail,
      courseName:    teeTimeFull.course.name,
      courseSlug:    teeTimeFull.course.slug,
      courseAddress: `${teeTimeFull.course.address || ''}, ${teeTimeFull.course.city}, ${teeTimeFull.course.state}`,
      date:          teeTimeFull.date,
      time:          teeTimeFull.time,
      holes:         teeTimeFull.holes,
      players,
      appliedRate,
      greenFeeTotal,
      cartFeeTotal,
      rangeBallsTotal,
      accessFeeTotal,
      totalAmount:    totalCents,
      cancellationFeeTotal,
      cancellationHours: teeTimeFull.course.cancellationHours,
      bookingId: claimed.id,
      checkInToken: claimed.checkInToken || undefined,
      noCard: !savedPaymentMethodId,
    };
    await sendBookingConfirmation(emailData);
    if (teeTimeFull.course.operator?.email) {
      await sendOperatorBookingNotification({ ...emailData, operatorEmail: teeTimeFull.course.operator.email });
    }

    const tz = teeTimeFull.course.timezone || 'America/New_York';
    const teeUtcMs = teeToUtcMs(teeTimeFull.date, teeTimeFull.time, tz);
    const cutoffMs = teeUtcMs - teeTimeFull.course.cancellationHours * 3600 * 1000;
    const minsUntilCutoff = (cutoffMs - Date.now()) / 60000;

    if (cancellationFeeTotal > 0 && savedPaymentMethodId) {
      if (minsUntilCutoff < 75) {
        await sendCancellationWarningEmail({
          golferName,
          golferEmail,
          courseName: teeTimeFull.course.name,
          date: teeTimeFull.date,
          time: teeTimeFull.time,
          feeAmount: cancellationFeeTotal,
          bookingId: claimed.id,
          cancellationHours: teeTimeFull.course.cancellationHours,
          checkInToken: claimed.checkInToken,
        }).catch(console.error);
      }
    } else if (!savedPaymentMethodId && minsUntilCutoff < 165) {
      await sendCheckInAvailableEmail({
        golferName,
        golferEmail,
        courseName: teeTimeFull.course.name,
        date: teeTimeFull.date,
        time: teeTimeFull.time,
        bookingId: claimed.id,
        checkInToken: claimed.checkInToken || undefined,
      }).catch(console.error);
    }
  } catch (err) {
    console.error('Email error:', err);
  }

  return NextResponse.json({
    bookingId:      claimed.id,
    appliedRate,
    memberRate:     appliedTierName !== 'standard',
    greenFeeTotal:  greenFeeTotal  / 100,
    cartFeeTotal:   cartFeeTotal   / 100,
    rangeBallsTotal: rangeBallsTotal / 100,
    accessFeeTotal: accessFeeTotal / 100,
    totalAmount:    totalCents     / 100,
    cancellationFeeTotal: cancellationFeeTotal / 100,
    cancellationHours: teeTimeFull.course.cancellationHours,
    courseName:     teeTimeFull.course.name,
    date:           teeTimeFull.date,
    time:           teeTimeFull.time,
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

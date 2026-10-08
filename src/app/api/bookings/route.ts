import { NextRequest, NextResponse } from 'next/server';
import { applyTierRates } from '@/lib/tier-rates';
import { isPastIn } from '@/lib/course-time';
import Stripe from 'stripe';
import { describePolicy, policyFrom, cardRequired, lateFeeTotalCents, noShowTotalCents as noShowFeeCents } from '@/lib/cancel-policy';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { centsToDollars } from '@/lib/money';
import { getGolferSession } from '@/lib/auth';
import { getMemberSession, getGolferMembership } from '@/lib/member-session';
import { stripe, ACCESS_FEE_CENTS } from '@/lib/stripe';
import { sendBookingConfirmation, sendOperatorBookingNotification, sendCancellationWarningEmail, sendCheckInAvailableEmail } from '@/lib/email';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { claimTeeTime, TeeTimeClaimError } from '@/lib/claim-tee-time';
import { windowFor, withinWindow } from '@/lib/booking-window';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teeTimeId, players: playersRaw, golferName, golferEmail, golferPhone, setupIntentId, cartSelected, rangeBallsSize, termsAccepted } = body;

  if (!teeTimeId || !playersRaw || !golferName || !golferEmail)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  // Security review: `players` was only truthiness-checked, so a negative
  // count passed the capacity test and REWOUND playersBooked (a full slot
  // resold), and wrote negative totals. An integer between 1 and 8, or nothing.
  const players = Number(playersRaw);
  if (!Number.isInteger(players) || players < 1 || players > 8)
    return NextResponse.json({ error: 'Invalid player count.' }, { status: 400 });

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
      product: { select: { label: true } },
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

  // Reject bookings for tee times that have already started — on the course's clock (SD-3).
  if (isPastIn(teeTimeFull.course.timezone, teeTimeFull.date, teeTimeFull.time)) {
    return NextResponse.json({ error: 'This tee time has already passed.' }, { status: 409 });
  }

  // Membership tier lookup — check golfer session first, then member session
  let resolvedGreenFeeOverride: number | null = null;
  let resolvedCartFeeOverride: number | null = null;
  // BOOKING WINDOWS: the recognized membership (tier or tierless) decides how
  // far ahead this booking may reach; null = the public window.
  let viewerMembership: { tier: { advanceBookingDays: number } | null } | null = null;
  if (golferSession) {
    // G5b: matches by direct golferId link OR the golfer's OTP-verified email
    // against an invite-only membership — same recognition as the course page.
    const golferMembership = await getGolferMembership(teeTimeFull.courseId);
    const membership = golferMembership
      ? await prisma.courseMembership.findUnique({ where: { id: golferMembership.membershipId }, include: { tier: true } })
      : null;
    if (membership) viewerMembership = { tier: membership.tier };
    if (membership?.tier) {
      const rates = applyTierRates(teeTimeFull, membership.tier);
      resolvedGreenFeeOverride = rates.greenFeeCents;
      resolvedCartFeeOverride  = rates.cartFeeCents;
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
      if (membership && membership.status === 'active' && !viewerMembership) viewerMembership = { tier: membership.tier };
      if (membership?.tier && membership.status === 'active') {
        const rates = applyTierRates(teeTimeFull, membership.tier);
        resolvedGreenFeeOverride = rates.greenFeeCents;
        resolvedCartFeeOverride  = rates.cartFeeCents;
        appliedTierName = membership.tier.name;
        appliedRate     = membership.tier.name;
      }
    }
  }

  // BOOKING WINDOWS: enforced at creation, not only in the picker — a crafted
  // request for a date past the viewer's window is refused like a past one.
  const bookingWindow = windowFor(teeTimeFull.course, viewerMembership);
  if (!withinWindow(teeTimeFull.date, bookingWindow.days)) {
    return NextResponse.json({
      error: bookingWindow.scope === 'member'
        ? `That date isn’t open yet — your membership lets you book up to ${bookingWindow.days} days ahead.`
        : `That date isn’t open for booking yet — golfers can book up to ${bookingWindow.days} days ahead${teeTimeFull.course.hasMemberPricing ? '; members can book earlier' : ''}.`,
      code: 'outside_window', windowDays: bookingWindow.days,
    }, { status: 403 });
  }

  // Compute fees
  // MP-3 B2c: cents in, cents out. The x100 that used to live here is gone —
  // per-player rates are already cents, so the total is a plain multiply and
  // there is no float in the money path at all.
  const greenFeePerPlayerCents = resolvedGreenFeeOverride ?? teeTimeFull.greenFeeCents;
  const cartFeePerPlayerCents  = resolvedCartFeeOverride  ?? teeTimeFull.cartFeeCents;
  const wantsCart = teeTimeFull.course.cartRequired ? true : !!cartSelected;

  const greenFeeTotal  = greenFeePerPlayerCents * players;
  const cartFeeTotal   = wantsCart ? cartFeePerPlayerCents * players : 0;

  let rangeBallsTotal = 0;
  const ballsSize = String(rangeBallsSize || '');
  if (teeTimeFull.course.hasDrivingRange && !teeTimeFull.course.rangeBallsFree && ballsSize) {
    // MP-3 B2b: these are CENTS now, so the x100 that used to convert them is
    // gone. Leaving it would have charged 100x for range balls.
    const priceMapCents: Record<string, number> = {
      small: teeTimeFull.course.rangeBallsSmallPriceCents,
      medium: teeTimeFull.course.rangeBallsMediumPriceCents,
      large: teeTimeFull.course.rangeBallsLargePriceCents,
    };
    rangeBallsTotal = priceMapCents[ballsSize] || 0;
  }

  const accessFeeTotal = ACCESS_FEE_CENTS * players;
  const totalCents     = greenFeeTotal + cartFeeTotal + rangeBallsTotal + accessFeeTotal;
  // MP-3 B2b: also cents now. Booking.cancellationFeeTotal and
  // Course.lateCancellationFeeCents finally hold the same fee in the same unit.
  // SP-B: the course's policy decides the fee (per booking or per player), the
  // timing, the no-show fee — and whether a card is asked for at all. All of it
  // is copied onto the booking so a later policy change never reaches it.
  const policy = policyFrom(teeTimeFull.course);
  const needsCard = cardRequired(policy);
  const cancellationFeeTotal = lateFeeTotalCents(policy, players);
  const noShowFeeTotal = noShowFeeCents(policy, players);

  // Stripe card attachment — happens BEFORE the claim transaction so the DB
  // transaction stays pure (no network I/O). If the claim subsequently fails,
  // the card is attached to the customer but no booking exists — harmless.
  let savedCustomerId = '';
  let savedPaymentMethodId = '';
  // SP-B (Cam 2026-10-05, reverses FB-3's "every booking saves a card"): a
  // card is required only when the course's policy can charge it — a late or a
  // no-show fee. Otherwise the golfer books with no card and pays at check-in
  // (the pay-link email at checkInWindowHours), and GreenReserve's fee is
  // collected then. Enforced here, not only on the page.
  // SEC-1: the card and customer are read from STRIPE, never from the request.
  // The page posts only the SetupIntent it just confirmed; the SetupIntent
  // (created server-side in ./setup-intent) names its own customer and card.
  if (needsCard && (typeof setupIntentId !== 'string' || !/^seti_[A-Za-z0-9]+$/.test(setupIntentId))) {
    return NextResponse.json({ error: 'Please add a card to hold your tee time — you won’t be charged today. If this page looks out of date, refresh it.' }, { status: 400 });
  }
  if (needsCard) try {
    const si = await stripe.setupIntents.retrieve(setupIntentId as string, { expand: ['payment_method'] });
    const siCustomer = typeof si.customer === 'string' ? si.customer : si.customer?.id;
    const pm = si.payment_method && typeof si.payment_method !== 'string' ? si.payment_method : null;
    if (si.status !== 'succeeded' || !siCustomer || !pm) {
      return NextResponse.json({ error: 'Your card was not saved. Please enter it again.' }, { status: 402 });
    }
    // A confirmed SetupIntent with a customer attaches the card itself; attach
    // only if Stripe has not (never onto a different customer).
    const pmCustomer = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
    if (pmCustomer && pmCustomer !== siCustomer) {
      return NextResponse.json({ error: 'Your card could not be saved. Please enter it again.' }, { status: 402 });
    }
    if (!pmCustomer) await stripe.paymentMethods.attach(pm.id, { customer: siCustomer });
    await stripe.customers.update(siCustomer, { invoice_settings: { default_payment_method: pm.id } });
    savedCustomerId = siCustomer;
    savedPaymentMethodId = pm.id;
  } catch (attachErr) {
    if (attachErr instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: attachErr.message || 'Your card could not be saved.' }, { status: 402 });
    }
    return NextResponse.json({ error: 'Your card could not be saved. Please check your details and try again.' }, { status: 402 });
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
      // SD-5: the window this golfer agreed to, whatever the course changes later.
      source:           'online',
      cancellationHoursAtBooking: teeTimeFull.course.cancellationHours,
      lateFeeTimingAtBooking: policy.lateFeeTiming,
      noShowFeeTotal,
      autoNoShowMinutesAtBooking: policy.autoNoShowMinutes,
      termsAcceptedAt:  new Date(),
      termsVersion:     CURRENT_TERMS_VERSION,
    }, { type: 'golfer', id: golferSession?.golferId ?? null });
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
      productLabel:  teeTimeFull.product?.label ?? null,
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
      policyLines: describePolicy(policy).lines,
      confirmationNote: teeTimeFull.course.confirmationNote,
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
      // R-GOLF-009: only while the window is still open — booked inside it, there
      // is no "closes within the next hour" to warn about.
      if (minsUntilCutoff > 0 && minsUntilCutoff < 75) {
        await sendCancellationWarningEmail({
          golferName,
          golferEmail,
          courseName: teeTimeFull.course.name,
          courseSlug: teeTimeFull.course.slug,
          date: teeTimeFull.date,
          time: teeTimeFull.time,
          feeAmount: cancellationFeeTotal,
          bookingId: claimed.id,
          cancellationHours: teeTimeFull.course.cancellationHours,
          checkInToken: claimed.checkInToken,
          lateFeeTiming: policy.lateFeeTiming,
        }).catch(console.error);
      }
    } else if (cancellationFeeTotal <= 0 && minsUntilCutoff < 165) {
      // FB-3: keyed on the course having no hold fee, not on a missing card —
      // every booking saves a card now.
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

  // R-GOLF-009: the confirmation must not say "free to cancel until" a past time.
  const cutoffPassed = teeToUtcMs(teeTimeFull.date, teeTimeFull.time, teeTimeFull.course.timezone || 'America/New_York')
    - teeTimeFull.course.cancellationHours * 3600 * 1000 <= Date.now();

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
    lateFeeTiming:  policy.lateFeeTiming,
    cutoffPassed,
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
      teeTime: { select: { date: true, time: true, holes: true, product: { select: { label: true } } } },
      course:  { select: { name: true, city: true, state: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(bookings);
}

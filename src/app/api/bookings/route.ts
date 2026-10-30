import { NextRequest, NextResponse } from 'next/server';
import { onlineBookingBlock } from '@/lib/golfer-record';
import { applyTierRates } from '@/lib/tier-rates';
import { membershipLive, memberPlayers, splitTotal, memberSpot } from '@/lib/member-rates';
import { groupGreenFee } from '@/lib/residents';
import { applyPromo, reserveUse, releaseUse, seatAfter, NOTHING_OFF, type PromoRow } from '@/lib/promo-codes';
import { isPastIn } from '@/lib/course-time';
import Stripe from 'stripe';
import { describePolicy, policyFrom, cardAtBooking, lateFeeTotalCents, noShowTotalCents as noShowFeeCents } from '@/lib/cancel-policy';
import { FEE_AT_BOOKING_ON } from '@/lib/booking-fees';
import { chargeBookingFee, releaseUnpaidBooking } from '@/lib/booking-fee';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { centsToDollars } from '@/lib/money';
import { getGolferSession } from '@/lib/auth';
import { getMemberSession, getGolferMembership, golferResident } from '@/lib/member-session';
import { stripe, ACCESS_FEE_CENTS } from '@/lib/stripe';
import { sendBookingConfirmation, sendOperatorBookingNotification, sendCancellationWarningEmail, sendCheckInAvailableEmail } from '@/lib/email';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { claimTeeTime, TeeTimeClaimError } from '@/lib/claim-tee-time';
import { windowFor, withinWindow } from '@/lib/booking-window';
import { rulesFor, groupSizeError, walkingAllowedAt } from '@/lib/booking-rules';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teeTimeId, players: playersRaw, golferName, golferEmail, golferPhone, setupIntentId, cartSelected, rangeBallsSize, termsAccepted, promoCode } = body;

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

  // Launch security review 2026-10-18: no limit let one script book a course's
  // whole sheet (no card is needed at a no-fee course) and send a confirmation
  // email to any address. Per IP and per email, like setup-intent.
  if (!(await rateLimit(`booking:${clientIp(req)}`, 30, 3600))
    || !(await rateLimit(`booking-email:${String(golferEmail).trim().toLowerCase()}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many bookings in a short time. Wait a while and try again, or call the course.' }, { status: 429 });
  }

  const golferSession = await getGolferSession();
  let appliedRate = 'standard';
  let appliedTierName = 'standard';
  let appliedTier: { guestsPayMemberRate: boolean } | null = null;

  // Prefetch the tee time + course data (outside the claim transaction — rates
  // are stable; the claim transaction re-reads capacity under serializable isolation)
  const teeTimeFull = await prisma.teeTime.findUnique({
    where: { id: teeTimeId },
    include: {
      course: { include: { operator: { select: { email: true } } } },
      product: { select: { label: true, walkingPolicy: true, minPlayers: true, maxPlayers: true, publicAdvanceDays: true } },
    },
  });
  if (!teeTimeFull) return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });
  // Same visibility as the public course page (loadPublicCourse): a course being
  // built, paused or archived takes no online bookings.
  const c0 = teeTimeFull.course;
  if (!c0.active || c0.liveStatus !== 'live' || c0.archivedAt) return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });

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

  // W2-6 slice 3: the course's booking rules, or the round's own (lib/booking-rules).
  const rules = rulesFor(teeTimeFull.course, teeTimeFull.product);
  const sizeError = groupSizeError(rules, players);
  if (sizeError) return NextResponse.json({ error: sizeError, code: 'group_size', minPlayers: rules.minPlayers, maxPlayers: rules.maxPlayers }, { status: 400 });

  // Membership tier lookup — check golfer session first, then member session
  let resolvedGreenFeeOverride: number | null = null;
  let resolvedCartFeeOverride: number | null = null;
  // BOOKING WINDOWS: the recognized membership (tier or tierless) decides how
  // far ahead this booking may reach; null = the public window.
  let viewerMembership: { tier: { advanceBookingDays: number } | null } | null = null;
  if (golferSession) {
    // G5b: matches by direct golferId link OR the golfer's OTP-verified email
    // against an invite-only membership — same recognition as the course page.
    const golferMembership = await getGolferMembership(teeTimeFull.courseId, teeTimeFull.course);
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
      appliedTier     = membership.tier;
    }
  }
  if (!resolvedGreenFeeOverride) {
    const memberSession = await getMemberSession();
    if (memberSession && memberSession.courseId === teeTimeFull.courseId) {
      const membership = await prisma.courseMembership.findUnique({
        where: { id: memberSession.membershipId },
        include: { tier: true },
      });
      // A lapsed membership (past its end date + the course's grace days) gets public rates and the public window.
      const live = !!membership && membership.courseId === teeTimeFull.courseId && membershipLive(membership, teeTimeFull.course);
      if (live && !viewerMembership) viewerMembership = { tier: membership!.tier };
      if (live && membership!.tier) {
        const rates = applyTierRates(teeTimeFull, membership!.tier);
        resolvedGreenFeeOverride = rates.greenFeeCents;
        resolvedCartFeeOverride  = rates.cartFeeCents;
        appliedTierName = membership!.tier.name;
        appliedRate     = membership!.tier.name;
        appliedTier     = membership!.tier;
      }
    }
  }

  // BOOKING WINDOWS: enforced at creation, not only in the picker — a crafted
  // request for a date past the viewer's window is refused like a past one.
  // A round may set its own public window; a member never sees less than the public.
  const baseWindow = windowFor({ ...teeTimeFull.course, publicAdvanceDays: rules.publicAdvanceDays }, viewerMembership);
  const bookingWindow = baseWindow.scope === 'member' ? { ...baseWindow, days: Math.max(baseWindow.days, rules.publicAdvanceDays) } : baseWindow;
  if (!withinWindow(teeTimeFull.date, bookingWindow.days, new Date(), teeTimeFull.course.timezone)) {
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
  // Cam 2026-10-29: the member pays the member rate; guests pay the public rate unless the tier says otherwise.
  const memberN = memberPlayers(players, appliedTier);
  // A cart is required when this tee time can't be walked (its price-table cell, CART-1).
  const wantsCart = walkingAllowedAt(teeTimeFull) ? !!cartSelected : true;

  // RES-1: a signed-in golfer on the course's resident list pays the resident
  // rate for one player — themselves. A member rate is never combined with it.
  const resident = appliedTierName === 'standard' && teeTimeFull.residentRateCents != null
    ? await golferResident(teeTimeFull.courseId, teeTimeFull.date) : null;
  // PRICE-1 (Cam 2026-10-30): a promo code comes off the green fee, SEAT BY SEAT — the member's
  // spot, the resident and each other player each pay their own rate less the code — so the
  // per-seat rates kept on the booking add up to its total and keep the discount through a
  // partial check-in or a party change. Checked here, before any card is saved; its use is
  // reserved just before the tee time is claimed.
  let promoRow: PromoRow | null = null;
  if (promoCode !== undefined && promoCode !== null && String(promoCode).trim() !== '') {
    const p = await applyPromo(teeTimeFull.courseId, promoCode, { date: teeTimeFull.date, time: teeTimeFull.time, rateApplied: !!appliedTier || !!resident, golferEmail: String(golferEmail) });
    if (!p.ok) return NextResponse.json({ error: p.error, code: 'promo' }, { status: 400 });
    promoRow = p.code;
  }
  const seat = (c: number) => (promoRow ? seatAfter(promoRow, c) : c);
  const ratedGreenFeeTotal = appliedTier ? splitTotal(players, memberN, greenFeePerPlayerCents, teeTimeFull.greenFeeCents)
    : groupGreenFee(players, greenFeePerPlayerCents, resident ? 1 : 0, teeTimeFull.residentRateCents).greenFeeTotal;
  const priced = groupGreenFee(players, seat(greenFeePerPlayerCents), resident ? 1 : 0, teeTimeFull.residentRateCents == null ? null : seat(teeTimeFull.residentRateCents));
  const greenFeeTotal = appliedTier ? splitTotal(players, memberN, seat(greenFeePerPlayerCents), seat(teeTimeFull.greenFeeCents)) : priced.greenFeeTotal;
  if (priced.residentPlayers > 0) appliedRate = 'resident';
  const promo = promoRow ? { id: promoRow.id, discountCents: ratedGreenFeeTotal - greenFeeTotal } : null;
  if (promo && promo.discountCents <= 0) return NextResponse.json({ error: NOTHING_OFF, code: 'promo' }, { status: 400 });
  const cartFeeTotal   = wantsCart ? (appliedTier ? splitTotal(players, memberN, cartFeePerPlayerCents, teeTimeFull.cartFeeCents) : cartFeePerPlayerCents * players) : 0;

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
  // Golfer record (Cam 2026-10-29): the owner's block, or the course's no-show / late-cancel rule,
  // stops booking online — before a card is saved or a seat taken. The counter still books them.
  const onlineBlock = await onlineBookingBlock(teeTimeFull.courseId, { golferEmail: String(golferEmail ?? ''), golferPhone: String(golferPhone ?? ''), golferAccountId: golferSession?.golferId ?? null });
  if (onlineBlock) return NextResponse.json({ error: onlineBlock }, { status: 403 });
  const policy = policyFrom(teeTimeFull.course);
  // FEE-AT-BOOKING: with GreenReserve's fee charged at booking, every online booking takes a card.
  const needsCard = cardAtBooking(policy);
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
    return NextResponse.json({ error: FEE_AT_BOOKING_ON ? 'Please add a card to book this tee time — only the booking fee is charged today. If this page looks out of date, refresh it.' : 'Please add a card to hold your tee time — you won’t be charged today. If this page looks out of date, refresh it.' }, { status: 400 });
  }
  if (needsCard) try {
    const si = await stripe.setupIntents.retrieve(setupIntentId as string, { expand: ['payment_method'] });
    const siCustomer = typeof si.customer === 'string' ? si.customer : si.customer?.id;
    const pm = si.payment_method && typeof si.payment_method !== 'string' ? si.payment_method : null;
    if (si.status !== 'succeeded' || !siCustomer || !pm) {
      return NextResponse.json({ error: 'Your card was not saved. Please enter it again.' }, { status: 402 });
    }
    // One saved card holds one booking: the page makes a new SetupIntent for
    // every booking, so a second use is a script reusing one (empty) card.
    if (!(await rateLimit(`booking-seti:${si.id}`, 1, 30 * 86400))) {
      return NextResponse.json({ error: 'Please enter your card again to hold this tee time.' }, { status: 402 });
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

  // PRICE-1: take one of the code's uses now; given back if the booking isn't made.
  if (promo && !(await reserveUse(promo.id))) return NextResponse.json({ error: 'That code has just been used up.', code: 'promo' }, { status: 409 });
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
      ...(promo ? { promoCodeId: promo.id, promoDiscountCents: promo.discountCents } : {}),
      residentPlayers:  priced.residentPlayers,
      residentRateCents: priced.residentRateCents,
      // The member's own spot when guests pay the public rate (lib/member-rates partyFees).
      ...memberSpot(appliedTier, { greenFeeCents: seat(greenFeePerPlayerCents), cartFeeCents: cartFeePerPlayerCents }),
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
    if (promo) await releaseUse(promo.id);
    if (err instanceof TeeTimeClaimError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });
      if (err.code === 'BLOCKED')   return NextResponse.json({ error: 'This tee time is no longer available.' }, { status: 409 });
      if (err.code === 'PAST')      return NextResponse.json({ error: 'This tee time has already gone off.' }, { status: 409 });
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

  // FEE-AT-BOOKING (Cam 2026-10-24): GreenReserve's fee is charged now, to the card just saved.
  // Declined → the tee time goes back and nothing was charged; the golfer tries another card.
  if (FEE_AT_BOOKING_ON && accessFeeTotal > 0) {
    const fee = await chargeBookingFee(claimed.id);
    if (!fee.ok) {
      await releaseUnpaidBooking(claimed.id);
      if (promo) await releaseUse(promo.id);
      return NextResponse.json({ error: `The booking fee couldn’t be charged: ${fee.error} Your tee time wasn’t booked — try another card.` }, { status: 402 });
    }
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
      feePaidAtBooking: FEE_AT_BOOKING_ON && accessFeeTotal > 0,
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
    residentPlayers: priced.residentPlayers,
    greenFeeTotal:  greenFeeTotal  / 100,
    promoDiscount:  (promo?.discountCents ?? 0) / 100,
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

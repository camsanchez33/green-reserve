import { NextRequest, NextResponse } from 'next/server';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from '@/lib/booking-events';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, can, requirePermission } from '@/lib/session';
import type { PermissionKey } from '@/lib/staff-permissions';
import { performCancellation } from '@/lib/cancel-booking';
import { performCheckIn } from '@/lib/checkin-booking';
import { claimTeeTime, TeeTimeClaimError } from '@/lib/claim-tee-time';
import { sendBookingConfirmation, sendCheckInAvailableEmail, isPlaceholderEmail } from '@/lib/email';
import { todayIn, isPastIn } from '@/lib/course-time';
import { randomUUID } from 'crypto';
import { chargeAccessFeeSeparately, refundSeparateAccessFee, liveSeparateFee, type FeeChargeResult } from '@/lib/access-fee';
import { refundOnConnectedAccount } from '@/lib/stripe';
import { markNoShow, refundNoShowFee } from '@/lib/no-show-fee';
import { sendSms } from '@/lib/twilio';
import { normalizePhone } from '@/lib/golfer-otp';
import { formatTeeTime } from '@/lib/format';

// Used by both the Payments tab (all bookings, transaction ledger) and the
// Cancellations tab (status=cancelled) — one endpoint, filtered by query param.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // SP-A: the full ledger needs "See payments". A login with only "See
  // cancellations" gets what the Cancellations tab uses — confirmed and
  // cancelled bookings — with the payment amounts taken out (below).
  const seesPayments = can(session, 'money.payments');
  if (!seesPayments) { const denied = requirePermission(session, 'money.cancellations'); if (denied) return denied; }
  const asked = req.nextUrl.searchParams.get('status') || undefined;
  const status = seesPayments ? asked : (asked === 'cancelled' || asked === 'confirmed' ? asked : { in: ['confirmed', 'cancelled'] });
  const date = req.nextUrl.searchParams.get('date') || undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      courseId: session.courseId,
      ...(status ? { status } : {}),
      ...(date ? { teeTime: { date } } : {}),
    },
    // SD-8 review (MEDIUM): this used to ship WHOLE booking rows to the
    // browser — up to 200 of them — including `checkInToken`, the bearer token
    // behind /checkin/[id]?token=... that triggers a real card charge, plus the
    // Stripe customer/payment-method/intent ids. None of it was rendered. The
    // relation was already select-ed; the booking itself never was.
    select: {
      id: true, golferName: true, golferEmail: true, golferPhone: true, players: true,
      appliedRate: true, greenFeeTotal: true, cartFeeTotal: true, cartSelected: true,
      rangeBallsTotal: true, accessFeeTotal: true, totalAmount: true,
      cancellationFeeTotal: true, cancellationFeeChargedAt: true, cancelledAt: true,
      checkedInAt: true, paymentStatus: true, status: true, createdAt: true,
      teeTime: { select: { date: true, time: true, holes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: date ? undefined : 200,
  });

  // SP-A: contact details only with "See golfer email and phone"; payment
  // amounts only with "See payments" (the late fee stays — it IS the cancellation).
  const contact = can(session, 'sheet.golfer_contact');
  return NextResponse.json(bookings.map(b => ({
    ...b,
    ...(contact ? {} : { golferEmail: '', golferPhone: '' }),
    ...(seesPayments ? {} : { greenFeeTotal: 0, cartFeeTotal: 0, rangeBallsTotal: 0, accessFeeTotal: 0, totalAmount: 0 }),
  })));
}

// Lets the operator cancel a booking on a golfer's behalf (e.g. a phone-call
// cancellation), or check a golfer in and charge them for their round —
// staff-side counterpart to the golfer's self-checkin link.
export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action, paymentMethodId, checkedInPlayers: cipRaw, waiveFee: waiveRaw, via: viaRaw } = await req.json();
  const waiveFee = action === 'cancel' && waiveRaw === true;
  // SD-5: partial party — how many actually showed (1 .. players-1); absent = all.
  const cip = cipRaw == null ? undefined : Number(cipRaw);
  if (cip !== undefined && (!Number.isInteger(cip) || cip < 1)) return NextResponse.json({ error: 'Invalid headcount.' }, { status: 400 });
  const ACTIONS = ['cancel', 'checkin', 'no_show', 'still_coming', 'paid_offline', 'send_pay_link'];
  if (!id || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Missing id or unsupported action' }, { status: 400 });
  }
  // SP-A: each counter action is its own permission.
  const NEEDS: Record<string, PermissionKey> = { cancel: 'sheet.cancel', checkin: 'sheet.checkin', no_show: 'sheet.no_show', still_coming: 'sheet.no_show', paid_offline: 'sheet.counter_payment', send_pay_link: 'sheet.checkin' };
  const deniedAction = requirePermission(session, NEEDS[action]);
  if (deniedAction) return deniedAction;
  // SP-A: cancelling WITHOUT the late fee refunds a hold already taken — its own permission.
  if (waiveFee) { const d = requirePermission(session, 'sheet.waive_fee'); if (d) return d; }

  const booking = await prisma.booking.findUnique({ where: { id }, select: { courseId: true, status: true, paymentStatus: true, noShowAt: true, players: true, cancellationFeeChargeId: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true, stripeAccountId: true } }, totalAmount: true, checkedInPlayers: true } });
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
  // FB-3 (Cam 2026-09-29): a no-show or a counter-paid round never reaches the
  // check-in charge that carries GreenReserve's $1.50/player, so the fee is
  // charged on its own here (lib/access-fee.ts). The staff action never waits
  // on it or fails because of it — the tee sheet is told what happened.
  const actorName = session.email;
  // EV-1: every counter action below is DB-only, so its event is written in the
  // same transaction as the state change.
  const staff: EventActor = { type: 'staff', id: session.staffId ?? session.operatorId };
  const evBase = { bookingId: id as string, courseId: booking.courseId, actor: staff, teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time) };
  // SP-B (Cam 2026-10-05: "push them to the pay link"): a golfer who booked
  // without a card pays through their check-in link — the round and
  // GreenReserve's fee in one charge — rather than at the counter, where the
  // fee can't be collected. Staff can (re)send that link from the sheet.
  if (action === 'send_pay_link') {
    // PAY-1 (Cam 2026-10-06: "the text link with apple pay"): the counter can
    // TEXT the link — the golfer standing there pays on their own phone (Apple
    // Pay / Google Pay / card), nobody types a card. Counter and phone bookings
    // ('manual') qualify too; one booked without an email has no token yet, so
    // it gets one here.
    const via = viaRaw === 'sms' ? 'sms' : 'email';
    const b = await prisma.booking.findUnique({ where: { id }, select: { golferName: true, golferEmail: true, golferPhone: true, checkInToken: true, status: true, course: { select: { name: true } }, teeTime: { select: { date: true, time: true } } } });
    if (!b || b.status !== 'confirmed') return NextResponse.json({ error: 'Only a confirmed booking can be sent a pay link.' }, { status: 409 });
    if (via === 'sms') {
      const digits = (b.golferPhone || '').replace(/\D/g, '');
      if (digits.length < 10) return NextResponse.json({ error: 'There’s no mobile number on this booking — take payment at the counter.' }, { status: 409 });
      let token = b.checkInToken;
      if (!token) {
        token = randomUUID();
        await prisma.booking.update({ where: { id }, data: { checkInToken: token } });
      }
      const to = normalizePhone(b.golferPhone);
      const url = `${process.env.NEXT_PUBLIC_URL}/checkin/${id}?token=${token}`;
      try {
        await sendSms(to, `${b.course.name}: check in and pay for your ${formatTeeTime(b.teeTime.time)} tee time here (Apple Pay, Google Pay or card): ${url}`);
      } catch (err) {
        return NextResponse.json({ error: `The text didn’t send (${err instanceof Error ? err.message : 'SMS error'}) — try email, or take payment at the counter.` }, { status: 502 });
      }
      return NextResponse.json({ success: true, sentTo: `${to.slice(0, -4).replace(/\d/g, '•')}${to.slice(-4)}` });
    }
    if (!b.checkInToken) return NextResponse.json({ error: 'This booking has no pay link — check them in at the counter.' }, { status: 409 });
    if (!b.golferEmail || isPlaceholderEmail(b.golferEmail)) return NextResponse.json({ error: 'There’s no email on this booking to send the link to — check them in at the counter.' }, { status: 409 });
    try {
      await sendCheckInAvailableEmail({ golferName: b.golferName, golferEmail: b.golferEmail, courseName: b.course.name, date: b.teeTime.date, time: b.teeTime.time, bookingId: id, checkInToken: b.checkInToken });
    } catch (err) {
      return NextResponse.json({ error: `The pay link didn’t send (${err instanceof Error ? err.message : 'email error'}) — try again or check them in at the counter.` }, { status: 502 });
    }
    return NextResponse.json({ success: true, sentTo: b.golferEmail });
  }
  if (action === 'no_show') {
    if (booking.status !== 'confirmed') return NextResponse.json({ error: 'Only a confirmed booking can be marked a no-show.' }, { status: 409 });
    // Review: a no-show now costs the golfer the booking fee, so it can only be
    // recorded once the tee time has actually passed.
    if (!isPastIn(booking.course.timezone, booking.teeTime.date, booking.teeTime.time)) {
      return NextResponse.json({ error: 'You can mark a no-show once their tee time has passed.' }, { status: 409 });
    }
    // SP-B: lib/no-show-fee — the same mark and charges as the automatic no-show.
    const r = await markNoShow(id, staff, { actorName });
    const courseNote = r.courseFee.charged ? `No-show fee of $${(r.courseFee.amountCents / 100).toFixed(2)} charged.`
      : r.courseFee.reason === 'no no-show fee on this booking' ? null : `The no-show fee could not be charged (${r.courseFee.reason}).`;
    return NextResponse.json({ success: true, noShowAt: new Date().toISOString(), fee: [feeNote(r.fee), courseNote].filter(Boolean).join(' ') || null });
  }
  if (action === 'still_coming') {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { noShowAt: null } });
      // Only a real reversal is an event — clearing a mark that was never set is not.
      if (booking.noShowAt) await recordBookingEvent(tx, { ...evBase, type: 'no_show_cleared', playerCount: booking.players });
    });
    // The no-show charges were taken in error — they are here after all.
    const r = await refundSeparateAccessFee(id, 'no-show marked in error (still coming)', 'operator', actorName);
    const c = await refundNoShowFee(id, actorName); // SP-B: the course's no-show fee too
    const notes = [r.ok ? null : `The booking fee could not be refunded (${r.error}) — GreenReserve will follow up.`, c.ok ? null : `The no-show fee could not be refunded (${c.error}) — refund it from Stripe.`].filter(Boolean);
    return NextResponse.json({ success: true, ...(notes.length ? { fee: notes.join(' ') } : {}) });
  }
  if (action === 'paid_offline') {
    if (booking.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 409 });
    if (booking.status === 'completed') return NextResponse.json({ error: 'Already checked in.' }, { status: 409 });
    // Review (HIGH): a round already charged by card (an admin "collect
    // payment") is paid — marking it paid offline would hide that payment and
    // take the booking fee a second time.
    if (booking.paymentStatus === 'paid') return NextResponse.json({ error: 'This round was already paid by card — check them in instead.' }, { status: 409 });
    const hadHoldFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;
    // This branch completes the booking WITHOUT performCheckIn (CLAUDE.md) —
    // so it writes its own checked_in event, or counter check-ins vanish from the log.
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { status: 'completed', checkedInAt: new Date(), paidAt: new Date(), paidOffline: true, paymentStatus: 'paid_offline', noShowAt: null, checkInFailReason: '', ...(cip !== undefined ? { checkedInPlayers: cip } : {}) },
      });
      await recordBookingEvent(tx, { ...evBase, type: 'checked_in', amountCents: booking.totalAmount, playerCount: cip ?? booking.players, metadata: { paidOffline: true } });
    });
    // They paid the round at the counter, so the hold fee the cron took after
    // the cutoff goes back — exactly as a card check-in refunds it (review: this
    // branch skips performCheckIn and kept it).
    let holdNote: string | null = null;
    if (hadHoldFee && booking.course.stripeAccountId) {
      try {
        const refund = await refundOnConnectedAccount({ paymentIntentId: booking.cancellationFeeChargeId as string, connectedAccountId: booking.course.stripeAccountId });
        await recordBookingEventSafe({ ...evBase, type: 'fee_refunded', amountCents: refund.amount, playerCount: booking.players, stripeId: refund.id, metadata: { reason: 'hold_refunded_at_checkin', paidOffline: true } });
      } catch (err) {
        holdNote = `The late-cancellation hold fee could not be refunded automatically (${err instanceof Error ? err.message : 'Stripe error'}) — GreenReserve will follow up.`;
      }
    }
    // A no-show fee taken for the whole party, then fewer players arrive and
    // pay at the counter: give it back and take the prorated fee instead.
    const live = await liveSeparateFee(id);
    if (live && cip !== undefined && cip < booking.players) {
      await refundSeparateAccessFee(id, `only ${cip} of ${booking.players} players came and paid at the counter`, 'operator', actorName);
    }
    const fee = await chargeAccessFeeSeparately(id, { why: 'paid_offline', players: cip, actor: 'operator', actorName });
    return NextResponse.json({ success: true, fee: [feeNote(fee), holdNote].filter(Boolean).join(' ') || null });
  }

  const result = action === 'cancel'
    ? await performCancellation(id, { type: 'staff', id: session.staffId ?? session.operatorId }, waiveFee ? { waiveFee: true } : {})
    : await performCheckIn(id, { type: 'staff', id: session.staffId ?? session.operatorId }, { ...(paymentMethodId ? { externalPaymentMethodId: paymentMethodId } : {}), ...(cip !== undefined ? { checkedInPlayers: cip } : {}) });
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
  const deniedWalkIn = requirePermission(session, 'sheet.walkin'); // SP-A
  if (deniedWalkIn) return deniedWalkIn;
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
  if (checkInNow) { const d = requirePermission(session, 'sheet.counter_payment'); if (d) return d; } // SP-A: checked in = paid at the counter
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
    }, { type: 'staff', id: session.staffId ?? session.operatorId });
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
        confirmationNote: teeTime.course.confirmationNote,
        checkInToken: claimed.checkInToken ?? undefined,
        noCard: true,
      });
      emailSent = true;
    } catch (e) { console.error('walk-in confirmation email failed:', e); emailSent = false; }
  }
  return NextResponse.json({ success: true, bookingId: claimed.id, emailSent });
}

/** What the tee sheet shows after a separate fee charge (null = nothing to say). */
function feeNote(r: FeeChargeResult): string | null {
  if (!r.ok) return `GreenReserve's booking fee could not be charged to the golfer's card (${r.error}). Nothing for you to do — we'll follow up.`;
  return null;
}


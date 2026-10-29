import { NextRequest, NextResponse } from 'next/server';
import { recordBookingEvent, teeTimeInstant, type EventActor } from '@/lib/booking-events';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, can, requirePermission } from '@/lib/session';
import type { PermissionKey } from '@/lib/staff-permissions';
import { performCancellation } from '@/lib/cancel-booking';
import { performCheckIn } from '@/lib/checkin-booking';
import { sendBookingConfirmation, sendCheckInAvailableEmail, sendBookingModifiedEmail, isPlaceholderEmail } from '@/lib/email';
import { moveBooking } from '@/lib/move-booking';
import { setBookingResidents } from '@/lib/booking-residents';
import { isPastIn, todayIn } from '@/lib/course-time';
import { randomUUID } from 'crypto';
import { refundSeparateAccessFee } from '@/lib/access-fee';
import { markNoShow, refundNoShowFee, roundPaid } from '@/lib/no-show-fee';
import { sendSms } from '@/lib/twilio';
import { normalizePhone } from '@/lib/golfer-otp';
import { formatTeeTime } from '@/lib/format';
import { createCounterBooking } from '@/lib/counter-pay';
import { ringUpCash } from '@/lib/register';
import { noFeeReason, type CancelRecord } from '@/lib/cancel-fee-reason';

// Used by both the Payments tab (all bookings, transaction ledger) and the
// Cancellations tab (status=cancelled) — one endpoint, filtered by query param.
/** Payments' played-rounds feed holds this many; the page says so when it is full (until the ledger rework). */
const PLAYED_CAP = 1000;

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
  // Revamp 3 audit (Cam 2026-10-29): Payments lists rounds already played, newest
  // tee time first. The default feed (newest 200 made) was mostly future rounds,
  // so "Not paid yet · 12 groups" opened a list of 2.
  const played = seesPayments && !date && req.nextUrl.searchParams.get('played') === '1';
  const courseToday = played ? todayIn((await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } }))?.timezone) : '';

  const bookings = await prisma.booking.findMany({
    where: {
      courseId: session.courseId,
      ...(status ? { status } : {}),
      ...(date ? { teeTime: { date } } : played ? { teeTime: { date: { lte: courseToday } } } : {}),
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
      checkedInAt: true, noShowAt: true, paymentStatus: true, status: true, createdAt: true,
      // Server-side only, for noFeeReason — stripped before the response.
      cancellationHoursAtBooking: true, source: true,
      teeTime: { select: { date: true, time: true, holes: true } },
    },
    orderBy: played ? [{ teeTime: { date: 'desc' } }, { teeTime: { time: 'desc' } }] : { createdAt: 'desc' },
    take: date ? undefined : played ? PLAYED_CAP : 200,
  });

  // SP-A: contact details only with "See golfer email and phone"; payment
  // amounts only with "See payments" (the late fee stays — it IS the cancellation).
  const contact = can(session, 'sheet.golfer_contact');
  // Cancellations say why no fee was kept, from what the cancel recorded (lib/cancel-fee-reason).
  const noFee = bookings.filter(b => b.status === 'cancelled' && b.paymentStatus !== 'cancellation_fee_charged');
  const [course, failed, cancelEvents] = noFee.length ? await Promise.all([
    prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, cancellationHours: true } }),
    prisma.paymentEvent.findMany({ where: { bookingId: { in: noFee.map(b => b.id) }, kind: 'charge_failed', detail: { startsWith: 'Late-cancellation fee' } }, select: { bookingId: true, detail: true } }),
    prisma.bookingEvent.findMany({ where: { bookingId: { in: noFee.map(b => b.id) }, type: 'booking_cancelled' }, select: { bookingId: true, metadata: true } }),
  ]) : [null, [], []];
  const failedDetail = new Map(failed.map(f => [f.bookingId, f.detail]));
  const record = new Map(cancelEvents.map(e => [e.bookingId, (e.metadata ?? {}) as CancelRecord]));
  return NextResponse.json(bookings.map(({ cancellationHoursAtBooking: _h, source: _s, ...b }, i) => {
    const rec = record.get(b.id) ?? null;
    const why = course && b.status === 'cancelled' && b.paymentStatus !== 'cancellation_fee_charged'
      ? (rec?.noShowFeeKept ? { noShowFeeKeptCents: rec.noShowFeeKept } : { noFeeReason: noFeeReason(bookings[i], course, rec, failedDetail.get(b.id) ?? null) ?? undefined })
      : {};
    return {
    ...b,
    ...why,
    ...(contact ? {} : { golferEmail: '', golferPhone: '' }),
    ...(seesPayments ? {} : { greenFeeTotal: 0, cartFeeTotal: 0, rangeBallsTotal: 0, accessFeeTotal: 0, totalAmount: 0 }),
    };
  }));
}

// Lets the operator cancel a booking on a golfer's behalf (e.g. a phone-call
// cancellation), or check a golfer in and charge them for their round —
// staff-side counterpart to the golfer's self-checkin link.
export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action, paymentMethodId, checkedInPlayers: cipRaw, waiveFee: waiveRaw, via: viaRaw, newTeeTimeId, reprice, dryRun, residentPlayers, cashTenderedCents } = await req.json();
  const waiveFee = action === 'cancel' && waiveRaw === true;
  // SD-5: partial party — how many actually showed (1 .. players-1); absent = all.
  const cip = cipRaw == null ? undefined : Number(cipRaw);
  if (cip !== undefined && (!Number.isInteger(cip) || cip < 1)) return NextResponse.json({ error: 'Invalid headcount.' }, { status: 400 });
  // CASH-1: 'take_cash' (the old 'paid_offline' still arrives from open tabs — it is the same cash sale).
  const ACTIONS = ['cancel', 'checkin', 'no_show', 'still_coming', 'take_cash', 'paid_offline', 'send_pay_link', 'move', 'set_residents'];
  if (!id || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Missing id or unsupported action' }, { status: 400 });
  }
  // SP-A: each counter action is its own permission.
  const NEEDS: Record<string, PermissionKey> = { cancel: 'sheet.cancel', checkin: 'sheet.checkin', no_show: 'sheet.no_show', still_coming: 'sheet.no_show', take_cash: 'sheet.counter_payment', paid_offline: 'sheet.counter_payment', send_pay_link: 'sheet.checkin', move: 'sheet.move', set_residents: 'sheet.counter_payment' };
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
  // charged on its own (lib/access-fee.ts) — for a no-show, at the course's
  // midnight (hourly cron, NS-EOD). The staff action never waits
  // on it or fails because of it — the tee sheet is told what happened.
  const actorName = session.email;
  // EV-1: every counter action below is DB-only, so its event is written in the
  // same transaction as the state change.
  const staff: EventActor = { type: 'staff', id: session.staffId ?? session.operatorId };
  // ACT-1 (PLATFORM_ROADMAP_SPEC §2): move the group to another tee time.
  // `dryRun` returns what the move would do (price both ways, whether the new
  // time's free-cancellation window has closed) so the sheet can show it
  // before Confirm. The price is kept unless staff ask for the new time's rate.
  // RES-1: how many of the group are residents (they showed their card).
  if (action === 'set_residents') {
    const r = await setBookingResidents(session.courseId, id, residentPlayers, staff);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  }
  if (action === 'move') {
    if (typeof newTeeTimeId !== 'string' || !newTeeTimeId) return NextResponse.json({ error: 'Pick a tee time to move to.' }, { status: 400 });
    const r = await moveBooking({ bookingId: id, newTeeTimeId, courseId: session.courseId, pricing: reprice === true ? 'new_slot' : 'keep', actor: staff, allowCheckedIn: true, dryRun: dryRun === true });
    if (!r.ok) return NextResponse.json({ error: r.message, code: r.code }, { status: r.code === 'NOT_FOUND' ? 404 : 409 });
    const seesPay = can(session, 'money.payments');
    const view = {
      ok: true, dryRun: dryRun === true, to: r.to, players: r.players, cutoffPassed: r.cutoffPassed, holdDue: r.holdDueCents > 0, priceChanged: r.priceChanged, checkedIn: r.checkedIn,
      ...(seesPay ? { totals: r.totals, newSlotTotals: r.newSlotTotals, holdDueCents: r.holdDueCents } : {}),
    };
    if (dryRun === true) return NextResponse.json(view);
    // Tell the golfer. Never fails the move — the sheet is told instead.
    let emailed: boolean | null = null;
    const moved = await prisma.booking.findUnique({ where: { id }, include: { teeTime: { select: { date: true, time: true, holes: true, product: { select: { label: true } } } }, course: { select: { name: true, slug: true } } } });
    if (moved && !isPlaceholderEmail(moved.golferEmail)) {
      emailed = await sendBookingModifiedEmail({
        golferName: moved.golferName, golferEmail: moved.golferEmail, courseName: moved.course.name, courseSlug: moved.course.slug,
        date: moved.teeTime.date, time: moved.teeTime.time, holes: moved.teeTime.holes, productLabel: moved.teeTime.product?.label ?? null,
        players: moved.players, greenFeeTotal: moved.greenFeeTotal, cartFeeTotal: moved.cartFeeTotal, rangeBallsTotal: moved.rangeBallsTotal,
        accessFeeTotal: moved.accessFeeTotal, totalAmount: moved.totalAmount, bookingId: moved.id, checkInToken: moved.checkInToken,
        shopTotalCents: moved.shopTotalCents, shopFeeCents: moved.shopFeeCents, shopTaxCents: moved.shopTaxCents,
        checkedIn: r.checkedIn,
      }).then(() => true, (err) => { console.error(JSON.stringify({ ev: 'move.email.fail', bookingId: id, error: err instanceof Error ? err.message : String(err) })); return false; });
    }
    return NextResponse.json({ ...view, emailed });
  }

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
        // Every non-code text carries the opt-out line (legal rewrite 2026-10-19).
        await sendSms(to, `${b.course.name}: check in and pay for your ${formatTeeTime(b.teeTime.time)} tee time here (Apple Pay, Google Pay or card): ${url} Reply STOP to opt out.`, { kind: 'pay_link_text', bookingId: id });
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
    if (roundPaid(booking)) return NextResponse.json({ error: 'This round is already paid, so it can’t be a no-show. Check the group in instead.' }, { status: 409 });
    // Review: a no-show now costs the golfer the booking fee, so it can only be
    // recorded once the tee time has actually passed.
    if (!isPastIn(booking.course.timezone, booking.teeTime.date, booking.teeTime.time)) {
      return NextResponse.json({ error: 'You can mark a no-show once their tee time has passed.' }, { status: 409 });
    }
    // NS-EOD: the mark only flags the booking; any no-show charge is taken at
    // the course's midnight if they still haven't checked in (lib/no-show-fee).
    await markNoShow(id, staff, { actorName });
    return NextResponse.json({ success: true, noShowAt: new Date().toISOString(), fee: 'Marked a no-show. Any no-show charge is taken at midnight if they still haven’t checked in — “Still coming” or checking them in before then cancels it.' });
  }
  if (action === 'still_coming') {
    // G14 (review ledger): only a confirmed booking flagged a no-show has
    // no-show charges to give back — never a cancelled one's kept fees.
    if (booking.status !== 'confirmed' || !booking.noShowAt) return NextResponse.json({ error: 'This booking isn’t marked a no-show.' }, { status: 409 });
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
  if (action === 'take_cash' || action === 'paid_offline') {
    // CASH-1 (Cam 2026-10-25: "can't just be paid at counter — it's either paid online
    // or rung up in store"): cash for a group is a register cash sale of its round —
    // checked in, paid, one receipt, and the close-out counts it exactly.
    const r = await ringUpCash(session.courseId, {
      lines: [], bookingIds: [id], walkIns: [], headcounts: cip !== undefined ? { [id]: cip } : undefined,
      cashTenderedCents, soldBy: session.email, actor: staff,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (r.value.skipped.length) return NextResponse.json({ error: r.value.skipped.join(' ') }, { status: 409 });
    return NextResponse.json({ success: true, saleId: r.value.sale.id, totalCents: r.value.sale.totalCents, cashTenderedCents: r.value.sale.cashTenderedCents, fee: r.value.notes.join(' ') || null });
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

  const checkInNow = body.checkInNow === true;
  if (checkInNow) { const d = requirePermission(session, 'sheet.counter_payment'); if (d) return d; } // SP-A: checked in = paid at the counter
  const golferName = String(body.golferName ?? '').trim().slice(0, 120);
  const golferEmail = String(body.golferEmail ?? '').trim().toLowerCase().slice(0, 200);
  const players = Number(body.players);
  // One place for a counter booking (lib/counter-pay) — the register calls it too.
  const made = await createCounterBooking(session.courseId, {
    teeTimeId: String(body.teeTimeId ?? ''), golferName, golferEmail, golferPhone: String(body.golferPhone ?? ''),
    players, cartSelected: body.cartSelected === true, source: body.source === 'phone' ? 'phone' : 'walk_in', late: body.late === true,
  }, { type: 'staff', id: session.staffId ?? session.operatorId });
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
  // CASH-1: "paying cash now" — the booking is made, then its round is rung up in cash.
  if (checkInNow) {
    const cash = await ringUpCash(session.courseId, { lines: [], bookingIds: [made.id], walkIns: [], soldBy: session.email, actor: { type: 'staff', id: session.staffId ?? session.operatorId } });
    if (!cash.ok || cash.value.skipped.length) {
      const failed = !cash.ok ? cash.error : cash.value.skipped.join(' ');
      return NextResponse.json({ success: true, bookingId: made.id, emailSent: null, cashError: `The group is booked, but the cash wasn’t recorded: ${failed} Take cash from their card on the tee sheet.` }, { status: 207 });
    }
    return NextResponse.json({ success: true, bookingId: made.id, emailSent: null, saleId: cash.value.sale.id, totalCents: cash.value.sale.totalCents });
  }
  const { greenFeeTotal, cartFeeTotal, totalAmount } = made;
  const accessFeeTotal = 0;
  const claimed = { id: made.id, checkInToken: made.checkInToken };
  const teeTime = { ...made.teeTime, course: made.course };

  let emailSent: boolean | null = null;
  // A walk-in who already played gets no confirmation (it would offer free cancellation
  // for a finished round); staff send the pay link from the card if they still owe.
  if (golferEmail && !checkInNow && body.late !== true) {
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


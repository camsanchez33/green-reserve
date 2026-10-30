// A group pays for its round at the counter (cash, or the course's own card
// machine): checked in, no Stripe charge, no GreenReserve fee (PAY-2: "we are
// just going to have to eat it"). ONE place for it — the tee sheet's
// "Paid at the counter" and (POS-3 R2) the register both call settleAtCounter.
//
// CLAUDE.md: this completes the booking WITHOUT performCheckIn, so anything
// that must happen on every check-in is done here too: the checked_in event,
// the shop items' sales tax, refunding a hold fee taken after the cutoff, and
// refunding a booking fee already taken on its own.
import { prisma } from './prisma';
import { ensureShopTax, recordRoundShopTax } from './round-shop-tax';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';
import { refundSeparateAccessFee, liveSeparateFee } from './access-fee';
import { refundOnConnectedAccount } from './stripe';
import { claimTeeTime, TeeTimeClaimError, LATE_ADD_MESSAGE } from './claim-tee-time';
import { todayIn } from './course-time';
import { randomUUID } from 'crypto';
import { READER_STALE_MS } from './checkin-booking';
import { noShowClosed, NO_SHOW_CLOSED_ERROR } from './no-show-fee';
import { recordMove } from './money-ledger';
import { applyTierRates } from './tier-rates';
import { applyPromo, reserveUse, releaseUse, seatAfter, NOTHING_OFF, type PromoRow } from './promo-codes';
import { dealPct, dealSeat, dealRateSeat } from './last-minute';
import { addCharge } from './member-account';
import { holdingById, packSeats, packPrice, takeRounds, giveBack, PackError, PACK_NO_CODE } from './round-packs';
import { memberPlayers, splitTotal, memberSpot, partyFees, membershipLive, type PartyBooking } from './member-rates';

export type CounterResult =
  | { ok: true; amountCents: number; note: string | null }
  | { ok: false; status: number; error: string };

/**
 * What the group hands over at the counter: the round less GreenReserve's fee,
 * plus shop items and their tax. Part of a group: green and cart for those who
 * showed priced as card check-in prices them (lib/member-rates partyFees — the
 * member's spot or the residents first), range balls whole.
 */
export function counterDueCents(b: PartyBooking & { totalAmount: number; accessFeeTotal: number; rangeBallsTotal: number; shopTotalCents?: number | null; shopTaxCents?: number | null }, showed?: number): number {
  const shop = (b.shopTotalCents ?? 0) + (b.shopTaxCents ?? 0);
  if (showed == null || showed >= b.players) return b.totalAmount - (b.accessFeeTotal ?? 0) + shop;
  // Nobody to read a guest price from only when the whole group is one player, which can't be part-paid.
  const fees = partyFees(b, showed, { greenFeeCents: 0, cartFeeCents: 0 });
  return fees.greenFeeTotal + fees.cartFeeTotal + b.rangeBallsTotal + shop;
}

/** MEM-ACCT: what a group put on a member's account owes — the counter's price plus an online booking's GreenReserve fee (collected with the statement). */
export function accountDueCents(b: Parameters<typeof counterDueCents>[0] & { feePaidCents?: number | null }, showed?: number): { amountCents: number; feeCents: number } {
  const fee = Math.max(0, (b.accessFeeTotal ?? 0) - (b.feePaidCents ?? 0));
  const feeCents = showed == null || showed >= b.players ? fee : (b.players > 0 ? Math.round((fee * showed) / b.players) : 0);
  return { amountCents: counterDueCents(b, showed) + feeCents, feeCents };
}

export async function settleAtCounter(courseId: string, bookingId: string, opts: { actor: EventActor; actorName: string; checkedInPlayers?: number; onAccount?: { membershipId: string } }): Promise<CounterResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, courseId },
    select: { readerStartedAt: true, noShowAt: true, courseId: true, status: true, paymentStatus: true, players: true, totalAmount: true, accessFeeTotal: true, shopTotalCents: true, shopTaxCents: true,
      greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true, feePaidCents: true,
      cancellationFeeChargeId: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true, stripeAccountId: true } } },
  });
  if (!booking) return { ok: false, status: 404, error: 'Not found' };
  // POS-3 R3b: on the card reader right now — cash would be a second payment. A claim
  // left 10 minutes is settled from Stripe first; it may turn out paid.
  if (booking.readerStartedAt) {
    if (Date.now() - booking.readerStartedAt.getTime() <= READER_STALE_MS) return { ok: false, status: 409, error: 'This group is being paid on the card reader — finish or cancel it there first.' };
    const { settleRoundReader } = await import('./reader-rounds');
    await settleRoundReader(courseId, bookingId, opts.actor);
    const after = await prisma.booking.findUnique({ where: { id: bookingId }, select: { readerStartedAt: true, paymentStatus: true } });
    if (after?.readerStartedAt) return { ok: false, status: 409, error: 'This group is being paid on the card reader — finish or cancel it there first.' };
    if (after?.paymentStatus === 'paid') return { ok: false, status: 409, error: 'This round was just paid on the card reader.' };
  }
  const cip = opts.checkedInPlayers;
  if (cip !== undefined && (!Number.isInteger(cip) || cip < 1 || cip > booking.players)) return { ok: false, status: 400, error: 'Invalid headcount.' };
  if (booking.status === 'cancelled') return { ok: false, status: 409, error: 'This booking was cancelled.' };
  if (booking.status === 'completed') return { ok: false, status: 409, error: 'Already checked in.' };
  if (noShowClosed(booking)) return { ok: false, status: 409, error: NO_SHOW_CLOSED_ERROR };
  // Review (HIGH): a round already charged by card (an admin "collect
  // payment") is paid — marking it paid offline would hide that payment and
  // take the booking fee a second time.
  if (booking.paymentStatus === 'paid') return { ok: false, status: 409, error: 'This round was already paid by card — check them in instead.' };
  const hadHoldFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;
  // W2-7 B2: bring the shop items' sales tax up to date before the counter
  // closes the round. Cash is never blocked (PAY-2): if Stripe can't be
  // reached, the round still closes and the tax stays as last quoted.
  await ensureShopTax(bookingId);
  const evBase = { bookingId, courseId, actor: opts.actor, teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time) };
  // MEM-ACCT: on a member's account instead of cash — the line is written in the same transaction,
  // so a refused charge (past the limit, not an active member) leaves the group unsettled.
  const acct = opts.onAccount ? accountDueCents(booking, cip) : null;
  class AccountRefused extends Error { constructor(public status: number, msg: string) { super(msg); } }
  let settled: boolean;
  try {
    settled = await prisma.$transaction(async tx => {
      // Only a booking still open to pay: two taps (sheet and register) settle it once.
      const done = await tx.booking.updateMany({
        // …and never while it is on the card reader (a claim taken since the check above).
        where: { id: bookingId, courseId, status: 'confirmed', paymentStatus: { not: 'paid' }, readerStartedAt: null },
        data: { status: 'completed', checkedInAt: new Date(), paidAt: new Date(), paidOffline: !acct, paymentStatus: acct ? 'on_account' : 'paid_offline', noShowAt: null, checkInFailReason: '', ...(cip !== undefined ? { checkedInPlayers: cip } : {}),
          // POS-1a: shop items are paid at the counter too; GreenReserve's shop fee is never collected in cash.
          shopFeeCents: 0 },
      });
      if (!done.count) return false;
      if (acct && opts.onAccount) {
        const line = await addCharge(tx, { courseId, membershipId: opts.onAccount.membershipId, kind: 'round', amountCents: acct.amountCents, feeCents: acct.feeCents, bookingId, note: `Round, ${cip ?? booking.players} player${(cip ?? booking.players) === 1 ? '' : 's'}`, createdBy: opts.actorName });
        if (!line.ok) throw new AccountRefused(line.status, line.error);
      }
      await recordBookingEvent(tx, { ...evBase, type: 'checked_in', amountCents: booking.totalAmount, playerCount: cip ?? booking.players, metadata: acct ? { onAccount: true, membershipId: opts.onAccount!.membershipId } : { paidOffline: true } });
      return true;
    });
  } catch (err) {
    if (err instanceof AccountRefused) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
  if (!settled) return { ok: false, status: 409, error: 'This group was just checked in or changed — refresh and look again.' };
  // The tax on shop items paid at the counter goes on the course's tax record too (the hourly cron retries).
  await recordRoundShopTax(bookingId);
  // They paid the round at the counter, so the hold fee the cron took after
  // the cutoff goes back — exactly as a card check-in refunds it.
  let holdNote: string | null = null;
  if (hadHoldFee && booking.course.stripeAccountId) {
    try {
      const refund = await refundOnConnectedAccount({ paymentIntentId: booking.cancellationFeeChargeId as string, connectedAccountId: booking.course.stripeAccountId });
      await recordMove({ courseId, what: 'hold', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, stripeId: refund.id, bookingId, actor: opts.actor.type, note: 'hold given back — paid at the counter' });
      await recordBookingEventSafe({ ...evBase, type: 'fee_refunded', amountCents: refund.amount, playerCount: booking.players, stripeId: refund.id, metadata: { reason: 'hold_refunded_at_checkin', paidOffline: true } });
    } catch (err) {
      holdNote = `The late-cancellation hold fee could not be refunded automatically (${err instanceof Error ? err.message : 'Stripe error'}) — GreenReserve will follow up.`;
    }
  }
  // Cash at the counter collects no GreenReserve fee, card on file or not
  // (Cam 2026-10-19, HOMEPAGE_SPEC §0a; PAY-2): it is counted on Admin →
  // Revenue instead. A booking fee already taken separately (a no-show
  // charge, then the group turned up and paid cash) goes back.
  // On account, the fee is collected with the statement instead — a separate one taken earlier goes back the same way.
  let refundNote: string | null = null;
  if (await liveSeparateFee(bookingId)) {
    const r = await refundSeparateAccessFee(bookingId, 'paid at the counter — no GreenReserve fee on cash', 'operator', opts.actorName);
    if (!r.ok) refundNote = `GreenReserve's booking fee could not be refunded to the golfer's card (${r.error}) — GreenReserve will follow up.`;
  }
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { totalAmount: true, accessFeeTotal: true, players: true, shopTotalCents: true, shopTaxCents: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true } });
  return { ok: true, amountCents: acct ? acct.amountCents : counterDueCents(after, cip), note: [holdNote, refundNote].filter(Boolean).join(' ') || null };
}

/**
 * SD-5: a walk-in or phone booking entered at the counter, at the tee time's
 * standard rates, paying at the counter (paymentStatus 'manual'). ONE place
 * for it — the tee sheet's walk-in form and (POS-3 R2) the register.
 * CART-1: a tee time that can't be walked charges a cart for everyone.
 * Always made unpaid (CASH-1): paying in cash is then a register sale of its
 * round (lib/register ringUpCash → settleAtCounter), so every cash payment has
 * a sale, a receipt and a place in the close-out.
 */
export type CounterBookingInput = {
  teeTimeId: string; golferName: string; golferEmail?: string; golferPhone?: string;
  players: number; cartSelected?: boolean; source?: 'walk_in' | 'phone';
  /** PRICE-1: a promo code the golfer gave at the counter or on the phone. */
  promoCode?: string;
  /** A walk-in who already played, recorded after the LATE_ADD_MINUTES cut-off (staff only). */
  late?: boolean;
  /**
   * Revamp 3 dead end 20 (Cam 2026-10-29): the rate staff pick at the counter — the tee
   * time's standard price, its resident, senior or junior price, or a member's:
   * `member:<membershipId>` (the member showed their membership; it must be live) or, only
   * when the course allows it (Course.counterMemberRate 'any'), `tier:<id>`. Either way the
   * member is at the member rate and guests at the standard one unless the tier includes them.
   * Absent = standard. PRICE-3: `pack:<lineId>` = rounds from the golfer's round pack.
   */
  rate?: string;
};
export async function createCounterBooking(courseId: string, input: CounterBookingInput, actor: EventActor):
  Promise<{ ok: true; id: string; checkInToken: string | null; greenFeeTotal: number; cartFeeTotal: number; totalAmount: number; teeTime: { date: string; time: string; holes: number }; course: { name: string; address: string | null; city: string | null; state: string | null; slug: string; cancellationHours: number; confirmationNote: string | null } }
  | { ok: false; status: number; error: string }> {
  const golferName = String(input.golferName ?? '').trim().slice(0, 120);
  const golferEmail = String(input.golferEmail ?? '').trim().toLowerCase().slice(0, 200);
  const golferPhone = String(input.golferPhone ?? '').trim().slice(0, 40);
  const players = Number(input.players);
  const source = input.source === 'phone' ? 'phone' : 'walk_in';
  if (!input.teeTimeId || golferName.length < 2) return { ok: false, status: 400, error: 'Enter the golfer’s name.' };
  if (!Number.isInteger(players) || players < 1 || players > 8) return { ok: false, status: 400, error: 'Players must be between 1 and 8.' };
  if (golferEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(golferEmail)) return { ok: false, status: 400, error: 'That email doesn’t look right.' };
  const teeTime = await prisma.teeTime.findUnique({ where: { id: input.teeTimeId }, include: { course: true } });
  if (!teeTime || teeTime.courseId !== courseId) return { ok: false, status: 404, error: 'Tee time not found' };
  if (teeTime.date < todayIn(teeTime.course.timezone)) return { ok: false, status: 409, error: 'That date has passed.' };
  const cart = input.cartSelected === true || teeTime.walkingAllowed === false;
  const rate = String(input.rate ?? 'standard');
  // PRICE-1 (Cam 2026-10-30): a promo code staff apply, by the same rules as online — checked
  // first, then every seat below is priced after it (seatAfter), so the per-seat rates kept on
  // the booking add up to its total.
  let promoRow: PromoRow | null = null;
  if (rate.startsWith('pack:') && input.promoCode && String(input.promoCode).trim()) return { ok: false, status: 400, error: PACK_NO_CODE };
  if (input.promoCode && String(input.promoCode).trim()) {
    const p = await applyPromo(courseId, input.promoCode, { date: teeTime.date, time: teeTime.time, rateApplied: rate !== 'standard', golferEmail: golferEmail || null });
    if (!p.ok) return { ok: false, status: 400, error: p.error };
    promoRow = p.code;
  }
  const seat = (c: number) => (promoRow ? seatAfter(promoRow, c) : c);
  // PRICE-2: a last-minute deal, when the course gives it at the counter too (lib/last-minute) — before any code.
  const lastMinutePct = dealPct(teeTime.course, teeTime, 'counter');
  const pub = dealSeat(lastMinutePct, teeTime.greenFeeCents);
  const rated = (c: number) => dealRateSeat(lastMinutePct, c, teeTime.greenFeeCents, teeTime.course.lastMinuteStack);
  let ratedGreen = pub * players;
  let greenFeeTotal = seat(pub) * players;
  let cartFeeTotal = cart ? teeTime.cartFeeCents * players : 0;
  let appliedRate = 'standard';
  let packUse: { lineId: string; rounds: number } | null = null;
  let rateRows: { residentPlayers?: number; residentRateCents?: number | null; memberRateCents?: number | null; memberCartCents?: number | null } = {};
  if (rate === 'resident' || rate === 'senior' || rate === 'junior') {
    const per = rate === 'resident' ? teeTime.residentRateCents : rate === 'senior' ? teeTime.seniorRateCents : teeTime.juniorRateCents;
    if (per == null) return { ok: false, status: 409, error: `This tee time has no ${rate} price. Set one in Schedule.` };
    ratedGreen = rated(per) * players;
    greenFeeTotal = seat(rated(per)) * players;
    appliedRate = rate;
    if (rate === 'resident') rateRows = { residentPlayers: players, residentRateCents: seat(rated(per)) };
  } else if (rate.startsWith('tier:') || rate.startsWith('member:')) {
    let tier;
    if (rate.startsWith('member:')) {
      // Cam: "they should show their membership when they get there" — the member's own, and only while it's live.
      const m = await prisma.courseMembership.findFirst({ where: { id: rate.slice(7), courseId }, include: { tier: true } });
      if (!m || !m.tier) return { ok: false, status: 400, error: 'That member isn’t on your course.' };
      if (!membershipLive(m, teeTime.course)) return { ok: false, status: 409, error: 'That membership has ended — book them at the standard rate, or renew it on Members.' };
      tier = m.tier;
    } else {
      if (teeTime.course.counterMemberRate !== 'any') return { ok: false, status: 409, error: 'Pick the member — your course gives member rates at the counter only to members.' };
      tier = await prisma.membershipTier.findFirst({ where: { id: rate.slice(5), courseId, active: true } });
    }
    if (!tier) return { ok: false, status: 400, error: 'That membership isn’t on your course.' };
    const r = applyTierRates(teeTime, tier);
    const n = memberPlayers(players, tier);
    ratedGreen = splitTotal(players, n, rated(r.greenFeeCents), pub);
    greenFeeTotal = splitTotal(players, n, seat(rated(r.greenFeeCents)), seat(pub));
    cartFeeTotal = cart ? splitTotal(players, n, r.cartFeeCents, teeTime.cartFeeCents) : 0;
    appliedRate = tier.name;
    rateRows = memberSpot(tier, { greenFeeCents: seat(rated(r.greenFeeCents)), cartFeeCents: r.cartFeeCents });
  } else if (rate.startsWith('pack:')) {
    // PRICE-3: the golfer's round pack — its rounds are taken just below, before the booking is made.
    const holding = await holdingById(courseId, rate.slice(5));
    if (!holding) return { ok: false, status: 400, error: 'That round pack isn’t on your course.' };
    const seats = packSeats(holding, players);
    if (!seats.ok) return { ok: false, status: 400, error: seats.error };
    const priced = packPrice({ players, seats: seats.seats, guests: holding.guests, coversCart: holding.coversCart, publicGreen: pub, cartFee: teeTime.cartFeeCents, cart });
    ratedGreen = greenFeeTotal = priced.greenFeeTotal;
    cartFeeTotal = priced.cartFeeTotal;
    appliedRate = 'pack';
    rateRows = { memberRateCents: priced.memberRateCents, memberCartCents: priced.memberCartCents };
    packUse = { lineId: holding.lineId, rounds: seats.seats };
  } else if (rate !== 'standard') return { ok: false, status: 400, error: 'Pick a rate.' };
  const promo = promoRow ? { id: promoRow.id, discountCents: ratedGreen - greenFeeTotal } : null;
  if (promo && promo.discountCents <= 0) return { ok: false, status: 400, error: NOTHING_OFF };
  if (promo && !(await reserveUse(promo.id))) return { ok: false, status: 409, error: 'That code has just been used up.' };
  if (packUse) {
    const use = packUse;
    try { await prisma.$transaction(tx => takeRounds(tx, courseId, use.lineId, use.rounds)); }
    catch (err) { if (err instanceof PackError) return { ok: false, status: 409, error: err.message }; throw err; }
  }
  // No platform fee on a counter booking — nothing is collected online.
  const totalAmount = greenFeeTotal + cartFeeTotal;
  // CASH-1 (Cam 2026-10-25: "can't just be paid at counter"): a counter booking is
  // always made unpaid; paying in cash is a register sale (lib/register ringUpCash).
  try {
    const claimed = await claimTeeTime({
      teeTimeId: teeTime.id, courseId,
      golferName, golferEmail: golferEmail || `${source}+${Date.now()}@noemail.greenreserve.app`, golferPhone,
      players, appliedRate, ...rateRows,
      ...(promo ? { promoCodeId: promo.id, promoDiscountCents: promo.discountCents } : {}),
      lastMinutePct,
      ...(packUse ? { packLineId: packUse.lineId, packRounds: packUse.rounds } : {}),
      greenFeeTotal, cartFeeTotal, cartSelected: cart, accessFeeTotal: 0, totalAmount,
      checkInToken: golferEmail ? randomUUID() : null,
      paymentStatus: 'manual',
      status: 'confirmed',
      source,
      cancellationHoursAtBooking: teeTime.course.cancellationHours,
    }, actor, { allowLate: input.late === true && source === 'walk_in' && actor.type === 'staff' });
    const c = teeTime.course;
    return { ok: true, id: claimed.id, checkInToken: claimed.checkInToken, greenFeeTotal, cartFeeTotal, totalAmount,
      teeTime: { date: teeTime.date, time: teeTime.time, holes: teeTime.holes },
      course: { name: c.name, address: c.address, city: c.city, state: c.state, slug: c.slug, cancellationHours: c.cancellationHours, confirmationNote: c.confirmationNote } };
  } catch (err) {
    if (promo) await releaseUse(promo.id);
    if (packUse) await giveBack(prisma, packUse.lineId, packUse.rounds);
    if (err instanceof TeeTimeClaimError) {
      if (err.code === 'NOT_FOUND') return { ok: false, status: 404, error: 'Tee time not found' };
      if (err.code === 'BLOCKED') return { ok: false, status: 409, error: 'This tee time is blocked.' };
      if (err.code === 'PAST') return { ok: false, status: 409, error: LATE_ADD_MESSAGE };
      if (err.code === 'FULL' || err.code === 'CONFLICT') return { ok: false, status: 409, error: 'That time just filled up.' };
      if (err.code === 'SPOTS') return { ok: false, status: 409, error: `Only ${err.spotsLeft} spot${err.spotsLeft === 1 ? '' : 's'} left.` };
    }
    throw err;
  }
}

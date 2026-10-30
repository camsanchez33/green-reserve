import { prisma } from './prisma';
import { liveMembershipWhere, memberPlayers, splitTotal, partyFees } from './member-rates';
import { stripe, chargeOnConnectedAccount, refundOnConnectedAccount } from './stripe';
import { recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';
import { sendCheckInReceiptEmail } from './email';
import { feeCoveredCents } from './booking-fees';
import { refundSeparateAccessFee } from './access-fee';
import { roundChargeCents, roundApplicationFeeCents, shopLinesFor } from './shop';
import { ensureShopTax, recordRoundShopTax } from './round-shop-tax';
import { noShowClosed, NO_SHOW_CLOSED_ERROR } from './no-show-fee';
import { recordMove } from './money-ledger';

/**
 * Charging a round, and checking a golfer in, are two different things.
 *
 * MP-1 fix-now #5: they used to be one function. `/api/admin/retry-charge`
 * called `performCheckIn` verbatim, so an admin clearing tomorrow's failed
 * charge today also marked the golfer checked in and emailed them a receipt
 * for a round they had not played. The money logic is identical either way,
 * so it lives once, here, and the two exported entry points differ only in
 * whether they also record the arrival.
 *
 *   collectPayment()  — take the money. Booking stays 'confirmed', no
 *                       checkedInAt, no receipt email.
 *   performCheckIn()  — take the money AND record the arrival + receipt.
 *
 * Charges the full round total (green + cart + range balls + the GreenReserve
 * access fee, plus any pro-shop items added to the round and their 50¢ fee —
 * POS-1a, lib/shop.ts roundChargeCents) as a direct charge on the course's
 * connected Stripe account, with the access fee (and shop fee) taken as the
 * application fee on that same charge. If the
 * golfer already had the late-cancellation fee charged (they crossed the
 * cutoff but never cancelled, then showed up anyway), that fee is refunded in
 * full since they did end up paying for the round.
 *
 * Authorization (is this the golfer's own booking / does this operator own
 * the course / does the token match) is the caller's responsibility.
 *
 * opts.externalPaymentMethodId -- for walk-up check-ins where no card was saved
 * at booking time (no-fee-policy courses). A PaymentMethod created from a fresh
 * card entry on the check-in page or by staff in the dashboard is passed here.
 * The temporary platform Customer is created, attached, and then
 * cloned-and-charged on the connected account exactly like a saved card.
 */
type ChargeOpts = {
  externalPaymentMethodId?: string;
  /** SD-5: only this many of the party showed — the charge and the receipt
   *  are prorated per player and the count is recorded on the booking. */
  checkedInPlayers?: number;
  /** B-5: add a cart at check-in for a booking that has none — priced at the
   *  tee time's cart fee × players, written to the booking before the charge. */
  addCart?: boolean;
  /** POS-1a: the total the golfer was shown. Checked after the shop items are
   *  frozen, so the charge can never differ from it. */
  expectedTotalCents?: number;
  /** POS-3 R3b: the round was paid on the course's card reader — this
   *  succeeded card_present PaymentIntent (lib/reader-rounds.ts checked it). No
   *  card is charged here; everything after the charge runs as for any card. */
  cardPresent?: { paymentIntentId: string; amountCents: number };
};

type ChargeResult =
  | { readonly error: string; readonly status: number }
  | { readonly success: true; readonly totalCharged: number; readonly feeRefunded: boolean; readonly feeRefundFailed: boolean; readonly feeRefundError: string; readonly feeRefundAmount: number; readonly alreadyPaid: boolean; readonly cartAddedCents: number };

/** POS-3 R3b: a reader claim older than this is settled from Stripe before anything else charges the round. */
export const READER_STALE_MS = 10 * 60 * 1000;

/**
 * B-5 (security review): the cart add-on is priced the way the booking route
 * prices a cart — the golfer's active tier at this course, when they have one
 * (flat weekday/weekend cart rate), else the tee time's cart fee. Used for
 * both the quote (GET) and the charge, so they cannot disagree.
 */
export async function cartAddOnCentsFor(booking: {
  golferAccountId: string | null; golferEmail: string; courseId: string; players: number;
  cartSelected: boolean; cartFeeTotal: number; paymentStatus: string; roundPaymentIntentId: string;
  teeTime: { date: string; cartFeeCents: number };
}): Promise<number> {
  if (booking.cartSelected || booking.cartFeeTotal > 0) return 0;
  if (booking.paymentStatus === 'paid' && booking.roundPaymentIntentId) return 0;
  const standard = booking.teeTime.cartFeeCents;
  let perPlayer = standard;
  const grace = (await prisma.course.findUnique({ where: { id: booking.courseId }, select: { memberGraceDays: true, timezone: true } })) ?? { memberGraceDays: 0 };
  // Membership resolves the way the booking route does (member-session.ts):
  // by golfer account OR by the invite email, so an invite-only member who has
  // not accepted yet still gets their rate. Scoped to THIS course.
  const m = await prisma.courseMembership.findFirst({
    where: {
      courseId: booking.courseId,
      // Lapsed members (past the end date + grace days) pay the public cart fee (lib/member-rates).
      ...liveMembershipWhere(grace),
      AND: [{ OR: [
        ...(booking.golferAccountId ? [{ golferId: booking.golferAccountId }] : []),
        ...(booking.golferEmail ? [{ inviteEmail: { equals: booking.golferEmail, mode: 'insensitive' as const } }] : []),
      ] }],
    },
    include: { tier: { select: { greenFeeWeekdayCents: true, greenFeeWeekendCents: true, cartFeeWeekdayCents: true, cartFeeWeekendCents: true, discountPct: true, guestsPayMemberRate: true } } },
  });
  if (m?.tier) {
    const t = m.tier;
    const d = new Date(booking.teeTime.date + 'T12:00:00');
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    // Same order of precedence as applyTierRates in the booking route: flat
    // overrides first, else a percentage off standard, else standard.
    if (t.greenFeeWeekdayCents != null || t.greenFeeWeekendCents != null) {
      perPlayer = weekend
        ? (t.cartFeeWeekendCents ?? t.cartFeeWeekdayCents ?? perPlayer)
        : (t.cartFeeWeekdayCents ?? perPlayer);
    } else if (t.discountPct != null) {
      perPlayer = Math.round(perPlayer * (1 - t.discountPct / 100));
    }
  }
  // Cam 2026-10-29: the member's own cart at their rate; guests at the public rate unless the tier includes them.
  const total = m?.tier ? splitTotal(booking.players, memberPlayers(booking.players, m.tier), perPlayer, standard) : perPlayer * booking.players;
  return total > 0 ? total : 0;
}

async function chargeBooking(
  bookingId: string,
  opts: ChargeOpts | undefined,
  mode: { recordCheckIn: boolean },
  actor: EventActor,
  readerSettled = false,
): Promise<ChargeResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, greenFeeCents: true, cartFeeCents: true } },
      course: { select: { name: true, slug: true, address: true, city: true, state: true, stripeAccountId: true, stripeAccountActive: true, timezone: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'This booking was cancelled', status: 409 } as const;
  if (booking.status === 'completed') return { error: 'Already checked in', status: 409 } as const;
  if (noShowClosed(booking)) return { error: NO_SHOW_CLOSED_ERROR, status: 409 } as const;

  // POS-3 R3b: the group is on the card reader. Nothing else charges it until
  // that is finished — two card payments for one round could both go through.
  // A claim left 10 minutes is settled from Stripe first (lib/reader-rounds).
  if (!opts?.cardPresent && booking.readerStartedAt) {
    if (!readerSettled && Date.now() - booking.readerStartedAt.getTime() > READER_STALE_MS) {
      const { settleRoundReader } = await import('./reader-rounds');
      await settleRoundReader(booking.courseId, bookingId, actor);
      return chargeBooking(bookingId, opts, mode, actor, true);
    }
    return { error: 'This group is being paid on the card reader at the pro shop — finish or cancel it there first.', status: 409 } as const;
  }

  // Already paid (e.g. an earlier charge-only collect). Never charge twice.
  const alreadyPaid = booking.paymentStatus === 'paid' && !!booking.roundPaymentIntentId;
  if (alreadyPaid && !mode.recordCheckIn) {
    return { error: 'This round has already been paid — there is nothing to retry.', status: 409 } as const;
  }

  // (A reader payment already moved the money on the course's account — record it whatever the flag says.)
  if (!alreadyPaid && !opts?.cardPresent && (!booking.course.stripeAccountActive || !booking.course.stripeAccountId)) {
    return { error: 'Stripe setup incomplete — the operator needs to finish Stripe onboarding in dashboard Settings before card payments can be accepted.', status: 422 } as const;
  }

  // B-5: "Add a cart today?" — only for a booking with no cart, only before
  // money moves, only when the tee time actually prices a cart. The booking's
  // own totals change first so the charge, the receipt and the ledger agree.
  let cartAddedCents = 0;
  const preCart = { cartSelected: booking.cartSelected, cartFeeTotal: booking.cartFeeTotal, totalAmount: booking.totalAmount };
  if (opts?.addCart && !alreadyPaid) {
    cartAddedCents = await cartAddOnCentsFor(booking);
    if (cartAddedCents > 0) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { cartSelected: true, cartFeeTotal: cartAddedCents, totalAmount: booking.totalAmount + cartAddedCents },
      });
      booking.cartSelected = true;
      booking.cartFeeTotal = cartAddedCents;
      booking.totalAmount = booking.totalAmount + cartAddedCents;
      console.log(JSON.stringify({ ev: 'checkin.cart_added', bookingId, cartAddedCents }));
    }
  }

  // SD-5: partial party. Per-player lines (green, cart, booking fee) scale to
  // the headcount that showed; range balls are one bucket and stay whole. The
  // booking's own totals change first so the charge, the receipt and the
  // ledger agree — and are rolled back with the cart on a definite non-charge.
  const prePartial = { greenFeeTotal: booking.greenFeeTotal, cartFeeTotal: booking.cartFeeTotal, accessFeeTotal: booking.accessFeeTotal, totalAmount: booking.totalAmount };
  let partialApplied = false;
  const showed = opts?.checkedInPlayers;
  if (showed != null && Number.isInteger(showed) && showed >= 1 && showed < booking.players && !alreadyPaid) {
    // The member's own spot (Cam 2026-10-29) or the residents (RES-1) are
    // counted first among those who showed; the others pay what the booking's
    // other players pay (lib/member-rates partyFees).
    const { greenFeeTotal, cartFeeTotal } = partyFees(booking, showed, booking.teeTime);
    const accessFeeTotal = Math.round(booking.accessFeeTotal * showed / booking.players);
    const totalAmount = greenFeeTotal + cartFeeTotal + accessFeeTotal + booking.rangeBallsTotal;
    await prisma.booking.update({ where: { id: bookingId }, data: { greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount, checkedInPlayers: showed } });
    booking.greenFeeTotal = greenFeeTotal; booking.cartFeeTotal = cartFeeTotal; booking.accessFeeTotal = accessFeeTotal; booking.totalAmount = totalAmount;
    partialApplied = true;
    console.log(JSON.stringify({ ev: 'checkin.partial_party', bookingId, players: booking.players, showed, totalAmount }));
  }

  const refundPendingFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;
  // SD-4: `feeRefunded` used to be this flag — the INTENT to refund. The
  // attempt below can fail, and when it did the dashboard toast, the golfer's
  // receipt and the self-check-in page all said "refunded". Track the outcome.
  let feeRefundOk = false;
  let feeRefundError = '';
  let paymentIntentId = booking.roundPaymentIntentId;
  /** What this attempt's PaymentIntent took (null when no new charge was made). */
  let chargedCents: number | null = null;

  // ── Money ────────────────────────────────────────────────────────────────
  // Skipped entirely when a prior collectPayment() already took it; this is
  // the check-in-after-collect path, and re-charging would be a real second
  // charge if the payment method had changed since.
  if (!alreadyPaid) {
    // Determine which customer + PM to charge.
    // For saved-card bookings: use the stored IDs.
    // For walk-up (no card at booking time): create a temporary platform Customer,
    // attach the freshly entered PM, then clone-and-charge below.
    let chargeCustomerId = booking.stripeCustomerId;
    let chargePaymentMethodId = booking.stripePaymentMethodId;
    const externalPm = opts?.externalPaymentMethodId;

    // SD review: a card entered at the counter used to be honoured ONLY when
    // the booking had no saved card. After a decline, "Retry with new card"
    // therefore re-charged the declined card under the same idempotency key
    // and Stripe replayed the decline. A fresh card always wins.
    if (externalPm) {
      try {
        let customerId = chargeCustomerId;
        if (!customerId) {
          const tempCustomer = await stripe.customers.create({
            email: booking.golferEmail,
            name: booking.golferName,
            metadata: { bookingId: booking.id, source: 'walk_up_checkin' },
          });
          customerId = tempCustomer.id;
        }
        await stripe.paymentMethods.attach(externalPm, { customer: customerId });
        chargeCustomerId = customerId;
        chargePaymentMethodId = externalPm;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save card.';
        return { error: `Card setup failed: ${message}`, status: 402 } as const;
      }
    } else if (!chargePaymentMethodId && !opts?.cardPresent) {
      return { error: 'No card on file -- enter card details to complete check-in.', status: 422 } as const;
    }

    const ev = mode.recordCheckIn ? 'checkin' : 'collect';

    // POS-1a (security review): from here a charge may move money, so the
    // shop items freeze — set the lock, then read them again. A shop write
    // holding the row (lib/shop.ts lockBooking) finishes first and is seen;
    // any later one is refused. The lock is lifted only on a definite non-charge.
    // The stamp is this attempt's: only this attempt may lift it, so an
    // overlapping attempt's decline never unfreezes a charge still in flight.
    const lockStamp = new Date();
    {
      const locked = await prisma.booking.update({ where: { id: bookingId }, data: { shopLockedAt: lockStamp }, select: { shopTotalCents: true, shopFeeCents: true } });
      booking.shopTotalCents = locked.shopTotalCents;
      booking.shopFeeCents = locked.shopFeeCents;
    }
    const unlock = () => prisma.booking.updateMany({ where: { id: bookingId, shopLockedAt: lockStamp }, data: { shopLockedAt: null } });
    // W2-7 B2: the sales tax on the shop items, worked out NOW — under this
    // charge's own lock, so it is for exactly the items being charged (no shop
    // write can land in between). Never charge on a stale or missing figure.
    {
      const taxed = await ensureShopTax(bookingId, { ownLock: lockStamp });
      // POS-3 R3b: a reader payment is already taken (its tax was worked out when it started) — never refuse to record it.
      if (!taxed.ok && !opts?.cardPresent) { await unlock(); return { error: taxed.error, status: 503 } as const; }
      if (taxed.ok) booking.shopTaxCents = taxed.shopTaxCents;
    }
    if (!opts?.cardPresent && opts?.expectedTotalCents != null && Number(opts.expectedTotalCents) !== roundChargeCents(booking)) {
      await unlock();
      return { error: 'The total changed since this page loaded — the course updated the round. Refresh to see the new total, then pay.', status: 409 } as const;
    }

    if (opts?.cardPresent) {
      // POS-3 R3b: the money moved on the reader. Record exactly what Stripe took.
      paymentIntentId = opts.cardPresent.paymentIntentId;
      chargedCents = opts.cardPresent.amountCents;
      if (chargedCents !== roundChargeCents(booking)) {
        console.error(JSON.stringify({ ev: `${ev}.reader.amount_mismatch`, bookingId, charged: chargedCents, due: roundChargeCents(booking) }));
      }
    } else {
    // Review (security, MEDIUM): a new card changes the idempotency key. If
    // the FIRST attempt actually succeeded at Stripe but the response never
    // reached us (timeout), a retry with a new card — or, since B-5, a retry
    // at a different amount (cart added) — would be a new Stripe request and
    // a second full charge. Ask Stripe whether this booking already has a
    // succeeded charge before charging at all. (Security review: this used to
    // run only for a new card.)
    {
      try {
        const found = await stripe.paymentIntents.search(
          { query: `metadata['bookingId']:'${booking.id}' AND status:'succeeded'`, limit: 1 },
          { stripeAccount: booking.course.stripeAccountId as string },
        );
        // A refunded charge is not "this charge" — the course may still collect.
        // Refund state lives in our ledger (refund-booking.ts sets paymentStatus
        // 'refunded' and keeps the PI id); the PaymentIntent object carries no
        // refunded amount in this SDK.
        const prior = found.data.find(pi => !(booking.paymentStatus === 'refunded' && pi.id === booking.roundPaymentIntentId));
        if (prior) {
          console.warn(JSON.stringify({ ev: `${ev}.charge.already_succeeded`, bookingId, paymentIntentId: prior.id, amount: prior.amount }));
          // Reconcile the booking to what Stripe actually took, not to what
          // this attempt assumed: base+cart if the earlier attempt had the
          // cart, base if it did not, and the exact figure otherwise.
          // POS-1a: the charge also carries any shop items and their fee, which
          // live in their own columns — compare with them added, and never fold
          // them into the round's totalAmount.
          const base = preCart.totalAmount;
          const shopExtra = roundChargeCents({ totalAmount: 0, shopTotalCents: booking.shopTotalCents, shopFeeCents: booking.shopFeeCents, shopTaxCents: booking.shopTaxCents });
          const matchesCart = prior.amount === base + cartAddedCents + shopExtra && cartAddedCents > 0;
          const matchesBase = prior.amount === base + shopExtra;
          if (!matchesCart && !matchesBase && shopExtra > 0) {
            // The stored PaymentIntent amount below is what refunds and receipts
            // use; never invent a round total from a figure that does not add up.
            console.error(JSON.stringify({ ev: `${ev}.charge.prior_amount_mismatch`, bookingId, priorAmount: prior.amount, base, cartAddedCents, shopExtra }));
          }
          const money = matchesCart
            ? { cartSelected: true, cartFeeTotal: cartAddedCents, totalAmount: base + cartAddedCents }
            : matchesBase
              ? preCart
              : shopExtra > 0 ? {} : { totalAmount: prior.amount };
          await prisma.booking.update({ where: { id: bookingId }, data: { roundPaymentIntentId: prior.id, roundChargedCents: prior.amount, paymentStatus: 'paid', paidAt: new Date(prior.created * 1000), checkInFailReason: '', ...money } });
          // LEDGER-1: the earlier charge is money that moved; the PaymentIntent id dedupes it.
          await recordMove({ courseId: booking.courseId, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: prior.amount, platformFeeCents: prior.application_fee_amount ?? 0, stripeId: prior.id, bookingId, actor: actor.type, at: new Date(prior.created * 1000), note: 'found on Stripe after a lost reply' });
          return { error: 'This round was already charged on an earlier attempt (the confirmation was lost in transit). It is now recorded as paid — refresh and check in without a card.', status: 409 } as const;
        }
      } catch (err) {
        // Search is best-effort; a failure here must not block the counter.
        console.warn(JSON.stringify({ ev: `${ev}.charge.search_failed`, bookingId, error: err instanceof Error ? err.message : String(err) }));
      }
    }

    try {
      console.log(JSON.stringify({ ev: `${ev}.charge.attempt`, bookingId, amountCents: roundChargeCents(booking), shopCents: booking.shopTotalCents + booking.shopFeeCents }));
      const paymentIntent = await chargeOnConnectedAccount({
        customerId: chargeCustomerId,
        paymentMethodId: chargePaymentMethodId,
        connectedAccountId: booking.course.stripeAccountId as string,
        amountCents: roundChargeCents(booking),
        applicationFeeCents: roundApplicationFeeCents(booking),
        description: `Round charge - ${booking.course.name} - booking ${booking.id}`,
        metadata: { bookingId: booking.id },
        // Unchanged on purpose: the key is the booking + payment method, NOT
        // the entry point, so a collect followed by a check-in (or a retry
        // after a timeout) can never become two charges.
        // Booking + card, and NOTHING else: a retry at the same amount replays
        // the original result; a retry at a different amount (cart added after
        // a timed-out attempt) makes Stripe refuse the reused key — an error
        // the golfer sees, never a second charge. (Second security review:
        // putting the amount in the key turned that refusal into a fresh
        // request, and a search index that lags by a minute cannot stand in
        // for idempotency.)
        idempotencyKey: `checkin-${booking.id}-${chargePaymentMethodId}`,
      });
      paymentIntentId = paymentIntent.id;
      chargedCents = paymentIntent.amount;
      console.log(JSON.stringify({ ev: `${ev}.charge.ok`, bookingId, paymentIntentId, amountCents: roundChargeCents(booking) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Card could not be charged.';
      const errType = (err as { type?: string })?.type ?? '';
      // Stripe told us, definitively, that no money moved: a card decline, or a
      // reused idempotency key with different params (the total changed since
      // the first attempt). Anything else — a timeout, a dropped connection —
      // may have charged, so the cart stays on the booking for reconciliation.
      // Stripe's "another in-progress request using this key" means a twin
      // attempt is charging right now — not a definite no-charge.
      const inProgress = /in[- ]progress/i.test(message);
      const definite = !inProgress && (errType === 'StripeCardError' || errType === 'StripeIdempotencyError' || /idempotent|idempotency/i.test(message));
      console.error(JSON.stringify({ ev: `${ev}.charge.fail`, bookingId, errType, definite, error: message }));
      await prisma.booking.update({ where: { id: bookingId }, data: { checkInFailReason: message, ...(cartAddedCents > 0 && definite ? preCart : {}), ...(partialApplied && definite ? { ...prePartial, checkedInPlayers: null } : {}) } });
      if (definite) await unlock();
      if (inProgress) {
        return { error: 'This round is being charged right now from another screen — wait a moment and refresh.', status: 409 } as const;
      }
      if (/idempotent|idempotency/i.test(message)) {
        return { error: 'The total changed since the first attempt with this card (a cart or a shop item was added or removed). Put the total back as it was, or use a different card.', status: 409 } as const;
      }
      return { error: `Payment failed: ${message}. Collect payment in person and contact support.`, status: 402 } as const;
    }
    } // end card charge (not the reader)

    if (refundPendingFee) {
      try {
        const refund = await refundOnConnectedAccount({
          paymentIntentId: booking.cancellationFeeChargeId,
          connectedAccountId: booking.course.stripeAccountId as string,
        });
        feeRefundOk = true;
        await recordMove({ courseId: booking.courseId, what: 'hold', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, stripeId: refund.id, bookingId, actor: actor.type, note: 'hold given back at check-in' });
        // EV-1: the cutoff HOLD comes back at check-in — reporting nets this
        // against the cron's fee_charged (reason cutoff_hold).
        await recordBookingEventSafe({
          bookingId, courseId: booking.courseId, type: 'fee_refunded', actor,
          amountCents: refund.amount, playerCount: booking.players,
          teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
          stripeId: refund.id, metadata: { reason: 'hold_refunded_at_checkin' },
        });
        console.log(JSON.stringify({ ev: `${ev}.fee_refund.ok`, bookingId, cancelFeeChargeId: booking.cancellationFeeChargeId }));
      } catch (err) {
        // The round charge already succeeded -- don't fail over a refund
        // hiccup. Log it AND report it, so the person at the counter knows
        // the golfer is still out the fee until someone issues it in Stripe.
        feeRefundError = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ ev: `${ev}.fee_refund.fail`, bookingId, error: feeRefundError }));
      }
    }

    // FB-3: if GreenReserve's fee was already charged on its own (a no-show
    // that turned up after all), this round charge carries it again — give the
    // separate one back. Never fails the check-in; the ledger records a miss.
    if (booking.stripePaymentIntentId) {
      await refundSeparateAccessFee(bookingId, 'golfer checked in and paid by card', 'system');
    }
  }

  // ── Record ───────────────────────────────────────────────────────────────
  // EV-1 review (security MEDIUM): money has already moved here, so recording
  // it is ONE plain update (no interactive transaction that can time out after
  // the charge) and the checked_in event is written after, best-effort —
  // stripeId (the round's PaymentIntent) dedupes a retry.
  {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'paid',
        ...(alreadyPaid ? {} : { paidAt: new Date() }),
        roundPaymentIntentId: paymentIntentId,
        ...(chargedCents != null ? { roundChargedCents: chargedCents } : {}),
        checkInFailReason: '',
        // Only a real check-in completes the booking and stamps the arrival.
        // NS-EOD: a group that arrives after being flagged a no-show is no longer one.
        ...(mode.recordCheckIn ? { status: 'completed', checkedInAt: new Date(), noShowAt: null, ...(partialApplied ? { checkedInPlayers: showed } : {}) } : {}),
      },
    });
    // LEDGER-1: the round's charge (card or reader), with GreenReserve's application fee.
    if (paymentIntentId && chargedCents != null && !alreadyPaid) {
      await recordMove({ courseId: booking.courseId, what: 'round', direction: 'in', method: opts?.cardPresent ? 'card_present' : 'card', account: 'course', amountCents: chargedCents, platformFeeCents: roundApplicationFeeCents(booking), stripeId: paymentIntentId, bookingId, actor: actor.type });
    }
    if (mode.recordCheckIn) {
      await recordBookingEventSafe({
        bookingId, courseId: booking.courseId, type: 'checked_in', actor,
        amountCents: booking.totalAmount, playerCount: partialApplied ? (showed as number) : booking.players,
        teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
        stripeId: paymentIntentId || null,
        metadata: { paidOffline: false, alreadyPaid, cartAddedCents, shopCents: booking.shopTotalCents, shopFeeCents: booking.shopFeeCents, shopTaxCents: booking.shopTaxCents },
      });
    }
    // W2-7 B2: the shop items' sales tax goes on the course's tax record now it's paid (the hourly cron retries).
    await recordRoundShopTax(bookingId);
  }

  if (mode.recordCheckIn) {
    await sendCheckInReceiptEmail({
      golferName: booking.golferName,
      golferEmail: booking.golferEmail,
      courseName: booking.course.name,
      courseSlug: booking.course.slug,
      date: booking.teeTime.date,
      time: booking.teeTime.time,
      players: partialApplied ? (showed as number) : booking.players,
      greenFeeTotal: booking.greenFeeTotal,
      cartFeeTotal: booking.cartFeeTotal,
      rangeBallsTotal: booking.rangeBallsTotal,
      accessFeeTotal: booking.accessFeeTotal,
      feePaidAtBookingCents: feeCoveredCents(booking),
      totalAmount: chargedCents ?? booking.roundChargedCents ?? roundChargeCents(booking),
      shopLines: booking.shopTotalCents > 0 ? await shopLinesFor(bookingId) : [],
      shopFeeCents: booking.shopFeeCents,
      shopTaxCents: booking.shopTaxCents,
      feeRefunded: feeRefundOk,
      feeRefundFailed: refundPendingFee && !feeRefundOk,
      feeRefundAmount: booking.cancellationFeeTotal,
      bookingId: booking.id,
      checkInToken: booking.checkInToken,
    }).catch(console.error);
  }

  return {
    success: true,
    totalCharged: chargedCents ?? booking.roundChargedCents ?? roundChargeCents(booking),
    /** The late-cancellation fee was actually refunded. */
    feeRefunded: feeRefundOk,
    /** A fee was owed back and the refund FAILED — someone must issue it in Stripe. */
    feeRefundFailed: refundPendingFee && !feeRefundOk,
    feeRefundError: refundPendingFee && !feeRefundOk ? feeRefundError : '',
    feeRefundAmount: refundPendingFee ? booking.cancellationFeeTotal : 0,
    alreadyPaid,
    /** B-5: cents added for a cart at check-in (0 when none). */
    cartAddedCents,
  } as const;
}

/** Charge the round AND record the arrival + receipt. Staff and self check-in. */
export async function performCheckIn(bookingId: string, actor: EventActor, opts?: ChargeOpts) {
  return chargeBooking(bookingId, opts, { recordCheckIn: true }, actor);
}

/**
 * Charge the round ONLY. The golfer is not checked in and gets no receipt —
 * used by admin "Collect payment" on a previously failed charge, where the
 * round may be days away.
 */
export async function collectPayment(bookingId: string, actor: EventActor, opts?: ChargeOpts) {
  return chargeBooking(bookingId, opts, { recordCheckIn: false }, actor);
}

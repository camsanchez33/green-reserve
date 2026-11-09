// CART-3 (Cam 2026-11-09: "still cant add or take off a cart on the checkout … that whole thing has to be sorted out";
// "range balls need to be done now aswell"; picked "Riding − N +" and "Buckets − N + at checkout"). At checkout staff set
// how many of the group RIDE and how many range-ball buckets of each size they take, before the round is paid.
//
//  • Riders follow the course's cart rule. Per cart (Course.cartPricing 'per_cart', or a booking already made per
//    cart): a cart for every two riders at the booking's own cart price (or the tee time's, taking a cart for the first
//    time) — lib/cart-pricing. Per player: each rider pays the cart price; a member rides first at the member cart
//    rate, everyone else at the price a rider on this booking already paid (or the tee time's cart price when none
//    rode). The count is kept in Booking.cartRiders; lib/member-rates partyFees gives the booker's side the riders
//    first, so a partial check-in, Pay separately or a party-size change charge the riders, never the walkers.
//  • A time that can't be walked keeps every player riding.
//  • Range balls: each size at the course's price (Settings → range; free = $0); the counts are kept on the booking as
//    "small:2,large:1" in rangeBallsSize (a single size word from an online booking reads as one bucket).
//  • Refused once the round is paid, being paid, checked in, a no-show, on a round pack, or an event time — the same
//    gates as residents (lib/booking-residents). Conditional update on what was read; one price_changed event.
import { prisma } from './prisma';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';
import { cartsFor, cartRuleOf } from './cart-pricing';
import { BALL_SIZES, MAX_BUCKETS, ballCounts, ballField, type BallCounts, type BallSize } from './range-balls';

export type ExtrasResult =
  | { ok: true; cartRiders: number; cartFeeTotal: number; rangeBallsTotal: number; totalAmount: number }
  | { ok: false; status: number; error: string };
const fail = (status: number, error: string): ExtrasResult => ({ ok: false, status, error });

export async function setCheckoutExtras(courseId: string, bookingId: string, input: { riders?: unknown; balls?: unknown }, actor: EventActor): Promise<ExtrasResult> {
  return prisma.$transaction(async tx => {
    const b = await tx.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, courseId: true, status: true, players: true, appliedRate: true, paymentStatus: true, paidOffline: true,
        checkedInAt: true, noShowAt: true, roundPaymentIntentId: true, shopLockedAt: true, readerStartedAt: true,
        cartSelected: true, cartFeeTotal: true, cartUnitCents: true, cartRiders: true, memberRateCents: true, memberCartCents: true,
        rangeBallsSize: true, rangeBallsTotal: true, totalAmount: true,
        teeTime: { select: { date: true, time: true, cartFeeCents: true, walkingAllowed: true, eventId: true } },
        course: { select: { timezone: true, cartPricing: true, rangeBallsFree: true, rangeBallsSmallPriceCents: true, rangeBallsMediumPriceCents: true, rangeBallsLargePriceCents: true } },
      },
    });
    if (!b || b.courseId !== courseId) return fail(404, 'Booking not found.');
    if (b.status !== 'confirmed' || b.checkedInAt) return fail(409, 'This group is already checked in — its price can’t change now.');
    if (b.noShowAt) return fail(409, 'This group is marked a no-show. Use "Still coming" first.');
    if (b.paymentStatus === 'paid' || b.paidOffline || b.roundPaymentIntentId || b.shopLockedAt || b.readerStartedAt) return fail(409, 'This round is already paid or being paid — its price can’t change now.');
    if (b.appliedRate === 'pack') return fail(409, 'This group is on a round pack — change it at the register.');
    if (b.teeTime.eventId) return fail(409, 'This is an event time — carts and range balls are set on the event.');

    // ── riders ──
    const nowRiders = b.cartSelected ? (b.cartRiders ?? b.players) : 0;
    let riders = nowRiders, cartFeeTotal = b.cartFeeTotal, cartUnitCents = b.cartUnitCents, memberCartCents = b.memberCartCents;
    if (input.riders !== undefined) {
      const r = Number(input.riders);
      if (!Number.isInteger(r) || r < 0 || r > b.players) return fail(400, `Riding must be 0 to ${b.players}.`);
      if (b.teeTime.walkingAllowed === false && r < b.players) return fail(409, 'This time can’t be walked — everyone rides.');
      riders = r;
      const perCart = b.cartUnitCents != null || (!b.cartSelected && cartRuleOf(b.course.cartPricing) === 'per_cart');
      if (riders === 0) { cartFeeTotal = 0; }
      else if (perCart) {
        cartUnitCents = b.cartUnitCents ?? b.teeTime.cartFeeCents;
        cartFeeTotal = cartsFor(riders) * cartUnitCents;
        memberCartCents = null;
      } else {
        // A member rides first at their member cart rate — kept on the booking even when it was booked walking.
        // The other riders pay what a rider on this booking already pays, else the tee time's cart price.
        const memberCart = b.memberRateCents != null ? b.memberCartCents : null;
        const guestRiders = nowRiders - (memberCart != null ? 1 : 0);
        const guestPer = b.cartSelected && guestRiders > 0 ? Math.round((b.cartFeeTotal - (memberCart ?? 0)) / guestRiders) : b.teeTime.cartFeeCents;
        cartFeeTotal = memberCart != null ? memberCart + (riders - 1) * guestPer : riders * guestPer;
        memberCartCents = b.memberCartCents;
      }
    }

    // ── range balls ──
    let counts = ballCounts(b.rangeBallsSize, b.rangeBallsTotal);
    let rangeBallsTotal = b.rangeBallsTotal;
    if (input.balls !== undefined) {
      const raw = (input.balls && typeof input.balls === 'object' ? input.balls : {}) as Record<string, unknown>;
      const next: BallCounts = { small: 0, medium: 0, large: 0 };
      for (const k of BALL_SIZES) {
        const n = raw[k] === undefined ? 0 : Number(raw[k]);
        if (!Number.isInteger(n) || n < 0 || n > MAX_BUCKETS) return fail(400, `Buckets are 0 to ${MAX_BUCKETS} of each size.`);
        next[k] = n;
      }
      const price: BallCounts = b.course.rangeBallsFree ? { small: 0, medium: 0, large: 0 }
        : { small: b.course.rangeBallsSmallPriceCents, medium: b.course.rangeBallsMediumPriceCents, large: b.course.rangeBallsLargePriceCents };
      const offered = (k: BallSize) => b.course.rangeBallsFree || price[k] > 0;
      for (const k of BALL_SIZES) if (next[k] > 0 && !offered(k)) return fail(409, `This course has no ${k} bucket price — set one in Settings.`);
      counts = next;
      rangeBallsTotal = BALL_SIZES.reduce((s, k) => s + counts[k] * price[k], 0);
    }

    const totalAmount = b.totalAmount + (cartFeeTotal - b.cartFeeTotal) + (rangeBallsTotal - b.rangeBallsTotal);
    if (totalAmount < 0) return fail(409, 'That would make the total negative — refresh and try again.');
    if (riders === nowRiders && cartFeeTotal === b.cartFeeTotal && rangeBallsTotal === b.rangeBallsTotal && ballField(counts) === ballField(ballCounts(b.rangeBallsSize, b.rangeBallsTotal))) {
      return { ok: true, cartRiders: riders, cartFeeTotal, rangeBallsTotal, totalAmount: b.totalAmount };
    }
    // Conditional on what was just read: a charge that started in between leaves this undone, never half-applied.
    const done = await tx.booking.updateMany({
      where: { id: b.id, status: 'confirmed', totalAmount: b.totalAmount, cartFeeTotal: b.cartFeeTotal, rangeBallsTotal: b.rangeBallsTotal, roundPaymentIntentId: '', shopLockedAt: null, readerStartedAt: null, checkedInAt: null },
      data: {
        cartSelected: riders > 0, cartFeeTotal, cartRiders: riders > 0 && !(riders === b.players && cartUnitCents == null) ? riders : null, cartUnitCents: riders > 0 ? cartUnitCents : b.cartUnitCents, memberCartCents: riders > 0 ? memberCartCents : b.memberCartCents,
        rangeBallsSize: ballField(counts), rangeBallsTotal, totalAmount,
      },
    });
    if (done.count === 0) return fail(409, 'This booking just changed — refresh and try again.');
    await recordBookingEvent(tx, {
      bookingId: b.id, courseId: b.courseId, type: 'price_changed', actor,
      amountCents: totalAmount, playerCount: b.players,
      teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time),
      metadata: { reason: 'checkout_extras', ridersBefore: nowRiders, ridersAfter: riders, cartBefore: b.cartFeeTotal, cartAfter: cartFeeTotal, ballsBefore: b.rangeBallsTotal, ballsAfter: rangeBallsTotal, buckets: ballField(counts) },
    });
    return { ok: true, cartRiders: riders, cartFeeTotal, rangeBallsTotal, totalAmount };
  });
}

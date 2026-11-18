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
//  • Range balls (RANGE-1, replaces CART-3's three sizes): the course's own buckets (lib/range-buckets — its one list,
//    the register's too). A bucket already on the booking keeps its booked price; a new one is at the list price now
//    ($0 while balls come with a round). Kept as booked in Booking.rangeBuckets; rangeBallsTotal is their sum. A booking
//    from before the list keeps its buckets whole ("as booked") or has them taken off whole.
//  • Refused once the round is paid, being paid, checked in, a no-show, on a round pack, or an event time — the same
//    gates as residents (lib/booking-residents). Conditional update on what was read; one price_changed event.
import { prisma } from './prisma';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';
import { cartsFor, cartRuleOf } from './cart-pricing';
import { Prisma } from '@prisma/client';
import { applyChange, courseBuckets, linesOf, snapshotOf } from './range-buckets';

export type ExtrasResult =
  | { ok: true; cartRiders: number; cartFeeTotal: number; rangeBallsTotal: number; totalAmount: number }
  | { ok: false; status: number; error: string };
const fail = (status: number, error: string): ExtrasResult => ({ ok: false, status, error });

export async function setCheckoutExtras(courseId: string, bookingId: string, input: { riders?: unknown; balls?: unknown; buckets?: unknown }, actor: EventActor): Promise<ExtrasResult> {
  return prisma.$transaction(async tx => {
    // RANGE-1: two taps on the bucket rows can't each write lines without the other's (the shop's row lock, lib/shop).
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const b = await tx.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, courseId: true, status: true, players: true, appliedRate: true, paymentStatus: true, paidOffline: true,
        checkedInAt: true, noShowAt: true, roundPaymentIntentId: true, shopLockedAt: true, readerStartedAt: true,
        cartSelected: true, cartFeeTotal: true, cartUnitCents: true, cartRiders: true, memberRateCents: true, memberCartCents: true,
        rangeBallsSize: true, rangeBallsTotal: true, rangeBuckets: true, totalAmount: true,
        teeTime: { select: { date: true, time: true, cartFeeCents: true, walkingAllowed: true, eventId: true } },
        course: { select: { timezone: true, cartPricing: true, hasDrivingRange: true, rangeBallsFree: true } },
      },
    });
    if (!b || b.courseId !== courseId) return fail(404, 'Booking not found.');
    if (b.status !== 'confirmed' || b.checkedInAt) return fail(409, 'This group is already checked in — its price can’t change now.');
    if (b.noShowAt) return fail(409, 'This group is marked a no-show. Use "Undo no-show" first.');
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
    // CART-3's { small, medium, large } came from a page from before the bucket list: refused, never re-priced.
    if (input.balls !== undefined) return fail(409, 'This page is out of date — refresh it to see your range buckets.');
    const before = linesOf(b);
    let lines = before;
    let rangeBallsTotal = b.rangeBallsTotal;
    if (input.buckets !== undefined) {
      const r = applyChange(before, input.buckets, b.course.hasDrivingRange ? await courseBuckets(tx, b.courseId) : [], b.course.rangeBallsFree);
      if (!r.ok) return fail(r.status, b.course.hasDrivingRange ? r.error : 'Turn on the driving range in Settings to sell buckets.');
      // Range turned off: buckets already on the booking can still come off (never charged for balls it can't have).
      lines = r.lines;
      rangeBallsTotal = r.total;
    }
    const bucketsSame = JSON.stringify(lines) === JSON.stringify(before);

    const totalAmount = b.totalAmount + (cartFeeTotal - b.cartFeeTotal) + (rangeBallsTotal - b.rangeBallsTotal);
    if (totalAmount < 0) return fail(409, 'That would make the total negative — refresh and try again.');
    if (riders === nowRiders && cartFeeTotal === b.cartFeeTotal && rangeBallsTotal === b.rangeBallsTotal && bucketsSame) {
      return { ok: true, cartRiders: riders, cartFeeTotal, rangeBallsTotal, totalAmount: b.totalAmount };
    }
    // Conditional on what was just read: a charge that started in between leaves this undone, never half-applied.
    const done = await tx.booking.updateMany({
      where: { id: b.id, status: 'confirmed', totalAmount: b.totalAmount, cartFeeTotal: b.cartFeeTotal, rangeBallsTotal: b.rangeBallsTotal, roundPaymentIntentId: '', shopLockedAt: null, readerStartedAt: null, checkedInAt: null },
      data: {
        cartSelected: riders > 0, cartFeeTotal, cartRiders: riders > 0 && !(riders === b.players && cartUnitCents == null) ? riders : null, cartUnitCents: riders > 0 ? cartUnitCents : b.cartUnitCents, memberCartCents: riders > 0 ? memberCartCents : b.memberCartCents,
        // RANGE-1: the lines are the record; a pre-list size word goes once its buckets are written as lines.
        ...(bucketsSame ? {} : { rangeBallsSize: '', rangeBuckets: snapshotOf(lines) ?? Prisma.DbNull }),
        rangeBallsTotal, totalAmount,
      },
    });
    if (done.count === 0) return fail(409, 'This booking just changed — refresh and try again.');
    await recordBookingEvent(tx, {
      bookingId: b.id, courseId: b.courseId, type: 'price_changed', actor,
      amountCents: totalAmount, playerCount: b.players,
      teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time),
      metadata: { reason: 'checkout_extras', ridersBefore: nowRiders, ridersAfter: riders, cartBefore: b.cartFeeTotal, cartAfter: cartFeeTotal, ballsBefore: b.rangeBallsTotal, ballsAfter: rangeBallsTotal, buckets: lines.map(l => `${l.qty}x${l.itemId ?? 'booked'}@${l.unitCents}`).join(',') },
    });
    return { ok: true, cartRiders: riders, cartFeeTotal, rangeBallsTotal, totalAmount };
  });
}

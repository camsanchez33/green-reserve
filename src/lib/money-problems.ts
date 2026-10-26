import { prisma } from './prisma';
import { ON_REAL_BOOKING } from './real-courses';

// MP-8a. The two "money that should exist and does not" predicates, shared by
// /api/admin/revenue (the Problems block and its badge count) and
// /api/admin/nav-badges (the sidebar). One definition, so the badge on the
// rail and the list it opens can never count different rows.

/** Failed charge: the card was tried at check-in and declined; nobody has collected since. */
export const FAILED_CHARGE_WHERE = { checkInFailReason: { not: '' }, checkedInAt: null } as const;

/**
 * Missed check-in: the tee time has passed, the booking still stands, and no
 * one ever charged it. Not a failed card — nothing was tried. Every one of
 * these is a fee that the old accrual headline counted as earned.
 */
export function missedCheckInWhere(todayStr: string) {
  return {
    status: 'confirmed', checkedInAt: null, checkInFailReason: '',
    paymentStatus: { not: 'paid' },
    teeTime: { date: { lt: todayStr } },
  } as const;
}


/**
 * MP-6b: disputes the bank opened that Stripe has not closed. The webhook
 * writes one 'dispute_opened' row per dispute (stripeId `<dispute>:open`) and
 * one 'dispute_closed' row when it resolves (`<dispute>:closed`).
 */
export async function openDisputes() {
  const [opened, closed] = await Promise.all([
    prisma.paymentEvent.findMany({
      where: { kind: 'dispute_opened' },
      select: { id: true, bookingId: true, amountCents: true, stripeId: true, detail: true, createdAt: true,
        booking: { select: { golferName: true, golferEmail: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.paymentEvent.findMany({ where: { kind: 'dispute_closed' }, select: { stripeId: true } }),
  ]);
  const closedIds = new Set(closed.map(c => c.stripeId.replace(/:closed$/, '')));
  return opened.filter(o => !closedIds.has(o.stripeId.replace(/:open$/, '')));
}

/** How far back a failed refund or a declined hold is still worth raising. */
export const MONEY_EVENT_LOOKBACK_DAYS = 60;

/**
 * R-PAY-010 follow-up: money that moved wrong and nobody sees it.
 *  - A failed refund: we owe a golfer money and Stripe refused to send it. Open
 *    until a refund on that booking is recorded after it — ours, or one made in
 *    the Stripe dashboard (the webhook records those as 'refund' / 'fee_refunded').
 *  - A declined cancellation hold (lib/cutoff-hold): the course's late-cancel
 *    protection is missing for that round. Open while the booking is still
 *    confirmed with only a card on file and its date hasn't passed.
 * Real courses only (TEST-2).
 */
export async function openMoneyEventProblems(now: Date, todayStr: string) {
  const since = new Date(now.getTime() - MONEY_EVENT_LOOKBACK_DAYS * 86_400_000);
  const booking = { select: { id: true, golferName: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true } } } } as const;
  const [refundFailed, holdsDeclined] = await Promise.all([
    prisma.paymentEvent.findMany({
      where: { kind: 'refund_failed', createdAt: { gte: since }, ...ON_REAL_BOOKING },
      select: { id: true, bookingId: true, amountCents: true, detail: true, createdAt: true, booking },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.paymentEvent.findMany({
      where: {
        kind: 'charge_failed', detail: { startsWith: 'Cancellation hold' }, createdAt: { gte: since },
        booking: { status: 'confirmed', paymentStatus: 'card_on_file', teeTime: { date: { gte: todayStr } }, course: { isTest: false } },
      },
      select: { id: true, bookingId: true, amountCents: true, detail: true, createdAt: true, booking },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const later = refundFailed.length
    ? await prisma.paymentEvent.findMany({
        where: { bookingId: { in: refundFailed.map(r => r.bookingId) }, kind: { in: ['refund', 'fee_refunded'] } },
        select: { bookingId: true, createdAt: true },
      })
    : [];
  const refundsOwed = refundFailed.filter(r => !later.some(l => l.bookingId === r.bookingId && l.createdAt > r.createdAt));
  // One per booking: the hold is charged once per card, so only its first decline matters.
  const seen = new Set<string>();
  const declinedHolds = holdsDeclined.filter(h => !seen.has(h.bookingId) && (seen.add(h.bookingId), true));
  return { refundsOwed, declinedHolds };
}

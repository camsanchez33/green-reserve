// RES-1 (Cam 2026-10-19): staff set how many of a group are residents, at the
// counter, before the round is paid. Only the green fee changes: residents pay
// the tee time's resident rate, everyone else what the booking's non-residents
// already pay. Members stay on their member rate (no stacking).
import { prisma } from './prisma';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';
import { seatAfter } from './promo-codes';
import { dealRateSeat } from './last-minute';
import { groupGreenFee, otherPerPlayerCents } from './residents';

export type SetResidentsResult =
  | { ok: true; residentPlayers: number; greenFeeTotal: number; totalAmount: number }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): SetResidentsResult => ({ ok: false, status, error });

export async function setBookingResidents(courseId: string, bookingId: string, count: unknown, actor: EventActor): Promise<SetResidentsResult> {
  const n = Number(count);
  return prisma.$transaction(async tx => {
    const b = await tx.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, courseId: true, status: true, players: true, appliedRate: true, paymentStatus: true, paidOffline: true,
        checkedInAt: true, noShowAt: true, roundPaymentIntentId: true, shopLockedAt: true, readerStartedAt: true,
        greenFeeTotal: true, totalAmount: true, residentPlayers: true, residentRateCents: true, promoCodeId: true, lastMinutePct: true,
        teeTime: { select: { date: true, time: true, greenFeeCents: true, residentRateCents: true } },
        course: { select: { timezone: true, lastMinuteStack: true } },
      },
    });
    if (!b || b.courseId !== courseId) return fail(404, 'Booking not found.');
    if (!Number.isInteger(n) || n < 0 || n > b.players) return fail(400, `Residents must be 0 to ${b.players}.`);
    if (b.status !== 'confirmed' || b.checkedInAt) return fail(409, 'This group is already checked in — its price can’t change now.');
    if (b.noShowAt) return fail(409, 'This group is marked a no-show. Use "Still coming" first.');
    if (b.paymentStatus === 'paid' || b.paidOffline || b.roundPaymentIntentId || b.shopLockedAt || b.readerStartedAt) return fail(409, 'This round is already paid or being paid — its price can’t change now.');
    if (b.appliedRate !== 'standard' && b.appliedRate !== 'resident') return fail(409, `This group is booked at the ${b.appliedRate} member rate — residents don’t combine with it.`);
    if (b.teeTime.residentRateCents == null) return fail(409, 'This tee time has no resident price. Set one in Schedule.');
    if (n === b.residentPlayers) return { ok: true, residentPlayers: n, greenFeeTotal: b.greenFeeTotal, totalAmount: b.totalAmount };

    // PRICE-1: a code on the booking that works with rates comes off the resident seat too (seat by seat).
    const code = b.promoCodeId ? await tx.promoCode.findUnique({ where: { id: b.promoCodeId }, select: { kind: true, value: true, withRates: true } }) : null;
    const others = otherPerPlayerCents(b) ?? (code ? seatAfter(code, b.teeTime.greenFeeCents) : b.teeTime.greenFeeCents);
    // PRICE-2: the booking's last-minute deal applies to the resident seat as it would have online.
    const resSeat = dealRateSeat(b.lastMinutePct, b.teeTime.residentRateCents, b.teeTime.greenFeeCents, b.course.lastMinuteStack);
    const priced = groupGreenFee(b.players, others, n, code?.withRates ? seatAfter(code, resSeat) : resSeat);
    const totalAmount = b.totalAmount + (priced.greenFeeTotal - b.greenFeeTotal);
    // Conditional on the price and payment state just read: a charge that
    // started in between leaves this change undone, never half-applied.
    const done = await tx.booking.updateMany({
      where: { id: b.id, greenFeeTotal: b.greenFeeTotal, residentPlayers: b.residentPlayers, roundPaymentIntentId: '', shopLockedAt: null, checkedInAt: null },
      data: {
        residentPlayers: priced.residentPlayers, residentRateCents: priced.residentRateCents,
        greenFeeTotal: priced.greenFeeTotal, totalAmount,
        appliedRate: priced.residentPlayers > 0 ? 'resident' : 'standard',
      },
    });
    if (done.count === 0) return fail(409, 'This booking just changed — refresh and try again.');
    await recordBookingEvent(tx, {
      bookingId: b.id, courseId: b.courseId, type: 'price_changed', actor,
      amountCents: totalAmount, playerCount: b.players,
      teeTimeAt: teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time),
      metadata: { reason: 'residents', residentsBefore: b.residentPlayers, residentsAfter: priced.residentPlayers, greenFeeBefore: b.greenFeeTotal, greenFeeAfter: priced.greenFeeTotal },
    });
    return { ok: true, residentPlayers: priced.residentPlayers, greenFeeTotal: priced.greenFeeTotal, totalAmount };
  });
}

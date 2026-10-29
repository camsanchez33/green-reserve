// POS-3 R2 (Cam 2026-10-24: green fees at the register): one cash sale at the
// register can settle groups' rounds as well as shop items — today's groups
// that haven't paid, and walk-ins booked right there. Each round goes through
// the ONE counter-payment path (lib/counter-pay settleAtCounter: checked in,
// paid at the counter, no GreenReserve fee — PAY-2), then the items and the
// settled rounds are recorded as one walk-up sale so there is one receipt.
// Card for rounds comes with the card reader (R3); until then rounds are cash.
import { prisma } from './prisma';
import { formatTeeTime } from './format';
import { settleAtCounter, createCounterBooking, counterDueCents, type CounterBookingInput } from './counter-pay';
import { roundChargeCents } from './shop';
import { createSale, quoteSale, type DiscountInput, type SaleView, TOTAL_CHANGED } from './shop-sales';
import type { EventActor } from './booking-events';

export const MAX_REGISTER_ROUNDS = 8;

/** Today's groups that still owe at the counter, and the next open tee times for a walk-in. */
export async function registerRounds(courseId: string, date: string, nowTime: string) {
  const [owing, open] = await Promise.all([
    prisma.booking.findMany({
      where: { courseId, status: 'confirmed', paymentStatus: { notIn: ['paid', 'paid_offline'] }, teeTime: { date } },
      select: { id: true, golferName: true, players: true, totalAmount: true, accessFeeTotal: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true, feePaidCents: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, noShowAt: true, teeTime: { select: { time: true, holes: true } } },
      orderBy: { teeTime: { time: 'asc' } },
    }),
    prisma.teeTime.findMany({
      where: { courseId, date, time: { gte: nowTime }, status: { not: 'blocked' } },
      select: { id: true, time: true, holes: true, playersAvailable: true, playersBooked: true, greenFeeCents: true, cartFeeCents: true, walkingAllowed: true, product: { select: { label: true } } },
      orderBy: { time: 'asc' }, take: 40,
    }),
  ]);
  return {
    // dueCents: in cash at the counter (no GreenReserve fee); cardCents: on the card reader (R3b — the round's card charge, booking fee included).
    owing: owing.map(b => ({ bookingId: b.id, time: b.teeTime.time, holes: b.teeTime.holes, golferName: b.golferName, players: b.players, dueCents: counterDueCents(b), cardCents: roundChargeCents(b), noShow: !!b.noShowAt })),
    open: open.filter(t => t.playersAvailable - t.playersBooked > 0).slice(0, 12).map(t => ({
      teeTimeId: t.id, time: t.time, holes: t.holes, round: t.product?.label ?? null, spots: t.playersAvailable - t.playersBooked,
      greenFeeCents: t.greenFeeCents, cartFeeCents: t.cartFeeCents, walkingAllowed: t.walkingAllowed,
    })),
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/**
 * Ring up a cash sale at the register: shop items, today's groups' rounds,
 * walk-ins. Everything is checked before anything changes; rounds are then
 * settled one by one (a group someone else just settled is left out and
 * named), and the sale records exactly what was settled.
 */
export async function ringUpCash(courseId: string, opts: {
  lines: unknown[]; discount?: DiscountInput; cashTenderedCents?: unknown; taxCalculationId?: string;
  /** The items' total the register showed (lib/shop-sales createSale). */
  expectedItemsCents?: unknown;
  bookingIds: string[]; walkIns: CounterBookingInput[];
  /** CASH-1: a group where only some showed pays for those (bookingId → players who showed). */
  headcounts?: Record<string, number>;
  soldBy: string; actor: EventActor; customerName?: string; customerPhone?: string; customerEmail?: string;
}): Promise<Result<{ sale: SaleView; skipped: string[]; notes: string[] }> | { ok: false; status: number; error: string; settled: string[] }> {
  const bookingIds = [...new Set(opts.bookingIds.filter(x => typeof x === 'string' && x))];
  const walkIns = opts.walkIns ?? [];
  if (bookingIds.length + walkIns.length > MAX_REGISTER_ROUNDS) return { ok: false, status: 400, error: `Up to ${MAX_REGISTER_ROUNDS} rounds in one sale.` };
  if (!opts.lines.length && !bookingIds.length && !walkIns.length) return { ok: false, status: 400, error: 'Add something to the sale.' };
  // Check before changing anything: the items price, and every group is this course's and still owes.
  // The items' tax is fixed here, before any round is settled: the sale uses this quote as is, so
  // a Stripe Tax outage starting or ending mid-sale can't leave paid rounds without their sale.
  let presetTax: { taxCents: number; calculationId: string; unavailable: boolean } | undefined;
  if (opts.lines.length) {
    const q = await quoteSale(courseId, opts.lines, opts.discount);
    if (!q.ok) return q;
    if (opts.expectedItemsCents != null && opts.expectedItemsCents !== '' && Number(opts.expectedItemsCents) !== q.value.totalCents) return { ok: false, status: 409, error: TOTAL_CHANGED };
    presetTax = { taxCents: q.value.taxCents, calculationId: q.value.taxCalculationId, unavailable: q.value.taxUnavailable };
  }
  const groups = bookingIds.length ? await prisma.booking.findMany({ where: { id: { in: bookingIds }, courseId }, select: { id: true, status: true, paymentStatus: true } }) : [];
  if (groups.length !== bookingIds.length) return { ok: false, status: 404, error: 'One of those groups isn’t on your tee sheet — refresh and try again.' };
  const done = groups.find(g => g.status !== 'confirmed' || g.paymentStatus === 'paid' || g.paymentStatus === 'paid_offline');
  if (done) return { ok: false, status: 409, error: 'One of those groups has already paid or checked in — refresh and try again.' };

  const settled: { bookingId: string; name: string; amountCents: number }[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  const label = async (bookingId: string) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { golferName: true, players: true, checkedInPlayers: true, teeTime: { select: { time: true, holes: true } } } });
    const n = b.checkedInPlayers ?? b.players;
    return `${formatTeeTime(b.teeTime.time)} round · ${b.golferName} · ${n} player${n === 1 ? '' : 's'} · ${b.teeTime.holes} holes`;
  };
  // Walk-ins: booked onto the sheet, then paid here like any group.
  for (const w of walkIns) {
    const made = await createCounterBooking(courseId, { ...w, source: w.source ?? 'walk_in' }, opts.actor);
    if (!made.ok) { skipped.push(`Walk-in ${String(w.golferName ?? '').trim() || ''}: ${made.error}`.trim()); continue; }
    bookingIds.push(made.id);
  }
  for (const id of bookingIds) {
    const r = await settleAtCounter(courseId, id, { actor: opts.actor, actorName: opts.soldBy, checkedInPlayers: opts.headcounts?.[id] });
    if (!r.ok) { skipped.push(`${await label(id)}: ${r.error}`); continue; }
    if (r.note) notes.push(r.note);
    settled.push({ bookingId: id, name: await label(id), amountCents: r.amountCents });
  }
  if (!opts.lines.length && !settled.length) return { ok: false, status: 409, error: skipped.join(' ') || 'Nothing could be rung up.' };
  const saleInput = {
    courseId, lines: opts.lines, pay: 'cash' as const, soldBy: opts.soldBy, discount: opts.discount, taxCalculationId: opts.taxCalculationId, presetTax,
    // The cash covered what the screen showed; if a round dropped out, the change shown at the counter is what counts.
    cashTenderedCents: skipped.length ? undefined : opts.cashTenderedCents,
    rounds: settled, customerName: opts.customerName, customerPhone: opts.customerPhone, customerEmail: opts.customerEmail,
  };
  const saleFirst = createSale(saleInput);
  // The rounds are already paid: never leave them without a sale because of the change figure. A cash-handed-over
  // amount that doesn't cover the total is dropped (the sale is recorded without change) and said so.
  let sale = await saleFirst;
  if (!sale.ok && settled.length && opts.cashTenderedCents != null && opts.cashTenderedCents !== '' && /has to cover/.test(sale.error)) {
    sale = await createSale({ ...saleInput, cashTenderedCents: undefined });
    if (sale.ok) notes.push('The cash handed over was less than the total, so the sale was saved without the change figure.');
  }
  if (!sale.ok) {
    // The rounds are paid (checked in at the counter) even though the items couldn't be recorded.
    console.error(JSON.stringify({ ev: 'register.items_after_rounds.fail', courseId, settled: settled.map(s => s.bookingId), error: sale.error }));
    return { ok: false, status: sale.status, settled: settled.map(s => s.bookingId), error: `${settled.length ? `The ${settled.length === 1 ? 'round was' : `${settled.length} rounds were`} paid and checked in, but ` : ''}${sale.error.charAt(0).toLowerCase()}${sale.error.slice(1)}` };
  }
  const { payToken: _t, ...view } = sale.value;
  return { ok: true, value: { sale: view, skipped, notes } };
}
